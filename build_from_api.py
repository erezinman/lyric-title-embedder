#!/usr/bin/env python3
"""Build SRT variants from Suno's aligned_lyrics API response,
with sub-word and sub-line merging."""
import json, os

def fmt(t):
    if t < 0: t = 0
    h = int(t // 3600); m = int((t % 3600) // 60); s = int(t % 60)
    ms = int(round((t - int(t)) * 1000))
    if ms == 1000: s += 1; ms = 0
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

def write_srt(path, cues):
    with open(path, "w", encoding="utf-8") as f:
        for i, (text, s, e) in enumerate(cues, 1):
            if e <= s: e = s + 0.05
            f.write(f"{i}\n{fmt(s)} --> {fmt(e)}\n{text}\n\n")

base = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(base, "aligned_lyrics.json")))

# ─────────────────────────────────────────────────────────────────────
# 1. Merge flat aligned_words sub-word splits.
#    A token is a continuation if the previous token did NOT end with whitespace.
# ─────────────────────────────────────────────────────────────────────
def merge_flat_words(toks):
    out = []
    for t in toks:
        w = t["word"]
        if not w.strip():
            continue
        if out and out[-1]["word"] and not out[-1]["word"][-1:].isspace():
            out[-1]["word"] += w
            out[-1]["end_s"] = t["end_s"]
        else:
            out.append({"word": w, "start_s": t["start_s"], "end_s": t["end_s"]})
    return out

merged_words = merge_flat_words(data["aligned_words"])
word_cues = []
for w in merged_words:
    txt = w["word"].replace("\n", " ").strip()
    if not txt: continue
    word_cues.append((txt, w["start_s"], w["end_s"]))
write_srt(os.path.join(base, "bleating_words.srt"), word_cues)

# ─────────────────────────────────────────────────────────────────────
# 2. Reconstruct real lyric lines by merging consecutive aligned_lyrics
#    entries when the next entry is a continuation (starts with lowercase).
#    Join glue is decided by the leading-space of the next line's first
#    sub-word token: leading-space => " ", else "" (mid-word split).
# ─────────────────────────────────────────────────────────────────────
def is_continuation(prev_text, next_entry):
    nxt = next_entry.get("text", "").strip()
    if not nxt: return False
    # Only merge if it starts with a lowercase letter — preserves "*Baa",
    # quoted lines, section markers, capitalized lines.
    return nxt[:1].islower()

def join_glue(next_entry):
    toks = next_entry.get("words") or []
    first = toks[0]["text"] if toks else next_entry.get("text", "")
    return " " if first[:1].isspace() else ""

raw_lines = [l for l in data["aligned_lyrics"] if l.get("text","").strip()]
real_lines = []  # list of {text, start_s, end_s, section}
for l in raw_lines:
    if real_lines and is_continuation(real_lines[-1]["text"], l):
        glue = join_glue(l)
        real_lines[-1]["text"] = real_lines[-1]["text"] + glue + l["text"]
        real_lines[-1]["end_s"] = l["end_s"]
    else:
        real_lines.append({
            "text": l["text"],
            "start_s": l["start_s"],
            "end_s": l["end_s"],
            "section": l.get("section") or "Unknown",
            # Carry the original entries so v5 can iterate true sub-word timings
            "_entries": [l],
        })
        continue
    real_lines[-1]["_entries"].append(l)

line_cues = [(l["text"], l["start_s"], l["end_s"]) for l in real_lines]
write_srt(os.path.join(base, "bleating_lines.srt"), line_cues)

# ─────────────────────────────────────────────────────────────────────
# 3. v1: combine by section
# ─────────────────────────────────────────────────────────────────────
sections = []
for l in real_lines:
    if sections and sections[-1][0] == l["section"]:
        sections[-1][1].append(l["text"]); sections[-1][3] = l["end_s"]
    else:
        sections.append([l["section"], [l["text"]], l["start_s"], l["end_s"]])
