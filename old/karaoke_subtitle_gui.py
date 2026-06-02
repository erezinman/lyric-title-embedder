#!/usr/bin/env python3
"""Karaoke Subtitle Studio — archived v1 (tree-based cue editor).

The first-generation app, kept runnable as a fallback. It reuses the shared
`core` (UI-free logic) and `app_base` (UI engine); its only unique parts are the
v1 cue model and the tree-style CueEditor below.

Run from the project root:  python3 old/karaoke_subtitle_gui.py
"""
import os, sys, json, re
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import customtkinter as ctk

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # project root
from core import *          # HERE, helpers, constants
import app_base


# ─────────────────────────────────────────────────────────────────────
# v1 cue model (Group -> Line -> Token), build, and (de)serialisation
# ─────────────────────────────────────────────────────────────────────
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


# ── v1 cue editor (tree view) ──
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




# ─────────────────────────────────────────────────────────────────────
# v1 application — engine from app_base.App + v1 model/editor hooks
# ─────────────────────────────────────────────────────────────────────
class App(app_base.App):
    def _make_project(self, cfg):
        return make_project(cfg)
    def _project_to_render(self, project):
        return project_to_render(project)
    def _build_ass(self, cfg, groups):
        return build_ass(cfg, groups)
    def open_editor(self):
        if self._project is None:
            self.log("Load a lyrics JSON first."); return
        if self._editor is not None and self._editor.winfo_exists():
            self._editor.lift(); return
        self._editor = CueEditor(self)
    def _preset_dict(self):
        d = app_base.App._preset_dict(self)
        d["cues"] = serialize_cues(self._project) if self._project else None
        return d
    def _load_cues(self, d):
        if d.get("cues"):
            if apply_cues(self._project, d["cues"]):
                self._rebuild_render()
            else:
                self.log("\u26a0 saved cues don\u2019t match this lyrics source — kept defaults")

    # ── v1 project mutations (used by the tree CueEditor) ──
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


if __name__ == "__main__":
    App().mainloop()
