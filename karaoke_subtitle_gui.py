#!/usr/bin/env python3
"""Karaoke Subtitle Studio — standalone dialog that turns Suno aligned-lyrics
into an ASS subtitle with per-word fade-in. Controls sit alongside a live,
draggable on-frame preview; optional ffmpeg burn-in.

Stdlib only (tkinter, Tk 8.6 PNG). Needs ffmpeg+libass on PATH for exact
preview / burn; fc-list (fontconfig) for the font picker.

Run:  python3 karaoke_subtitle_gui.py
"""
import json, os, re, shutil, subprocess, tempfile, threading
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, colorchooser
import tkinter.font as tkfont
import customtkinter as ctk

ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

HERE = os.path.dirname(os.path.abspath(__file__))
FFMPEG = shutil.which("ffmpeg") or "/usr/bin/ffmpeg"
FFPROBE = shutil.which("ffprobe") or "/usr/bin/ffprobe"
HAS_FFMPEG = os.path.isfile(FFMPEG)
FC_LIST = shutil.which("fc-list")
FC_MATCH = shutil.which("fc-match")
# libass renders ~0.78 × Fontsize of visible ink height, independent of font
# (it normalizes by font height). FreeType's ink-per-pixel varies per font, so
# the Tk pixel size that matches libass is 0.78×Fontsize / (FreeType ink ratio).
LIBASS_INK_AT_100 = 78.0

# ─────────────────────────────────────────────────────────────────────
# Core: aligned_lyrics.json  →  ASS
# ─────────────────────────────────────────────────────────────────────
def merge_subwords(toks):
    out = []
    for tok in toks:
        txt = tok.get("text", "")
        if not txt:
            continue
        if not out or txt[:1].isspace():
            out.append({"text": txt, "start_s": tok["start_s"], "end_s": tok["end_s"]})
        else:
            out[-1]["text"] += txt
            out[-1]["end_s"] = tok["end_s"]
    return out

def reconstruct_lines(aligned):
    def is_cont(nxt):
        t = nxt.get("text", "").strip()
        return bool(t) and t[:1].islower()
    def glue(nxt):
        toks = nxt.get("words") or []
        first = toks[0]["text"] if toks else nxt.get("text", "")
        return " " if first[:1].isspace() else ""
    raw = [l for l in aligned if l.get("text", "").strip()]
    real = []
    for l in raw:
        if real and is_cont(l):
            real[-1]["text"] += glue(l) + l["text"]
            real[-1]["end_s"] = l["end_s"]
            real[-1]["_entries"].append(l)
        else:
            real.append({"text": l["text"], "start_s": l["start_s"], "end_s": l["end_s"],
                         "section": l.get("section") or "Unknown", "_entries": [l]})
    return real