v1 = [("\n".join(lns), s, e) for _, lns, s, e in sections]
write_srt(os.path.join(base, "bleating_v1_by_section_api.srt"), v1)

# ─────────────────────────────────────────────────────────────────────
# 4. v2: non-overlapping line pairs
# ─────────────────────────────────────────────────────────────────────
v2 = []
i = 0
while i < len(line_cues):
    a = line_cues[i]
    if i+1 < len(line_cues):
        b = line_cues[i+1]
        v2.append((a[0] + "\n" + b[0], a[1], b[2])); i += 2
    else:
        v2.append(a); i += 1
write_srt(os.path.join(base, "bleating_v2_pairs_api.srt"), v2)

# ─────────────────────────────────────────────────────────────────────
# 5. v3: sliding line pairs
# ─────────────────────────────────────────────────────────────────────
v3 = [(line_cues[i][0] + "\n" + line_cues[i+1][0], line_cues[i][1], line_cues[i+1][2])
      for i in range(len(line_cues)-1)]
write_srt(os.path.join(base, "bleating_v3_sliding_pairs_api.srt"), v3)

# ─────────────────────────────────────────────────────────────────────
# 6. v4: cumulative lines within section
# ─────────────────────────────────────────────────────────────────────
v4 = []
cur_sec = None; buf = []
for l in real_lines:
    if l["section"] != cur_sec:
        cur_sec = l["section"]; buf = []
    buf.append(l["text"])
    v4.append(("\n".join(buf), l["start_s"], l["end_s"]))
write_srt(os.path.join(base, "bleating_v4_cumulative_api.srt"), v4)

# ─────────────────────────────────────────────────────────────────────
# 7. v5: word-by-word accumulation within section (sub-words merged).
#    Walk the original aligned_lyrics sub-word tokens of each real line,
#    merging adjacent tokens into whole words by leading-space rule.
# ─────────────────────────────────────────────────────────────────────
def merge_subwords_to_words(toks):
    out = []
    for tok in toks:
        txt = tok["text"]
        if not txt: continue
        if not out or txt[:1].isspace():
            out.append({"text": txt, "start_s": tok["start_s"], "end_s": tok["end_s"]})
        else:
            out[-1]["text"] += txt; out[-1]["end_s"] = tok["end_s"]
    return out

# Each cue persists (no blank gap) until the NEXT word appears; the final
# accumulation of a section holds until the next section's first word starts.
v5_raw = []  # (display, start_s, own_end_s)
cur_sec = None; prev_lines = []
for l in real_lines:
    if l["section"] != cur_sec:
        cur_sec = l["section"]; prev_lines = []
    flat_toks = []
    for entry in l["_entries"]:
        flat_toks.extend(entry.get("words") or [])
    partial = ""
    for w in merge_subwords_to_words(flat_toks):
        partial += w["text"]
        display = "\n".join(prev_lines + [partial.lstrip()])
        v5_raw.append([display, w["start_s"], w["end_s"]])
    prev_lines.append(l["text"])

# Stretch each cue's end to the next cue's start so text never disappears
# mid-accumulation; last cue keeps its own end.
v5 = []
for i, (disp, s, own_end) in enumerate(v5_raw):
    end = v5_raw[i+1][1] if i+1 < len(v5_raw) else own_end
    if end < own_end: end = own_end
    v5.append((disp, s, end))
write_srt(os.path.join(base, "bleating_v5_word_accum_api.srt"), v5)

print(f"words (merged): {len(word_cues)} cues")
print(f"real lines:     {len(line_cues)} cues  (was 76)")
print(f"v1 sections:    {len(v1)} cues")
print(f"v2 pairs:       {len(v2)} cues")
print(f"v3 sliding:     {len(v3)} cues")
print(f"v4 cumulative:  {len(v4)} cues")
print(f"v5 word-accum:  {len(v5)} cues")