def ass_time(t):
    t = max(0, t)
    h = int(t // 3600); m = int((t % 3600) // 60); s = t % 60
    cs = int(round((s - int(s)) * 100)); s = int(s)
    if cs == 100: s += 1; cs = 0
    return f"{h:d}:{m:02d}:{s:02d}.{cs:02d}"

def esc(s):
    return s.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")

def rgb_to_ass(hex_color, alpha_hex="00"):
    h = hex_color.lstrip("#")
    return f"&H{alpha_hex}{h[4:6]}{h[2:4]}{h[0:2]}".upper()

def is_dashes(t):
    return bool(re.fullmatch(r"-+", t.strip()))

def make_groups(real, group_by, skip_dashes):
    groups = []
    for l in real:
        if skip_dashes and is_dashes(l["text"]):
            continue
        if group_by == "section" and groups and groups[-1]["key"] == l["section"]:
            groups[-1]["lines"].append(l); groups[-1]["end"] = l["end_s"]
        else:
            key = l["section"] if group_by == "section" else id(l)
            groups.append({"key": key, "start": l["start_s"], "end": l["end_s"], "lines": [l]})
    return groups

def load_groups(cfg):
    data = json.load(open(cfg["json_path"], encoding="utf-8"))
    real = reconstruct_lines(data.get("aligned_lyrics") or [])
    return make_groups(real, cfg["group_by"], cfg["skip_dashes"])

def build_ass(cfg, groups):
    """groups = render-groups: {start, end, accumulate, lines:[{words:[{text,start_s,end_s}]}]}."""
    pos = cfg.get("pos")  # (x, y) in play-res for absolute \pos placement, or None
    pos_tag = f"{{\\pos({int(pos[0])},{int(pos[1])})}}" if pos else ""
    fade = cfg["fade_ms"]

    def event_text(group):
        ev_start = group["start"]; mode = group.get("accumulate", "words"); parts = [pos_tag]
        dur_ms = int(round((group["end"] - ev_start) * 1000))
        g_fout = int(group.get("fade_out", 0) or 0)

        for li, line in enumerate(group["lines"]):
            if li: parts.append("\\N")
            ws = line["words"]
            if not ws: continue
            # Fade-out for THIS line: its own scheduled time wins; else the
            # group-level fade-out at the event end; else none. Either way the
            # line keeps its row, so other lines don't move.
            lf = line.get("fout_at")
            if lf is not None:
                ro = max(0, int(round((lf - ev_start) * 1000)))
                rd = int(line.get("fout_ms") or 1000)
                out = f"\\t({ro},{ro + rd},\\alpha&HFF&)"
            elif g_fout > 0:
                out = f"\\t({max(0, dur_ms - g_fout)},{dur_ms},\\alpha&HFF&)"
            else:
                out = ""

            def tag_in(rel):   # transparent -> opaque over fade-in, then optional fade-out
                if fade > 0:
                    return "{\\alpha&HFF&" + f"\\t({rel},{rel + fade},\\alpha&H00&)" + out + "}"
                return "{\\alpha&H00&" + out + "}"

            if mode == "words":                       # word-by-word fade-in (v5)
                for w in ws:
                    rel = max(0, int(round((w["start_s"] - ev_start) * 1000)))
                    parts.append(tag_in(rel) + esc(w["text"]))
            elif mode == "lines":                     # whole line fades at its first word (v4)
                rel = max(0, int(round((ws[0]["start_s"] - ev_start) * 1000)))
                parts.append(tag_in(rel) + "".join(esc(w["text"]) for w in ws))
            else:                                     # off — all visible for the window
                parts.append("{\\alpha&H00&" + out + "}" + "".join(esc(w["text"]) for w in ws))
        return "".join(parts)

    primary = rgb_to_ass(cfg["primary_color"])
    outline = rgb_to_ass(cfg["outline_color"])
    back    = rgb_to_ass(cfg["back_color"], cfg["back_alpha"])
    bold    = -1 if cfg["bold"] else 0
    header = (
        "[Script Info]\n; Karaoke Subtitle Studio\nScriptType: v4.00+\n"
        f"PlayResX: {cfg['play_w']}\nPlayResY: {cfg['play_h']}\n"
        f"WrapStyle: {cfg['wrap_style']}\nScaledBorderAndShadow: yes\n\n"
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, "
        "BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, "
        "BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"Style: Default,{cfg['font']},{cfg['fontsize']},{primary},&H000000FF,{outline},{back},"
        f"{bold},0,0,0,100,100,0,0,{cfg['border_style']},{cfg['outline_w']},{cfg['shadow']},"
        f"{cfg['align']},{cfg['margin_l']},{cfg['margin_r']},{cfg['margin_v']},1\n\n"
        "[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )
    out = [header]
    for g in groups:
        out.append(f"Dialogue: 0,{ass_time(g['start'])},{ass_time(g['end'])},Default,,0,0,0,,{event_text(g)}\n")
    return "".join(out), len(groups)

def full_text_at(groups, t):
    """Full text (ALL words) of the event active at t — fixed layout."""
    for g in groups:
        if g["start"] <= t <= g["end"]:
            return "\n".join("".join(w["text"] for w in line["words"]).strip()
                             for line in g["lines"])
    return ""

def total_duration(groups):
    return (groups[-1]["end"] + 2.0) if groups else 10.0

# ─────────────────────────────────────────────────────────────────────
# Editable cue project  (Group → Line → Token → canonical Word)
#   words : immutable list of canonical atoms {text, start, end}
#   token : {ids:[word-index,...], sep:""|" ", del:bool}  (merge/soft-delete)
#   line  : [token, ...]      group: {label, accumulate, shift, win_start,
#                                     win_end, del, lines:[line,...]}
# Every edit is reversible (soft del, ids preserved) and serializable.
# ─────────────────────────────────────────────────────────────────────
def token_text(words, tok):
    parts = [words[i]["text"] for i in tok["ids"]]
    if len(parts) == 1:
        return parts[0]
    joiner = " " if tok.get("sep") == " " else ""
    core = joiner.join(p.strip() for p in parts)
    lead = " " if parts[0][:1] == " " else ""
    trail = " " if parts[-1][-1:] == " " else ""
    return lead + core + trail

def token_span(words, tok):
    ss = [words[i]["start"] for i in tok["ids"]]
    es = [words[i]["end"] for i in tok["ids"]]
    return min(ss), max(es)

def make_project(cfg):
    """Build the default editable project from aligned_lyrics."""
    data = json.load(open(cfg["json_path"], encoding="utf-8"))
    real = reconstruct_lines(data.get("aligned_lyrics") or [])
    words, line_specs = [], []
    for l in real:
        if cfg.get("skip_dashes", True) and is_dashes(l["text"]):
            continue
        flat = []
        for e in l["_entries"]:
            flat.extend(e.get("words") or [])
        toks = []
        for w in merge_subwords(flat):
            words.append({"text": w["text"], "start": w["start_s"], "end": w["end_s"]})
            toks.append({"ids": [len(words) - 1], "sep": "", "del": False})
        if toks:
            line_specs.append((l.get("section") or "Unknown", new_line(toks)))
    groups = []
    for sec, line in line_specs:
        if cfg.get("group_by") == "section" and groups and groups[-1]["label"] == sec:
            groups[-1]["lines"].append(line)
        else:
            groups.append({"label": sec, "lines": [line], "accumulate": "words",
                           "shift": 0.0, "win_start": None, "win_end": None,
                           "fade_out": 0.0, "linger": 0.0, "del": False})
    return {"words": words, "groups": groups}

def new_line(toks, fout_at=None, fout_ms=1000.0):
    """A line: its tokens plus an optional independent fade-out (source-time
    seconds + duration ms). When set, this line fades out on its own while the
    rest of the group keeps its layout."""
    return {"toks": toks, "fout_at": fout_at, "fout_ms": fout_ms}

def project_to_render(project):
    """Flatten the editable project into render-groups for build_ass / preview.
    Skips soft-deleted groups/tokens and empty lines/groups."""
    words = project["words"]
    out = []
    for g in project["groups"]:
        if g.get("del"):
            continue
        shift = g.get("shift", 0.0)
        rlines, allspans = [], []
        for line in g["lines"]:
            rws = []
            for tok in line["toks"]:
                if tok.get("del"):
                    continue
                s, e = token_span(words, tok)
                rws.append({"text": token_text(words, tok), "start_s": s + shift, "end_s": e + shift})
                allspans.append((s + shift, e + shift))
            if rws:
                lf = line.get("fout_at")
                rlines.append({"words": rws,
                               "fout_at": (lf + shift) if lf is not None else None,
                               "fout_ms": line.get("fout_ms", 1000.0)})
        if not rlines:
            continue
        base_s = min(s for s, _ in allspans)
        base_e = max(e for _, e in allspans)
        linger = g.get("linger", 0.0)
        ev_s = g["win_start"] if g.get("win_start") is not None else base_s
        ev_e = g["win_end"] if g.get("win_end") is not None else base_e + linger
        out.append({"start": ev_s, "end": ev_e, "accumulate": g.get("accumulate", "words"),
                    "fade_out": g.get("fade_out", 0.0), "lines": rlines})
    out.sort(key=lambda r: r["start"])
    return out

def _ser_line(line):
    return {"toks": [{"ids": list(t["ids"]), "sep": t.get("sep", ""), "del": t.get("del", False)}
                     for t in line["toks"]],
            "fout_at": line.get("fout_at"), "fout_ms": line.get("fout_ms", 1000.0)}

def _deser_line(d):
    # tolerate legacy presets where a line was a bare token-list
    if isinstance(d, list):
        return new_line([{"ids": list(t["ids"]), "sep": t.get("sep", ""),
                          "del": t.get("del", False)} for t in d])
    toks = [{"ids": list(t["ids"]), "sep": t.get("sep", ""), "del": t.get("del", False)}
            for t in d.get("toks", [])]
    return new_line(toks, d.get("fout_at"), d.get("fout_ms", 1000.0))

def serialize_cues(project):
    return {"nwords": len(project["words"]),
            "groups": [{"label": g.get("label", ""), "accumulate": g.get("accumulate", "words"),
                        "shift": g.get("shift", 0.0), "win_start": g.get("win_start"),
                        "win_end": g.get("win_end"), "fade_out": g.get("fade_out", 0.0),
                        "linger": g.get("linger", 0.0), "del": g.get("del", False),
                        "lines": [_ser_line(line) for line in g["lines"]]}
                       for g in project["groups"]]}

def apply_cues(project, d):
    """Overlay a saved cue structure onto a freshly-built project (same source)."""
    if not d or d.get("nwords") != len(project["words"]):
        return False
    gs = []
    for g in d.get("groups", []):
        gs.append({"label": g.get("label", ""), "accumulate": g.get("accumulate", "words"),
                   "shift": g.get("shift", 0.0), "win_start": g.get("win_start"),
                   "win_end": g.get("win_end"), "fade_out": g.get("fade_out", 0.0),
                   "linger": g.get("linger", 0.0), "del": g.get("del", False),
                   "lines": [_deser_line(line) for line in g["lines"]]})
    if gs:
        project["groups"] = gs
    return True

def list_font_families():
    if FC_LIST:
        try:
            out = subprocess.run([FC_LIST, ":", "family"], capture_output=True, text=True, timeout=8).stdout
            fams = set()
            for line in out.splitlines():
                fams.add(line.split(",")[0].strip())
            fams = sorted(f for f in fams if f)
            if fams:
                return fams
        except Exception:
            pass
    try:
        return sorted(set(tkfont.families()))
    except Exception:
        return ["Arial", "DejaVu Sans", "Sans"]


# ─────────────────────────────────────────────────────────────────────
# GUI
# ─────────────────────────────────────────────────────────────────────
ALIGN_LABELS = {
    "Bottom-Left (1)": 1, "Bottom-Center (2)": 2, "Bottom-Right (3)": 3,
    "Middle-Left (4)": 4, "Middle-Center (5)": 5, "Middle-Right (6)": 6,
    "Top-Left (7)": 7, "Top-Center (8)": 8, "Top-Right (9)": 9,
}
ANCHOR = {1: "sw", 2: "s", 3: "se", 4: "w", 5: "center", 6: "e", 7: "nw", 8: "n", 9: "ne"}
PREVIEW_W = 720
HANDLE = 7


# ── customtkinter helpers (encapsulate the ctk vs ttk API differences) ──
def ctk_labelframe(parent, title):
    """A titled card. Returns (outer, body); pack `outer`, put children in `body`."""
    outer = ctk.CTkFrame(parent)
    ctk.CTkLabel(outer, text=title, anchor="w",
                 font=ctk.CTkFont(size=13, weight="bold")).pack(fill="x", padx=10, pady=(6, 2))
    body = ctk.CTkFrame(outer, fg_color="transparent")
    body.pack(fill="both", expand=True, padx=6, pady=(0, 8))
    return outer, body

def ctk_spin(parent, var, lo, hi, command=None, width=64):
    """Integer spinbox: entry + −/+ buttons (ctk has no Spinbox)."""
    fr = ctk.CTkFrame(parent, fg_color="transparent")
    e = ctk.CTkEntry(fr, textvariable=var, width=width); e.pack(side="left")
    def bump(d):
        try:
            cur = int(float(var.get()))
        except (ValueError, tk.TclError):
            cur = lo
        var.set(max(lo, min(hi, cur + d)))
        if command:
            command()
    ctk.CTkButton(fr, text="−", width=26, command=lambda: bump(-1)).pack(side="left", padx=(4, 0))
    ctk.CTkButton(fr, text="+", width=26, command=lambda: bump(1)).pack(side="left", padx=(2, 0))
    if command:
        e.bind("<Return>", lambda *_: command())
        e.bind("<FocusOut>", lambda *_: command())
    return fr


class App(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("Karaoke Subtitle Studio")
        self.geometry("1280x820")
        self.minsize(1100, 700)
        self._color = {"primary": "#FFFFFF", "outline": "#000000", "back": "#000000"}
        self._bg_photo = None      # clean video frame (no subtitles), or None
        self._bg_key = None
        self._exact_photo = None   # transient libass-burned frame
        self._groups = None       # render-groups (derived from project)
        self._project = None      # editable cue project (source of truth)
        self._editor = None       # CueEditor Toplevel, if open
        self._drag = None
        self._fonts = None
        self._ffac = {}   # cache: font family -> Tk/libass pixel-size factor
        self._build()
        self.after(200, self._reload_groups)

    # ── layout: controls (left, scrollable) | preview (right) ──
    def _build(self):
        self.toolbar = ctk.CTkFrame(self)   # top toolbar; subclasses may populate it
        main = ctk.CTkFrame(self, fg_color="transparent"); main.pack(fill="both", expand=True, padx=6, pady=6)
        self._main = main
        main.grid_columnconfigure(0, weight=0)
        main.grid_columnconfigure(1, weight=1)
        main.grid_rowconfigure(0, weight=1)
        controls = ctk.CTkScrollableFrame(main, width=500, label_text="")
        controls.grid(row=0, column=0, sticky="nsew", padx=(0, 6))
        right = ctk.CTkFrame(main, fg_color="transparent")
        right.grid(row=0, column=1, sticky="nsew")

        self._build_io(controls)
        self._build_style(controls)
        self._build_preview(right)
        self._bind_mousewheel(controls)  # CTkScrollableFrame wheel is flaky on Linux

        bar = ctk.CTkFrame(self, fg_color="transparent"); bar.pack(fill="x", padx=8, pady=(0, 6))
        ctk.CTkButton(bar, text="Edit cues…", command=self.open_editor).pack(side="left")
        ctk.CTkButton(bar, text="Generate .ass", command=self.on_generate).pack(side="left", padx=6)
        ctk.CTkButton(bar, text="Generate + Burn video", command=self.on_burn).pack(side="left", padx=6)
        ctk.CTkButton(bar, text="Save preset", command=self.on_save_preset).pack(side="left", padx=6)
        ctk.CTkButton(bar, text="Load preset", command=self.on_load_preset).pack(side="left")
        ctk.CTkButton(bar, text="Quit", fg_color="#883333", hover_color="#aa4444",
                      command=self.destroy).pack(side="right")
        pf = ctk.CTkFrame(self, fg_color="transparent"); pf.pack(fill="x", padx=8, pady=(0, 2))
        self.prog = ctk.CTkProgressBar(pf); self.prog.set(0)
        self.prog.pack(side="left", fill="x", expand=True, pady=4)
        self.prog_lbl = ctk.CTkLabel(pf, text="", width=110, anchor="w"); self.prog_lbl.pack(side="left", padx=6)
        self.status = ctk.CTkTextbox(self, height=88, wrap="word", text_color="#3fdc3f")
        self.status.pack(fill="x", padx=8, pady=(0, 8))
        self.status.configure(state="disabled")
        if not HAS_FFMPEG:
            self.log("⚠ ffmpeg not found — exact preview/burn disabled; tkinter approximation only.")

    def _bind_mousewheel(self, scroll_frame):
        """Bind wheel scrolling on a CTkScrollableFrame and all its descendants
        (ctk's built-in binding misses child widgets on Linux)."""
        canvas = getattr(scroll_frame, "_parent_canvas", None)
        if canvas is None:
            return
        def on_wheel(e):
            if getattr(e, "num", None) == 4 or getattr(e, "delta", 0) > 0:
                canvas.yview_scroll(-1, "units")
            elif getattr(e, "num", None) == 5 or getattr(e, "delta", 0) < 0:
                canvas.yview_scroll(1, "units")
        def bind_tree(w):
            for seq in ("<MouseWheel>", "<Button-4>", "<Button-5>"):
                w.bind(seq, on_wheel, add="+")
            for c in w.winfo_children():
                bind_tree(c)
        bind_tree(scroll_frame)

    def _build_io(self, parent):
        outer, f = ctk_labelframe(parent, "Input / Output"); outer.pack(fill="x", padx=8, pady=6)
        self.json_var = tk.StringVar(value=os.path.join(HERE, "aligned_lyrics.json"))
        self.ass_var  = tk.StringVar(value=os.path.join(HERE, "karaoke.ass"))
        self.vid_var  = tk.StringVar(value="")
        self.out_var  = tk.StringVar(value=os.path.join(HERE, "out.mp4"))
        rows = [("aligned_lyrics.json", self.json_var, "open", [("JSON", "*.json")]),
                ("Output .ass", self.ass_var, "save", ".ass"),
                ("Input video (optional)", self.vid_var, "open", [("Video", "*.mp4 *.mov *.mkv *.webm"), ("All", "*.*")]),
                ("Output video", self.out_var, "save", ".mp4")]
        for r, (lab, var, kind, arg) in enumerate(rows):
            ctk.CTkLabel(f, text=lab, anchor="w").grid(row=r, column=0, sticky="w", padx=6, pady=3)
            ctk.CTkEntry(f, textvariable=var, width=250).grid(row=r, column=1, padx=4)
            cmd = (lambda v=var, a=arg: self._pick(v, a)) if kind == "open" else (lambda v=var, a=arg: self._save(v, a))
            ctk.CTkButton(f, text="…", width=30, command=cmd).grid(row=r, column=2)
        self.vid_var.trace_add("write", lambda *_: (self._update_bg(), self._refresh_preview()))
        self.json_var.trace_add("write", lambda *_: self._reload_groups())

    def _build_style(self, parent):
        outer, f = ctk_labelframe(parent, "Style"); outer.pack(fill="x", padx=8, pady=6)
        pad = {"padx": 6, "pady": 3}
        self.font_var   = tk.StringVar(value="DejaVu Sans")
        self.size_var   = tk.IntVar(value=64)
        self.bold_var   = tk.BooleanVar(value=True)
        self.align_var  = tk.StringVar(value="Bottom-Center (2)")
        self.fade_var   = tk.IntVar(value=250)
        self.group_var  = tk.StringVar(value="section")
        self.skip_var   = tk.BooleanVar(value=True)
        self.pos_var    = tk.BooleanVar(value=True)
        self.pw_var     = tk.IntVar(value=1920)
        self.ph_var     = tk.IntVar(value=1080)
        self.ml_var     = tk.IntVar(value=80)
        self.mr_var     = tk.IntVar(value=80)
        self.mv_var     = tk.IntVar(value=60)
        self.outline_var= tk.IntVar(value=3)
        self.shadow_var = tk.IntVar(value=0)
        self.border_var = tk.IntVar(value=1)
        self.backa_var  = tk.StringVar(value="80")

        def L(t, r): ctk.CTkLabel(f, text=t, anchor="w").grid(row=r, column=0, sticky="w", **pad)
        def S(v, a, b, r, cmd=None):
            ctk_spin(f, v, a, b, command=(cmd or self._refresh_preview)).grid(row=r, column=1, sticky="w", **pad)
        r = 0
        L("Font family", r)
        fr = ctk.CTkFrame(f, fg_color="transparent"); fr.grid(row=r, column=1, columnspan=2, sticky="w", **pad)
        self.font_combo = ctk.CTkComboBox(fr, variable=self.font_var, width=170,
                                          command=lambda *_: self._refresh_preview())
        self.font_combo.pack(side="left")
        ctk.CTkButton(fr, text="Choose…", width=70, command=self._choose_font).pack(side="left", padx=4); r += 1
        L("Font size", r); S(self.size_var, 8, 300, r); r += 1
        L("Bold", r); ctk.CTkCheckBox(f, text="", variable=self.bold_var, command=self._refresh_preview).grid(row=r, column=1, sticky="w", **pad); r += 1
        L("Alignment (anchor)", r)
        ctk.CTkOptionMenu(f, variable=self.align_var, values=list(ALIGN_LABELS), width=170,
                          command=lambda *_: self._on_align()).grid(row=r, column=1, sticky="w", **pad); r += 1
        L("Free placement (\\pos)", r); ctk.CTkCheckBox(f, text="", variable=self.pos_var, command=self._refresh_preview).grid(row=r, column=1, sticky="w", **pad); r += 1
        L("Fade-in (ms/word)", r); S(self.fade_var, 0, 3000, r); r += 1
        L("Group by", r)
        ctk.CTkOptionMenu(f, variable=self.group_var, values=["section", "line"], width=110,
                          command=lambda *_: self._reload_groups()).grid(row=r, column=1, sticky="w", **pad); r += 1
        L("Skip '---' lines", r); ctk.CTkCheckBox(f, text="", variable=self.skip_var, command=self._reload_groups).grid(row=r, column=1, sticky="w", **pad); r += 1
        L("Canvas W × H", r)
        wh = ctk.CTkFrame(f, fg_color="transparent"); wh.grid(row=r, column=1, columnspan=2, sticky="w", **pad)
        ctk_spin(wh, self.pw_var, 320, 7680, command=self._resync_canvas, width=60).pack(side="left")
        ctk.CTkLabel(wh, text="×").pack(side="left", padx=4)
        ctk_spin(wh, self.ph_var, 240, 4320, command=self._resync_canvas, width=60).pack(side="left"); r += 1
        for lab, v in (("Margin L", self.ml_var), ("Margin R", self.mr_var), ("Margin V", self.mv_var)):
            L(lab, r); S(v, 0, 2000, r, cmd=lambda: (self._box_from_margins(), self._refresh_preview())); r += 1
        L("Text color", r)
        self.b1 = ctk.CTkButton(f, text="", width=44, fg_color=self._color["primary"],
                                command=lambda: self._pick_color("primary", self.b1))
        self.b1.grid(row=r, column=1, sticky="w", **pad); r += 1
        L("Outline color", r)
        self.b2 = ctk.CTkButton(f, text="", width=44, fg_color=self._color["outline"],
                                command=lambda: self._pick_color("outline", self.b2))
        self.b2.grid(row=r, column=1, sticky="w", **pad); r += 1
        L("Box/shadow color", r)
        self.b3 = ctk.CTkButton(f, text="", width=44, fg_color=self._color["back"],
                                command=lambda: self._pick_color("back", self.b3))
        self.b3.grid(row=r, column=1, sticky="w", **pad); r += 1
        L("Box alpha (00…FF)", r); ctk.CTkEntry(f, textvariable=self.backa_var, width=64).grid(row=r, column=1, sticky="w", **pad); r += 1
        L("Border (1=outline,3=box)", r); S(self.border_var, 1, 3, r); r += 1
        L("Outline width", r); S(self.outline_var, 0, 20, r); r += 1
        L("Shadow depth", r); S(self.shadow_var, 0, 20, r); r += 1

    def _build_preview(self, parent):
        top = ctk.CTkFrame(parent, fg_color="transparent"); top.pack(fill="x", padx=6, pady=4)
        ctk.CTkLabel(top, text="Time").pack(side="left")
        self.time_var = tk.DoubleVar(value=13.0)
        self.time_scale = ctk.CTkSlider(top, from_=0, to=60, variable=self.time_var,
                                        command=lambda *_: self._on_time())
        self.time_scale.pack(side="left", fill="x", expand=True, padx=6)
        self.time_scale.bind("<ButtonRelease-1>", lambda e: self._on_release_time())
        self.time_lbl = ctk.CTkLabel(top, text="0:13.0", width=64); self.time_lbl.pack(side="left")
        self.auto_var = tk.BooleanVar(value=True)
        ctk.CTkCheckBox(top, text="Auto (libass)", variable=self.auto_var).pack(side="left", padx=4)
        ctk.CTkButton(top, text="Render now", width=90, command=self._render_exact).pack(side="left", padx=4)

        ph, pw = self.ph_var.get(), self.pw_var.get()
        self.canvas_h = int(round(PREVIEW_W * ph / pw))
        self.canvas = tk.Canvas(parent, width=PREVIEW_W, height=self.canvas_h, bg="#202024",
                                highlightthickness=1, highlightbackground="#555")
        self.canvas.pack(padx=6, pady=6)
        self.canvas.bind("<ButtonPress-1>", self._press)
        self.canvas.bind("<B1-Motion>", self._motion)
        self.canvas.bind("<ButtonRelease-1>", self._release)
        ctk.CTkLabel(parent, text_color="#888", justify="left",
                     text="Drag inside the box to MOVE • drag a corner/edge handle to RESIZE.\n"
                          "Free placement (\\pos) gives full vertical control; the dashed box anchors the text.").pack()
        self.box = [PREVIEW_W * 0.1, self.canvas_h * 0.75, PREVIEW_W * 0.9, self.canvas_h * 0.92]

    # ── data ──
    def _reload_groups(self):
        if not os.path.isfile(self.json_var.get()):
            return
        try:
            self._project = make_project(self.cfg())
            self._rebuild_render()
            self._box_from_margins()
            self._refresh_preview()
        except Exception as e:
            self.log(f"✗ load: {e}")

    def _rebuild_render(self):
        """Recompute render-groups from the project and refresh everything."""
        self._groups = project_to_render(self._project) if self._project else []
        if hasattr(self, "time_scale"):
            self.time_scale.configure(to=round(total_duration(self._groups), 1))
        self._refresh_preview()
        if self._editor is not None and self._editor.winfo_exists():
            self._editor.reload()

    # ── project (cue) mutations — all reversible, operate on self._project ──
    def proj_group(self, gidxs):
        gs = self._project["groups"]; idx = sorted(set(gidxs))
        if len(idx) < 2 or idx != list(range(idx[0], idx[-1] + 1)):
            self.log("Group: select adjacent groups"); return
        first = gs[idx[0]]
        lines = [ln for gi in idx for ln in gs[gi]["lines"]]
        merged = {"label": first["label"], "lines": lines, "accumulate": first["accumulate"],
                  "shift": first["shift"], "win_start": None, "win_end": None,
                  "fade_out": first.get("fade_out", 0.0), "linger": first.get("linger", 0.0), "del": False}
        self._project["groups"] = gs[:idx[0]] + [merged] + gs[idx[-1] + 1:]
        self._rebuild_render()

    def proj_ungroup(self, gidx):
        gs = self._project["groups"]; g = gs[gidx]
        new = [{"label": g["label"], "lines": [ln], "accumulate": g["accumulate"],
                "shift": g["shift"], "win_start": None, "win_end": None,
                "fade_out": g.get("fade_out", 0.0), "linger": g.get("linger", 0.0), "del": False}
               for ln in g["lines"]]
        self._project["groups"] = gs[:gidx] + new + gs[gidx + 1:]
        self._rebuild_render()

    def proj_group_del(self, gidxs, value):
        for gi in set(gidxs):
            self._project["groups"][gi]["del"] = value
        self._rebuild_render()

    def proj_set_accumulate(self, gidxs, mode):
        for gi in set(gidxs):
            self._project["groups"][gi]["accumulate"] = mode
        self._rebuild_render()

    def proj_set_timing(self, gidx, win_start, win_end, shift, fade_out=None, linger=None):
        g = self._project["groups"][gidx]
        g["win_start"] = win_start; g["win_end"] = win_end; g["shift"] = shift
        if fade_out is not None:
            g["fade_out"] = fade_out
        if linger is not None:
            g["linger"] = linger
        self._rebuild_render()

    def proj_set_line_fadeout(self, gidx, lidxs, at, ms=1000.0):
        """Schedule (or clear, at=None) an independent fade-out for line(s)."""
        g = self._project["groups"][gidx]
        for li in lidxs:
            g["lines"][li]["fout_at"] = at
            if at is not None:
                g["lines"][li]["fout_ms"] = ms
        self._rebuild_render()

    def proj_split_line(self, gidx, lidx, tpos):
        g = self._project["groups"][gidx]; line = g["lines"][lidx]; toks = line["toks"]
        if 0 < tpos < len(toks):
            a = new_line(toks[:tpos], line.get("fout_at"), line.get("fout_ms", 1000.0))
            b = new_line(toks[tpos:], line.get("fout_at"), line.get("fout_ms", 1000.0))
            g["lines"][lidx:lidx + 1] = [a, b]
            self._rebuild_render()

    def proj_merge_line_up(self, gidx, lidx):
        g = self._project["groups"][gidx]
        if lidx > 0:
            g["lines"][lidx - 1]["toks"] = g["lines"][lidx - 1]["toks"] + g["lines"][lidx]["toks"]
            del g["lines"][lidx]
            self._rebuild_render()

    def proj_token_del(self, gidx, lidx, tposs, value):
        toks = self._project["groups"][gidx]["lines"][lidx]["toks"]
        for tp in tposs:
            toks[tp]["del"] = value
        self._rebuild_render()

    def proj_token_merge(self, gidx, lidx, tposs, sep):
        """Merge contiguous tokens into one (with or without a space)."""
        toks = self._project["groups"][gidx]["lines"][lidx]["toks"]
        tp = sorted(set(tposs))
        if len(tp) < 2 or tp != list(range(tp[0], tp[-1] + 1)):
            self.log("Merge: select adjacent words"); return
        ids = [i for k in tp for i in toks[k]["ids"]]
        merged = {"ids": ids, "sep": sep, "del": any(toks[k].get("del") for k in tp)}
        toks[tp[0]:tp[-1] + 1] = [merged]
        self._rebuild_render()

    def proj_token_unmerge(self, gidx, lidx, tpos):
        toks = self._project["groups"][gidx]["lines"][lidx]["toks"]
        tok = toks[tpos]
        if len(tok["ids"]) > 1:
            singles = [{"ids": [i], "sep": "", "del": tok.get("del", False)} for i in tok["ids"]]
            toks[tpos:tpos + 1] = singles
            self._rebuild_render()

    def line_start_src(self, gidx, lidx):
        """Source-time start of a line (min token start), for fade-out helpers."""
        words = self._project["words"]
        toks = self._project["groups"][gidx]["lines"][lidx]["toks"]
        ss = [words[i]["start"] for t in toks for i in t["ids"]]
        return min(ss) if ss else 0.0

    def open_editor(self):
        if self._project is None:
            self.log("Load a lyrics JSON first."); return
        if self._editor is not None and self._editor.winfo_exists():
            self._editor.lift(); return
        self._editor = CueEditor(self)

    def _on_align(self):
        self._box_from_margins()
        self._refresh_preview()

    # ── coordinate transforms ──
    def sx(self): return self.pw_var.get() / PREVIEW_W
    def sy(self): return self.ph_var.get() / self.canvas_h

    def _box_from_margins(self):
        sx, sy = self.sx(), self.sy()
        left = self.ml_var.get() / sx
        right = (self.pw_var.get() - self.mr_var.get()) / sx
        al = ALIGN_LABELS[self.align_var.get()]
        if al in (1, 2, 3):
            bottom = (self.ph_var.get() - self.mv_var.get()) / sy
            top = max(0, bottom - self.canvas_h * 0.18)
        elif al in (7, 8, 9):
            top = self.mv_var.get() / sy
            bottom = min(self.canvas_h, top + self.canvas_h * 0.18)
        else:
            cy = self.canvas_h / 2
            top, bottom = cy - self.canvas_h * 0.09, cy + self.canvas_h * 0.09
        self.box = [left, top, right, bottom]

    def _margins_from_box(self):
        sx, sy = self.sx(), self.sy()
        l, t, r, b = self.box
        self.ml_var.set(max(0, round(l * sx)))
        self.mr_var.set(max(0, round(self.pw_var.get() - r * sx)))
        al = ALIGN_LABELS[self.align_var.get()]
        if al in (1, 2, 3):
            self.mv_var.set(max(0, round(self.ph_var.get() - b * sy)))
        elif al in (7, 8, 9):
            self.mv_var.set(max(0, round(t * sy)))
        else:
            self.mv_var.set(max(0, round(min(t, self.canvas_h - b) * sy)))

    def _anchor_xy_playres(self):
        """Absolute (x,y) in play-res for the chosen alignment anchor of the box."""
        sx, sy = self.sx(), self.sy()
        l, t, r, b = self.box
        al = ALIGN_LABELS[self.align_var.get()]
        x = (l if al in (1, 4, 7) else r if al in (3, 6, 9) else (l + r) / 2) * sx
        y = (b if al in (1, 2, 3) else t if al in (7, 8, 9) else (t + b) / 2) * sy
        return round(x), round(y)

    # ── drag ──
    def _handles(self):
        l, t, r, b = self.box
        cx, cy = (l + r) / 2, (t + b) / 2
        return {"nw": (l, t), "n": (cx, t), "ne": (r, t), "e": (r, cy),
                "se": (r, b), "s": (cx, b), "sw": (l, b), "w": (l, cy)}

    def _press(self, ev):
        started = False
        for name, (hx, hy) in self._handles().items():
            if abs(ev.x - hx) <= HANDLE + 2 and abs(ev.y - hy) <= HANDLE + 2:
                self._drag = (name, ev.x, ev.y, list(self.box)); started = True; break
        if not started:
            l, t, r, b = self.box
            if l <= ev.x <= r and t <= ev.y <= b:
                self._drag = ("move", ev.x, ev.y, list(self.box)); started = True
        if started:
            # Switch to the clean background (drops any baked-in exact render) so
            # dragging shows clean frame + approx text, never a stale burned frame.
            self._update_bg()
            self._set_background()
            self._draw_text_approx()
            self._draw_overlay()

    def _motion(self, ev):
        if not self._drag: return
        name, x0, y0, box0 = self._drag
        dx, dy = ev.x - x0, ev.y - y0
        l, t, r, b = box0
        if name == "move":
            w, h = r - l, b - t
            l, t = l + dx, t + dy
            l = max(0, min(l, PREVIEW_W - w)); t = max(0, min(t, self.canvas_h - h))
            self.box = [l, t, l + w, t + h]
        else:
            if "w" in name: l = min(l + dx, r - 20)
            if "e" in name: r = max(r + dx, l + 20)
            if "n" in name: t = min(t + dy, b - 12)
            if "s" in name: b = max(b + dy, t + 12)
            self.box = [max(0, l), max(0, t), min(PREVIEW_W, r), min(self.canvas_h, b)]
        self._margins_from_box()
        self._draw_text_approx(); self._draw_overlay()  # bg persists; only text+overlay redraw

    def _release(self, ev):
        if self._drag:
            self._drag = None
            self._margins_from_box()
            self._refresh_preview()
            self._auto_render()

    def _auto_render(self):
        if HAS_FFMPEG and getattr(self, "auto_var", None) and self.auto_var.get():
            self._render_exact()

    # ── preview ──
    def _on_time(self):
        self.time_lbl.configure(text=ass_time(self.time_var.get())[2:])
        self._refresh_preview()

    def _set_background(self):
        """Persistent 'bg' layer: clean video frame if loaded, else solid color.
        Only this is deleted/redrawn here — text ('tx') and overlay ('ov') are
        managed separately, so a drag never wipes the background."""
        self.canvas.delete("bg")
        if self._bg_photo is not None:
            self.canvas.create_image(0, 0, anchor="nw", image=self._bg_photo, tags="bg")
        else:
            self.canvas.create_rectangle(0, 0, PREVIEW_W, self.canvas_h, fill="#202024", outline="", tags="bg")
        self.canvas.tag_lower("bg")

    def _update_bg(self):
        """Extract a CLEAN frame (no subtitles) from the input video at time t."""
        v = self.vid_var.get()
        if not (HAS_FFMPEG and os.path.isfile(v)):
            self._bg_photo = None; self._bg_key = None; return
        t = self.time_var.get()
        key = (v, round(t, 2), self.canvas_h)
        if key == self._bg_key:
            return
        try:
            png = os.path.join(tempfile.gettempdir(), "_ks_bg.png")
            cmd = [FFMPEG, "-y", "-hide_banner", "-loglevel", "error",
                   "-ss", f"{t:.3f}", "-i", v, "-frames:v", "1",
                   "-vf", f"scale={PREVIEW_W}:{self.canvas_h}", png]
            p = subprocess.run(cmd, capture_output=True, text=True)
            if p.returncode == 0:
                self._bg_photo = tk.PhotoImage(file=png); self._bg_key = key
            else:
                self.log("✗ bg frame: " + p.stderr[-300:])
        except Exception as e:
            self.log(f"✗ bg frame: {e}")

    def _refresh_preview(self):
        if not hasattr(self, "canvas"): return
        self._set_background()
        self._draw_text_approx()
        self._draw_overlay()

    def _on_release_time(self):
        self._update_bg()
        self._refresh_preview()
        self._auto_render()

    def _draw_text_approx(self):
        """Mirror libass: only the words appeared by time t are visible, but each
        line is laid out at its FULL width so appeared words sit in their final
        place (unappeared words reserve space). Matches the post-mouse-up render."""
        self.canvas.delete("tx")
        if not self._groups: return
        t = self.time_var.get()
        ev = next((g for g in self._groups if g["start"] <= t <= g["end"]), None)
        if ev is None: return
        al = ALIGN_LABELS[self.align_var.get()]
        l, top, r, b = self.box
        ax = l if al in (1, 4, 7) else r if al in (3, 6, 9) else (l + r) / 2
        ay = b if al in (1, 2, 3) else top if al in (7, 8, 9) else (top + b) / 2
        # Negative size = pixels (Tk convention). Scale by the per-font factor so
        # Tk uses the same FreeType pixel size as libass → matching glyph size.
        fac = self._font_px_factor(self.font_var.get())
        fsize = max(8, round(self.size_var.get() * fac / self.sy()))
        f = tkfont.Font(family=self.font_var.get(), size=-fsize,
                        weight="bold" if self.bold_var.get() else "normal")
        lh = f.metrics("linespace")
        mode = ev.get("accumulate", "words")
        rows = []
        for line in ev["lines"]:
            ws = line["words"]
            full = "".join(w["text"] for w in ws).strip()
            if mode == "words":
                pref = "".join(w["text"] for w in ws if w["start_s"] <= t).strip()
            elif mode == "lines":
                pref = full if (ws and ws[0]["start_s"] <= t) else ""
            else:  # off — visible for the whole window
                pref = full
            rows.append((full, pref))
        n = len(rows)
        block_top = ay - n * lh if al in (1, 2, 3) else ay if al in (7, 8, 9) else ay - n * lh / 2
        for i, (full, pref) in enumerate(rows):
            if not pref:
                continue
            y = block_top + i * lh
            fw = f.measure(full)                       # FULL line width → fixed left edge
            lx = ax if al in (1, 4, 7) else ax - fw if al in (3, 6, 9) else ax - fw / 2
            for ox, oy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                self.canvas.create_text(lx + ox, y + oy, text=pref, fill=self._color["outline"],
                                        font=f, anchor="nw", tags="tx")
            self.canvas.create_text(lx, y, text=pref, fill=self._color["primary"],
                                    font=f, anchor="nw", tags="tx")

    def _font_px_factor(self, family):
        """Factor f such that Tk pixel size = f × Fontsize matches libass's
        rendered glyph size. = libass_ink(0.78×size) / FreeType_ink_ratio.
        FreeType ink ratio measured via PIL from the actual font file."""
        if family in self._ffac:
            return self._ffac[family]
        fac = 0.82  # reasonable fallback if PIL/fc-match unavailable
        try:
            from PIL import ImageFont
            path = ""
            if FC_MATCH:
                path = subprocess.run([FC_MATCH, "-f", "%{file}", family],
                                      capture_output=True, text=True, timeout=5).stdout.strip()
            if path:
                bb = ImageFont.truetype(path, 100).getbbox("Ag")
                ink = bb[3] - bb[1]
                if ink > 0:
                    fac = LIBASS_INK_AT_100 / ink
        except Exception:
            pass
        self._ffac[family] = fac
        return fac

    def _draw_overlay(self):
        self.canvas.delete("ov")
        l, t, r, b = self.box
        self.canvas.create_rectangle(l, t, r, b, outline="#33aaff", dash=(4, 3), tags="ov")
        for hx, hy in self._handles().values():
            self.canvas.create_rectangle(hx - HANDLE, hy - HANDLE, hx + HANDLE, hy + HANDLE,
                                         fill="#33aaff", outline="white", tags="ov")

    def _render_exact(self):
        if not HAS_FFMPEG:
            messagebox.showinfo("No ffmpeg", "Install ffmpeg with libass for exact preview."); return
        try:
            cfg = self.cfg()
            ass_text, _ = build_ass(cfg, self._groups)
            tmp_ass = os.path.join(tempfile.gettempdir(), "_ks_preview.ass")
            with open(tmp_ass, "w", encoding="utf-8") as f:
                f.write(ass_text)
            out_png = os.path.join(tempfile.gettempdir(), "_ks_preview.png")
            t = self.time_var.get()
            ass_f = tmp_ass.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
            pw, ph = cfg["play_w"], cfg["play_h"]
            dur = total_duration(self._groups)
            if os.path.isfile(self.vid_var.get()):
                src = ["-ss", f"{t:.3f}", "-copyts", "-i", self.vid_var.get()]
            else:
                src = ["-ss", f"{t:.3f}", "-copyts", "-f", "lavfi",
                       "-i", f"color=c=#202024:s={pw}x{ph}:d={dur:.1f}"]
            vf = f"ass='{ass_f}',scale={PREVIEW_W}:{self.canvas_h}"
            cmd = [FFMPEG, "-y", "-hide_banner", "-loglevel", "error", *src,
                   "-vf", vf, "-frames:v", "1", out_png]
            p = subprocess.run(cmd, capture_output=True, text=True)
            if p.returncode != 0:
                self.log("✗ preview: " + p.stderr[-400:]); return
            self._exact_photo = tk.PhotoImage(file=out_png)
            # Replace the bg layer with the burned frame; drop approx text.
            self.canvas.delete("bg"); self.canvas.delete("tx")
            self.canvas.create_image(0, 0, anchor="nw", image=self._exact_photo, tags="bg")
            self.canvas.tag_lower("bg")
            self._draw_overlay()
            self.log(f"✓ libass preview @ {ass_time(t)}")
        except Exception as e:
            self.log(f"✗ preview: {e}")

    # ── font picker ──
    def _choose_font(self):
        if self._fonts is None:
            self._fonts = list_font_families()
            self.font_combo.configure(values=self._fonts)
        dlg = ctk.CTkToplevel(self); dlg.title("Select font"); dlg.transient(self)
        dlg.geometry("360x480"); dlg.after(200, dlg.grab_set)
        flt = tk.StringVar()
        ctk.CTkEntry(dlg, textvariable=flt, placeholder_text="filter…").pack(fill="x", padx=8, pady=6)
        lb = tk.Listbox(dlg, activestyle="dotbox", bg="#2b2b2b", fg="#e0e0e0",
                        highlightthickness=0, selectbackground="#1f6aa5", borderwidth=0)
        lb.pack(fill="both", expand=True, padx=8)
        prev = ctk.CTkLabel(dlg, text="Aa Bb Cc 123 — preview", height=40)
        prev.pack(fill="x", padx=8, pady=6)

        def repopulate(*_):
            q = flt.get().lower()
            lb.delete(0, "end")
            for fam in self._fonts:
                if q in fam.lower():
                    lb.insert("end", fam)
        def on_select(*_):
            sel = lb.curselection()
            if sel:
                fam = lb.get(sel[0])
                try: prev.configure(font=ctk.CTkFont(family=fam, size=18))
                except Exception: pass
        def accept(*_):
            sel = lb.curselection()
            if sel:
                self.font_var.set(lb.get(sel[0]))
                self._refresh_preview()
            dlg.destroy()
        flt.trace_add("write", repopulate)
        lb.bind("<<ListboxSelect>>", on_select)
        lb.bind("<Double-Button-1>", accept)
        btns = ctk.CTkFrame(dlg, fg_color="transparent"); btns.pack(fill="x", padx=8, pady=6)
        ctk.CTkButton(btns, text="OK", width=70, command=accept).pack(side="right")
        ctk.CTkButton(btns, text="Cancel", width=70, fg_color="gray40",
                      command=dlg.destroy).pack(side="right", padx=4)
        repopulate()
        # preselect current
        cur = self.font_var.get()
        if cur in self._fonts:
            i = self._fonts.index(cur)
            try:
                vis = lb.get(0, "end")
                if cur in vis:
                    j = vis.index(cur); lb.selection_set(j); lb.see(j); on_select()
            except Exception:
                pass

    # ── helpers / actions ──
    def _pick(self, var, types):
        p = filedialog.askopenfilename(filetypes=types)
        if p: var.set(p)
    def _save(self, var, ext):
        p = filedialog.asksaveasfilename(defaultextension=ext)
        if p: var.set(p)
    def _pick_color(self, key, btn):
        c = colorchooser.askcolor(color=self._color[key])
        if c and c[1]:
            self._color[key] = c[1]; btn.configure(fg_color=c[1]); self._refresh_preview()
    def log(self, msg):
        self.status.configure(state="normal"); self.status.insert("end", msg + "\n")
        self.status.see("end"); self.status.configure(state="disabled"); self.update_idletasks()

    def _set_progress(self, frac, text=None):
        pct = max(0.0, min(100.0, frac * 100))
        self.prog.set(pct / 100.0)
        self.prog_lbl.configure(text=text if text is not None else f"{pct:0.0f}%")
        self.update_idletasks()

    def _probe_duration(self, path):
        if not os.path.isfile(FFPROBE):
            return None
        try:
            out = subprocess.run([FFPROBE, "-v", "error", "-show_entries", "format=duration",
                                  "-of", "default=nokey=1:noprint_wrappers=1", path],
                                 capture_output=True, text=True, timeout=10).stdout.strip()
            return float(out)
        except Exception:
            return None

    def cfg(self):
        c = {
            "json_path": self.json_var.get(), "font": self.font_var.get(),
            "fontsize": self.size_var.get(), "bold": self.bold_var.get(),
            "align": ALIGN_LABELS[self.align_var.get()], "fade_ms": self.fade_var.get(),
            "group_by": self.group_var.get(), "skip_dashes": self.skip_var.get(),
            "play_w": self.pw_var.get(), "play_h": self.ph_var.get(),
            "margin_l": self.ml_var.get(), "margin_r": self.mr_var.get(), "margin_v": self.mv_var.get(),
            "primary_color": self._color["primary"], "outline_color": self._color["outline"],
            "back_color": self._color["back"], "back_alpha": (self.backa_var.get() or "80").upper()[:2],
            "border_style": self.border_var.get(), "outline_w": self.outline_var.get(),
            "shadow": self.shadow_var.get(),
            # WrapStyle 2 = no automatic wrapping; break only on explicit \N.
            # So resizing the box never re-wraps the text (matches the preview).
            "wrap_style": 2,
        }
        if self.pos_var.get():
            c["pos"] = self._anchor_xy_playres()
        return c

    def _generate(self):
        cfg = self.cfg()
        if not os.path.isfile(cfg["json_path"]):
            raise FileNotFoundError(cfg["json_path"])
        text, n = build_ass(cfg, self._groups)
        with open(self.ass_var.get(), "w", encoding="utf-8") as f:
            f.write(text)
        self.log(f"✓ Wrote {self.ass_var.get()}  ({n} events)")
        return n

    def on_generate(self):
        try: self._generate()
        except Exception as e: messagebox.showerror("Generate failed", str(e))

    # ── presets ──
    def _preset_dict(self):
        return {
            "font": self.font_var.get(), "fontsize": self.size_var.get(), "bold": self.bold_var.get(),
            "align": self.align_var.get(), "fade_ms": self.fade_var.get(),
            "group_by": self.group_var.get(), "skip_dashes": self.skip_var.get(),
            "use_pos": self.pos_var.get(),
            "play_w": self.pw_var.get(), "play_h": self.ph_var.get(),
            "margin_l": self.ml_var.get(), "margin_r": self.mr_var.get(), "margin_v": self.mv_var.get(),
            "outline_w": self.outline_var.get(), "shadow": self.shadow_var.get(),
            "border_style": self.border_var.get(), "back_alpha": self.backa_var.get(),
            "colors": dict(self._color),
            "cues": serialize_cues(self._project) if self._project else None,
        }

    def on_save_preset(self):
        p = filedialog.asksaveasfilename(defaultextension=".json", initialfile="karaoke_preset.json",
                                         filetypes=[("Preset JSON", "*.json")])
        if not p: return
        try:
            with open(p, "w", encoding="utf-8") as f:
                json.dump(self._preset_dict(), f, indent=2)
            self.log(f"✓ Saved preset → {p}")
        except Exception as e:
            messagebox.showerror("Save preset failed", str(e))

    def on_load_preset(self):
        p = filedialog.askopenfilename(filetypes=[("Preset JSON", "*.json")])
        if not p: return
        try:
            d = json.load(open(p, encoding="utf-8"))
        except Exception as e:
            messagebox.showerror("Load preset failed", str(e)); return
        self.font_var.set(d.get("font", self.font_var.get()))
        self.size_var.set(d.get("fontsize", self.size_var.get()))
        self.bold_var.set(d.get("bold", self.bold_var.get()))
        if d.get("align") in ALIGN_LABELS: self.align_var.set(d["align"])
        self.fade_var.set(d.get("fade_ms", self.fade_var.get()))
        self.group_var.set(d.get("group_by", self.group_var.get()))
        self.skip_var.set(d.get("skip_dashes", self.skip_var.get()))
        self.pos_var.set(d.get("use_pos", self.pos_var.get()))
        self.pw_var.set(d.get("play_w", self.pw_var.get()))
        self.ph_var.set(d.get("play_h", self.ph_var.get()))
        self.ml_var.set(d.get("margin_l", self.ml_var.get()))
        self.mr_var.set(d.get("margin_r", self.mr_var.get()))
        self.mv_var.set(d.get("margin_v", self.mv_var.get()))
        self.outline_var.set(d.get("outline_w", self.outline_var.get()))
        self.shadow_var.set(d.get("shadow", self.shadow_var.get()))
        self.border_var.set(d.get("border_style", self.border_var.get()))
        self.backa_var.set(d.get("back_alpha", self.backa_var.get()))
        for k, v in (d.get("colors") or {}).items():
            if k in self._color: self._color[k] = v
        self.b1.configure(fg_color=self._color["primary"]); self.b2.configure(fg_color=self._color["outline"]); self.b3.configure(fg_color=self._color["back"])
        self._resync_canvas()
        self._reload_groups()   # builds the default project from the source
        if d.get("cues"):       # overlay saved cue edits (if same source word count)
            if apply_cues(self._project, d["cues"]):
                self._rebuild_render()
            else:
                self.log("⚠ saved cues don't match this lyrics source — kept defaults")
        self.log(f"✓ Loaded preset ← {p}")

    def _resync_canvas(self):
        new_h = int(round(PREVIEW_W * self.ph_var.get() / self.pw_var.get()))
        if new_h != self.canvas_h:
            self.canvas_h = new_h
            self.canvas.configure(height=new_h)
            self._box_from_margins()
            self._refresh_preview()

    def on_burn(self):
        if not os.path.isfile(self.vid_var.get()):
            messagebox.showwarning("No video", "Pick an input video to burn into."); return
        if not HAS_FFMPEG:
            messagebox.showerror("No ffmpeg", "ffmpeg with libass required."); return
        try: self._generate()
        except Exception as e: messagebox.showerror("Generate failed", str(e)); return
        ass_f = self.ass_var.get().replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
        cmd = [FFMPEG, "-y", "-hide_banner", "-i", self.vid_var.get(), "-vf", f"ass='{ass_f}'",
               "-c:a", "copy", "-progress", "pipe:1", "-nostats", self.out_var.get()]
        total = self._probe_duration(self.vid_var.get()) or total_duration(self._groups) or 1.0
        self._set_progress(0.0, "burning…")
        self.log(f"Burning → {self.out_var.get()}")
        # Worker thread ONLY mutates this dict; the main thread polls it (Tk
        # widget/after calls are not thread-safe and must stay on the main loop).
        self._burn_state = {"frac": 0.0, "done": False, "err": None}

        def run():
            try:
                proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            except Exception as e:
                self._burn_state.update(done=True, err=str(e)); return
            for line in proc.stdout:                       # ffmpeg -progress key=value stream
                line = line.strip()
                if line.startswith("out_time_us=") or line.startswith("out_time_ms="):
                    try:
                        secs = int(line.split("=")[1]) / 1_000_000  # both keys are microseconds
                        self._burn_state["frac"] = min(secs / total, 0.999)
                    except (ValueError, ZeroDivisionError):
                        pass
            err = proc.stderr.read(); rc = proc.wait()
            self._burn_state.update(done=True, err=(None if rc == 0 else err))

        threading.Thread(target=run, daemon=True).start()
        self.after(120, self._poll_burn)

    def _poll_burn(self):
        st = getattr(self, "_burn_state", None)
        if st is None:
            return
        if not st["done"]:
            self._set_progress(st["frac"])
            self.after(120, self._poll_burn)
            return
        if st["err"] is None:
            self._set_progress(1.0, "✓ done")
            self.log(f"✓ Burned → {self.out_var.get()}")
        else:
            self._set_progress(0.0, "failed")
            self.log("✗ ffmpeg:\n" + str(st["err"])[-1200:])


class CueEditor(tk.Toplevel):
    """Pop-out cue editor. Tree: group → line. A words panel lists the selected
    line's tokens for split / merge / delete. All ops are reversible."""
    def __init__(self, app):
        super().__init__(app)
        self.app = app
        self.title("Cue Editor")
        self.geometry("760x640")
        self.transient(app)
        self._sel_group = None   # gidx
        self._sel_line = None    # (gidx, lidx)
        self._build()
        self.reload()

    def _build(self):
        pad = {"padx": 4, "pady": 3}
        # group/line ops
        b1 = ttk.Frame(self); b1.pack(fill="x", **pad)
        ttk.Button(b1, text="Group", command=self._group).pack(side="left")
        ttk.Button(b1, text="Ungroup", command=self._ungroup).pack(side="left", padx=3)
        ttk.Button(b1, text="Split line @word", command=self._split_line).pack(side="left", padx=3)
        ttk.Button(b1, text="Merge line up", command=self._merge_line_up).pack(side="left", padx=3)
        ttk.Button(b1, text="Delete/Restore group", command=self._toggle_group_del).pack(side="left", padx=3)

        body = ttk.Frame(self); body.pack(fill="both", expand=True, **pad)
        # tree (groups → lines)
        cols = ("time", "acc")
        self.tree = ttk.Treeview(body, columns=cols, show="tree headings", height=18)
        self.tree.heading("#0", text="Group / line"); self.tree.column("#0", width=380)
        self.tree.heading("time", text="window"); self.tree.column("time", width=120, anchor="e")
        self.tree.heading("acc", text="accum"); self.tree.column("acc", width=60, anchor="center")
        self.tree.pack(side="left", fill="both", expand=True)
        tsb = ttk.Scrollbar(body, orient="vertical", command=self.tree.yview)
        tsb.pack(side="left", fill="y"); self.tree.configure(yscrollcommand=tsb.set)
        self.tree.bind("<<TreeviewSelect>>", self._on_tree_select)

        # words panel for the selected line
        right = ttk.LabelFrame(body, text="Words in selected line"); right.pack(side="left", fill="both", padx=6)
        self.words = tk.Listbox(right, selectmode="extended", width=26, height=14, activestyle="dotbox")
        self.words.pack(fill="both", expand=True, padx=4, pady=4)
        wb = ttk.Frame(right); wb.pack(fill="x")
        ttk.Button(wb, text="Merge ␣", width=8, command=lambda: self._merge_tokens(" ")).pack(side="left")
        ttk.Button(wb, text="Merge•", width=7, command=lambda: self._merge_tokens("")).pack(side="left", padx=2)
        ttk.Button(wb, text="Unmerge", width=8, command=self._unmerge_token).pack(side="left")
        wb2 = ttk.Frame(right); wb2.pack(fill="x", pady=(2, 0))
        ttk.Button(wb2, text="Delete/Restore word(s)", command=self._toggle_token_del).pack(side="left")

        # per-group settings
        s = ttk.LabelFrame(self, text="Selected group"); s.pack(fill="x", **pad)
        ttk.Label(s, text="Accumulate:").grid(row=0, column=0, sticky="w", padx=4)
        self.acc_var = tk.StringVar(value="words")
        acc = ttk.Combobox(s, textvariable=self.acc_var, width=8, state="readonly",
                           values=["words", "lines", "off"])
        acc.grid(row=0, column=1, sticky="w"); acc.bind("<<ComboboxSelected>>", lambda *_: self._apply_acc())
        ttk.Label(s, text="Window start/end (s, blank=auto):").grid(row=0, column=2, sticky="e", padx=6)
        self.ws_var = tk.StringVar(); self.we_var = tk.StringVar()
        ttk.Entry(s, textvariable=self.ws_var, width=8).grid(row=0, column=3)
        ttk.Entry(s, textvariable=self.we_var, width=8).grid(row=0, column=4, padx=2)
        ttk.Label(s, text="Shift-all (s):").grid(row=1, column=0, sticky="w", padx=4, pady=3)
        self.shift_var = tk.StringVar(value="0.0")
        ttk.Entry(s, textvariable=self.shift_var, width=8).grid(row=1, column=1, sticky="w")
        ttk.Button(s, text="−0.1", width=4, command=lambda: self._nudge(-0.1)).grid(row=1, column=2, sticky="e")
        ttk.Button(s, text="+0.1", width=4, command=lambda: self._nudge(0.1)).grid(row=1, column=3, sticky="w")
        ttk.Button(s, text="Apply timing", command=self._apply_timing).grid(row=1, column=4, padx=2)
        ttk.Label(s, text="Fade-out @end (ms, 0=off):").grid(row=2, column=0, columnspan=2, sticky="w", padx=4, pady=3)
        self.fout_var = tk.StringVar(value="1000")
        ttk.Entry(s, textvariable=self.fout_var, width=8).grid(row=2, column=2, sticky="w")
        ttk.Button(s, text="1s", width=4, command=lambda: (self.fout_var.set("1000"), self._apply_timing())).grid(row=2, column=3, sticky="w")
        ttk.Button(s, text="Off", width=4, command=lambda: (self.fout_var.set("0"), self._apply_timing())).grid(row=2, column=4, sticky="w")
        ttk.Label(s, text="Linger after last word (s):").grid(row=3, column=0, columnspan=2, sticky="w", padx=4, pady=3)
        self.linger_var = tk.StringVar(value="0.0")
        ttk.Entry(s, textvariable=self.linger_var, width=8).grid(row=3, column=2, sticky="w")
        ttk.Button(s, text="1s", width=4, command=lambda: (self.linger_var.set("1.0"), self._apply_timing())).grid(row=3, column=3, sticky="w")

        # per-line fade-out (select one or more LINE rows)
        lf = ttk.LabelFrame(self, text="Selected line(s) fade-out — fades these lines while others hold position")
        lf.pack(fill="x", **pad)
        ttk.Label(lf, text="at (s):").grid(row=0, column=0, sticky="w", padx=4)
        self.lf_at = tk.StringVar()
        ttk.Entry(lf, textvariable=self.lf_at, width=9).grid(row=0, column=1)
        ttk.Button(lf, text="= next line start", command=self._lf_next_line).grid(row=0, column=2, padx=3)
        ttk.Label(lf, text="dur (ms):").grid(row=0, column=3, sticky="e", padx=4)
        self.lf_ms = tk.StringVar(value="1000")
        ttk.Entry(lf, textvariable=self.lf_ms, width=8).grid(row=0, column=4)
        ttk.Button(lf, text="Set", command=self._set_line_fadeout).grid(row=0, column=5, padx=4)
        ttk.Button(lf, text="Clear", command=self._clear_line_fadeout).grid(row=0, column=6)

        foot = ttk.Frame(self); foot.pack(fill="x", **pad)
        ttk.Label(foot, text="Select multiple LINE rows (Ctrl/Shift-click) to fade them out together.",
                  foreground="#888").pack(side="left")
        ttk.Button(foot, text="Close", command=self.destroy).pack(side="right")

    # ── population ──
    def reload(self):
        if not self.winfo_exists():
            return
        proj = self.app._project
        open_groups = {iid for iid in self.tree.get_children("") if self.tree.item(iid, "open")}
        prev_sel = list(self.tree.selection())
        self.tree.delete(*self.tree.get_children(""))
        words = proj["words"]
        for gi, g in enumerate(proj["groups"]):
            gi_iid = f"g{gi}"
            s, e = self._win(g)
            label = ("[deleted] " if g.get("del") else "") + f"[{g.get('label', '')}]"
            self.tree.insert("", "end", iid=gi_iid, text=label,
                             values=(f"{s:.2f}–{e:.2f}", g.get("accumulate", "words")), open=(gi_iid in open_groups))
            for li, line in enumerate(g["lines"]):
                toks = line["toks"]
                txt = "".join(("" if t.get("del") else token_text(words, t)) for t in toks).strip()
                ndel = sum(1 for t in toks if t.get("del"))
                marks = []
                if ndel: marks.append(f"{ndel} del")
                if line.get("fout_at") is not None: marks.append(f"⤓{line['fout_at']:.1f}s")
                mark = ("   [" + ", ".join(marks) + "]") if marks else ""
                self.tree.insert(gi_iid, "end", iid=f"g{gi}l{li}", text="  " + (txt or "∅") + mark, values=("", ""))
        # restore selection (same iids survive non-structural edits)
        keep = [iid for iid in prev_sel if self.tree.exists(iid)]
        if keep:
            self.tree.selection_set(keep)
        self._on_tree_select()

    def _win(self, g):
        words = self.app._project["words"]
        ids = [i for line in g["lines"] for t in line["toks"] for i in t["ids"]]
        if not ids:
            return 0.0, 0.0
        sh = g.get("shift", 0.0)
        s = g["win_start"] if g.get("win_start") is not None else min(words[i]["start"] for i in ids) + sh
        e = g["win_end"] if g.get("win_end") is not None else max(words[i]["end"] for i in ids) + sh + g.get("linger", 0.0)
        return s, e

    # ── selection ──
    def _parse_iid(self, iid):
        if iid.startswith("g") and "l" in iid:
            gi, li = iid[1:].split("l"); return int(gi), int(li)
        if iid.startswith("g"):
            return int(iid[1:]), None
        return None, None

    def _selected_groups(self):
        out = []
        for iid in self.tree.selection():
            gi, li = self._parse_iid(iid)
            if gi is not None and li is None:
                out.append(gi)
        return out

    def _on_tree_select(self, *_):
        sel = self.tree.selection()
        self._sel_group = None; self._sel_line = None
        if sel:
            gi, li = self._parse_iid(sel[0])
            if li is None:
                self._sel_group = gi
            else:
                self._sel_group = gi; self._sel_line = (gi, li)
        if self._sel_group is not None:
            g = self.app._project["groups"][self._sel_group]
            self.acc_var.set(g.get("accumulate", "words"))
            self.ws_var.set("" if g.get("win_start") is None else f"{g['win_start']:.2f}")
            self.we_var.set("" if g.get("win_end") is None else f"{g['win_end']:.2f}")
            self.shift_var.set(f"{g.get('shift', 0.0):.2f}")
            self.fout_var.set(f"{int(g.get('fade_out', 0) or 0)}")
            self.linger_var.set(f"{g.get('linger', 0.0):.2f}")
        # reflect the selected line's own fade-out (if exactly one line selected)
        if self._sel_line:
            gi, li = self._sel_line
            ln = self.app._project["groups"][gi]["lines"][li]
            self.lf_at.set("" if ln.get("fout_at") is None else f"{ln['fout_at']:.2f}")
            self.lf_ms.set(f"{int(ln.get('fout_ms', 1000) or 1000)}")
        self._refresh_words_panel()

    def _selected_lines(self):
        out = []
        for iid in self.tree.selection():
            gi, li = self._parse_iid(iid)
            if gi is not None and li is not None:
                out.append((gi, li))
        return out

    def _refresh_words_panel(self):
        self.words.delete(0, "end")
        if not self._sel_line:
            return
        gi, li = self._sel_line
        try:
            line = self.app._project["groups"][gi]["lines"][li]
        except (IndexError, KeyError):
            return
        words = self.app._project["words"]
        for t in line["toks"]:
            label = token_text(words, t)
            if len(t["ids"]) > 1:
                label = "⛓ " + label  # merged
            if t.get("del"):
                label = "[x] " + label
            self.words.insert("end", label)

    # ── ops ──
    def _group(self):
        gs = self._selected_groups()
        if gs: self.app.proj_group(gs)
    def _ungroup(self):
        if self._sel_group is not None: self.app.proj_ungroup(self._sel_group)
    def _toggle_group_del(self):
        gs = self._selected_groups()
        if not gs: return
        cur = self.app._project["groups"][gs[0]].get("del", False)
        self.app.proj_group_del(gs, not cur)
    def _apply_acc(self):
        if self._sel_group is not None:
            self.app.proj_set_accumulate([self._sel_group], self.acc_var.get())
    def _split_line(self):
        if not self._sel_line:
            self.app.log("Select a line, then a word boundary in the words panel."); return
        sel = self.words.curselection()
        if not sel:
            self.app.log("Pick the word to split BEFORE (in the words panel)."); return
        gi, li = self._sel_line
        self.app.proj_split_line(gi, li, sel[0])
    def _merge_line_up(self):
        if self._sel_line:
            gi, li = self._sel_line; self.app.proj_merge_line_up(gi, li)
    def _merge_tokens(self, sep):
        if not self._sel_line:
            return
        sel = list(self.words.curselection())
        if len(sel) < 2:
            self.app.log("Select 2+ adjacent words to merge."); return
        gi, li = self._sel_line
        self.app.proj_token_merge(gi, li, sel, sep)
    def _unmerge_token(self):
        if not self._sel_line:
            return
        sel = self.words.curselection()
        if sel:
            gi, li = self._sel_line; self.app.proj_token_unmerge(gi, li, sel[0])
    def _toggle_token_del(self):
        if not self._sel_line:
            return
        sel = list(self.words.curselection())
        if not sel:
            return
        gi, li = self._sel_line
        toks = self.app._project["groups"][gi]["lines"][li]["toks"]
        value = not toks[sel[0]].get("del", False)
        self.app.proj_token_del(gi, li, sel, value)
    def _nudge(self, d):
        try: cur = float(self.shift_var.get() or 0)
        except ValueError: cur = 0.0
        self.shift_var.set(f"{cur + d:.2f}"); self._apply_timing()
    def _apply_timing(self):
        if self._sel_group is None:
            return
        def f(v):
            v = v.strip()
            return None if v == "" else float(v)
        try:
            ws = f(self.ws_var.get()); we = f(self.we_var.get()); sh = float(self.shift_var.get() or 0)
            fo = float(self.fout_var.get() or 0); lg = float(self.linger_var.get() or 0)
        except ValueError:
            self.app.log("Timing must be numbers (or blank for auto)."); return
        self.app.proj_set_timing(self._sel_group, ws, we, sh, fo, lg)

    # ── per-line fade-out ──
    def _line_groups(self):
        """Map {gidx: [lidx,...]} for the selected LINE rows."""
        m = {}
        for gi, li in self._selected_lines():
            m.setdefault(gi, []).append(li)
        return m
    def _set_line_fadeout(self):
        lg = self._line_groups()
        if not lg:
            self.app.log("Select one or more LINE rows first."); return
        try:
            at = float(self.lf_at.get()); ms = float(self.lf_ms.get() or 1000)
        except ValueError:
            self.app.log("Line fade-out: 'at' and 'dur' must be numbers."); return
        for gi, lis in lg.items():
            self.app.proj_set_line_fadeout(gi, lis, at, ms)
    def _clear_line_fadeout(self):
        for gi, lis in self._line_groups().items():
            self.app.proj_set_line_fadeout(gi, lis, None)
    def _lf_next_line(self):
        """Fill 'at' with the start time of the line just after the selection."""
        lines = self._selected_lines()
        if not lines:
            return
        gi = lines[-1][0]
        last_li = max(li for g, li in lines if g == gi)
        nlines = len(self.app._project["groups"][gi]["lines"])
        nxt = last_li + 1
        if nxt < nlines:
            self.lf_at.set(f"{self.app.line_start_src(gi, nxt):.2f}")
        else:
            self.app.log("No next line in this group.")


if __name__ == "__main__":
    App().mainloop()
