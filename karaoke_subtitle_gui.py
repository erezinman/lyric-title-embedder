#!/usr/bin/env python3
"""Karaoke Subtitle Studio v2 — adds the 3-lane cue table editor.

Reuses v1 (karaoke_subtitle_gui) for the style/preview/placement/burn machinery
by subclassing its App; only the cue MODEL, render/build, and editor change.

Model (tag-based, fully reactive via inherited→overridden resolution):
  words   : immutable canonical atoms [{text,start,end}]
  layout  : ordered events; each event = {label, win_start, win_end, linger,
            accumulate, del, lines:[{toks:[{ids,sep,del}]}]}   (\\N structure)
  fin_tags / fout_tags : [{ids:set, color, trigger, dur}]  — words that fade
            in/out together. trigger defaults to first/last member word's time;
            dur defaults to globals. None = inherit.
  globals : {fade_in_ms, fade_out_ms, linger}
Resolution (most specific wins): word → tag → global → built-in.

Run:  python3 karaoke_subtitle_gui_v2.py
"""
import os, json, copy, tkinter as tk
from tkinter import filedialog, messagebox
import customtkinter as ctk
import app_base as base

ESC = base.esc
PALETTE = ["#7a4a4a", "#4a7a4a", "#4a5a7a", "#7a6a3a", "#6a4a7a",
           "#3a7a7a", "#7a3a5a", "#5a7a3a", "#3a5a7a", "#7a5a3a"]
BUILTIN = {"fade_in_ms": 250, "fade_out_ms": 1000, "linger": 0.0}

# Editor themes: tk.Text pane colors + group-color palette (chrome is driven by
# ctk.set_appearance_mode, so no ttk styling is needed here).
_LIGHT_PALETTE = ["#ffd2d2", "#d2f0d2", "#d2e0ff", "#fff0c2", "#ecd2ff",
                  "#cdeeee", "#ffd2ea", "#e2f5cf", "#d2e8ff", "#ffe2cf"]
THEMES = {
    "Dark":   {"bg": "#1e1e1e", "fg": "#e0e0e0", "inh": "#8a8a8a", "ovr": "#ffffff",
               "del": "#666666", "hdr": "#88bbff", "palette": PALETTE},
    "Light":  {"bg": "#fbfbfb", "fg": "#202020", "inh": "#888888", "ovr": "#000000",
               "del": "#b0b0b0", "hdr": "#0044aa", "palette": _LIGHT_PALETTE},
    "System": {"bg": "#ffffff", "fg": "#000000", "inh": "#777777", "ovr": "#000000",
               "del": "#aaaaaa", "hdr": "#003399", "palette": _LIGHT_PALETTE},
}


# ─────────────────────────────────────────────────────────────────────
# Model
# ─────────────────────────────────────────────────────────────────────
def make_project_v2(cfg):
    data = json.load(open(cfg["json_path"], encoding="utf-8"))
    real = base.reconstruct_lines(data.get("aligned_lyrics") or [])
    words, line_specs = [], []
    for l in real:
        if cfg.get("skip_dashes", True) and base.is_dashes(l["text"]):
            continue
        flat = []
        for e in l["_entries"]:
            flat.extend(e.get("words") or [])
        toks = []
        for w in base.merge_subwords(flat):
            words.append({"text": w["text"], "start": w["start_s"], "end": w["end_s"]})
            toks.append({"ids": [len(words) - 1], "sep": "", "del": False})
        if toks:
            line_specs.append((l.get("section") or "Unknown", {"toks": toks}))
    layout = []
    for sec, line in line_specs:
        if cfg.get("group_by") == "section" and layout and layout[-1]["label"] == sec:
            layout[-1]["lines"].append(line)
        else:
            layout.append({"label": sec, "lines": [line], "accumulate": "words",
                           "win_start": None, "win_end": None, "linger": None, "del": False})
    return {"words": words, "layout": layout, "fin_tags": [], "fout_tags": [],
            "globals": dict(BUILTIN), "palette": list(PALETTE)}


def _tag_of(tags, wid):
    for ti, t in enumerate(tags):
        if wid in t["ids"]:
            return ti, t
    return None, None


def project_to_render_v2(project):
    """Bake the model into v1-shaped render-groups. All fade behaviour is
    resolved into per-word start_s (appearance) + fout_at, so the v1 preview
    and a uniform build can consume it."""
    words = project["words"]
    G = project["globals"]
    g_fin = G.get("fade_in_ms", BUILTIN["fade_in_ms"])
    g_fout = G.get("fade_out_ms", BUILTIN["fade_out_ms"])
    g_ling = G.get("linger", BUILTIN["linger"])
    fin, fout = project["fin_tags"], project["fout_tags"]
    out = []
    for g in project["layout"]:
        if g.get("del"):
            continue
        acc = g.get("accumulate", "words")
        rlines, allspans, fade_ends = [], [], []
        # window base needs to know all token starts first; collect per line
        line_tokens = []
        for line in g["lines"]:
            toks = [t for t in line["toks"] if not t.get("del")]
            line_tokens.append(toks)
        # group/window base times
        all_ids = [i for toks in line_tokens for t in toks for i in t["ids"]]
        if not all_ids:
            continue
        base_s = min(words[i]["start"] for i in all_ids)
        base_e = max(words[i]["end"] for i in all_ids)
        win_s = g["win_start"] if g.get("win_start") is not None else base_s
        ling = g["linger"] if g.get("linger") is not None else g_ling
        win_e = g["win_end"] if g.get("win_end") is not None else base_e + ling
        # line first-token start (for 'lines' accumulate)
        for toks in line_tokens:
            if not toks:
                continue
            line_first = min(words[i]["start"] for t in toks for i in t["ids"])
            rws = []
            for tok in toks:
                tstart = min(words[i]["start"] for i in tok["ids"])
                tend = max(words[i]["end"] for i in tok["ids"])
                wid0 = tok["ids"][0]
                # appearance time (fade-in)
                if acc == "off":
                    appear = win_s
                elif acc == "lines":
                    appear = line_first
                else:
                    appear = tstart
                fin_ms = g_fin
                ti, ftag = _tag_of(fin, wid0)
                if ftag is not None:                       # appear-together override
                    appear = ftag["trigger"] if ftag.get("trigger") is not None \
                        else min(words[i]["start"] for i in ftag["ids"] if i < len(words))
                    fin_ms = ftag["dur"] if ftag.get("dur") is not None else g_fin
                # fade-out
                fo_at, fo_ms = None, g_fout
                oi, otag = _tag_of(fout, wid0)
                if otag is not None:
                    fo_at = otag["trigger"] if otag.get("trigger") is not None \
                        else max(words[i]["end"] for i in otag["ids"] if i < len(words))
                    fo_ms = otag["dur"] if otag.get("dur") is not None else g_fout
                    fade_ends.append(fo_at + fo_ms / 1000.0)
                rws.append({"text": base.token_text(words, tok), "start_s": appear, "end_s": tend,
                            "fin_ms": fin_ms, "fout_at": fo_at, "fout_ms": fo_ms})
                allspans.append((tstart, tend))
            if rws:
                rlines.append({"words": rws})
        if not rlines:
            continue
        ev_e = win_e
        if fade_ends:
            ev_e = max(ev_e, max(fade_ends))
        out.append({"start": win_s, "end": ev_e, "accumulate": "words", "lines": rlines})
    out.sort(key=lambda r: r["start"])
    return out


def build_ass_v2(cfg, groups):
    pos = cfg.get("pos")
    pos_tag = f"{{\\pos({int(pos[0])},{int(pos[1])})}}" if pos else ""

    def ev_text(g):
        ev = g["start"]; parts = [pos_tag]
        for li, line in enumerate(g["lines"]):
            if li:
                parts.append("\\N")
            for w in line["words"]:
                fin = max(0, int(round((w["start_s"] - ev) * 1000)))
                fdur = int(w.get("fin_ms", 250) or 0)
                tags = ["\\alpha&HFF&"] if fdur > 0 else ["\\alpha&H00&"]
                if fdur > 0:
                    tags.append(f"\\t({fin},{fin + fdur},\\alpha&H00&)")
                fo = w.get("fout_at")
                if fo is not None:
                    ro = max(0, int(round((fo - ev) * 1000)))
                    od = int(w.get("fout_ms", 1000) or 0)
                    if od > 0:
                        tags.append(f"\\t({ro},{ro + od},\\alpha&HFF&)")
                    else:
                        tags.append(f"\\t({ro},{ro + 1},\\alpha&HFF&)")
                parts.append("{" + "".join(tags) + "}" + ESC(w["text"]))
        return "".join(parts)

    primary = base.rgb_to_ass(cfg["primary_color"]); outline = base.rgb_to_ass(cfg["outline_color"])
    back = base.rgb_to_ass(cfg["back_color"], cfg["back_alpha"]); bold = -1 if cfg["bold"] else 0
    header = (
        "[Script Info]\n; Karaoke Subtitle Studio v2\nScriptType: v4.00+\n"
        f"PlayResX: {cfg['play_w']}\nPlayResY: {cfg['play_h']}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n"
        "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, "
        "BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, "
        "Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"Style: Default,{cfg['font']},{cfg['fontsize']},{primary},&H000000FF,{outline},{back},"
        f"{bold},0,0,0,100,100,0,0,{cfg['border_style']},{cfg['outline_w']},{cfg['shadow']},"
        f"{cfg['align']},{cfg['margin_l']},{cfg['margin_r']},{cfg['margin_v']},1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")
    out = [header]
    for g in groups:
        out.append(f"Dialogue: 0,{base.ass_time(g['start'])},{base.ass_time(g['end'])},Default,,0,0,0,,{ev_text(g)}\n")
    return "".join(out), len(groups)


def serialize_cues_v2(p):
    return {"nwords": len(p["words"]), "globals": dict(p["globals"]), "palette": list(p["palette"]),
            "layout": [{"label": g["label"], "accumulate": g.get("accumulate", "words"),
                        "win_start": g.get("win_start"), "win_end": g.get("win_end"),
                        "linger": g.get("linger"), "del": g.get("del", False),
                        "lines": [{"toks": [{"ids": list(t["ids"]), "sep": t.get("sep", ""),
                                             "del": t.get("del", False)} for t in ln["toks"]]}
                                  for ln in g["lines"]]} for g in p["layout"]],
            "fin_tags": [{"ids": sorted(t["ids"]), "color": t["color"], "trigger": t.get("trigger"),
                          "dur": t.get("dur")} for t in p["fin_tags"]],
            "fout_tags": [{"ids": sorted(t["ids"]), "color": t["color"], "trigger": t.get("trigger"),
                           "dur": t.get("dur")} for t in p["fout_tags"]]}


def apply_cues_v2(project, d):
    if not d or d.get("nwords") != len(project["words"]):
        return False
    project["globals"] = {**BUILTIN, **(d.get("globals") or {})}
    if d.get("palette"):
        project["palette"] = list(d["palette"])
    project["layout"] = [{"label": g.get("label", ""), "accumulate": g.get("accumulate", "words"),
                          "win_start": g.get("win_start"), "win_end": g.get("win_end"),
                          "linger": g.get("linger"), "del": g.get("del", False),
                          "lines": [{"toks": [{"ids": list(t["ids"]), "sep": t.get("sep", ""),
                                               "del": t.get("del", False)} for t in ln["toks"]]}
                                    for ln in g["lines"]]} for g in d.get("layout", [])]
    project["fin_tags"] = [{"ids": set(t["ids"]), "color": t["color"], "trigger": t.get("trigger"),
                            "dur": t.get("dur")} for t in d.get("fin_tags", [])]
    project["fout_tags"] = [{"ids": set(t["ids"]), "color": t["color"], "trigger": t.get("trigger"),
                             "dur": t.get("dur")} for t in d.get("fout_tags", [])]
    return True


# ─────────────────────────────────────────────────────────────────────
# App (subclass v1; swap model/build/editor)
# ─────────────────────────────────────────────────────────────────────
class AppV2(base.App):
    def __init__(self):
        super().__init__()
        self.title("Karaoke Subtitle Studio v2")
        self._undo, self._redo = [], []
        self._theme = getattr(self, "_theme", "Dark")
        self._build_toolbar()

    def _build_toolbar(self):
        """Top toolbar (common with the editor) — currently the theme selector."""
        tb = self.toolbar
        tb.pack(side="top", fill="x", padx=6, pady=(6, 0), before=self._main)
        ctk.CTkLabel(tb, text="Karaoke Subtitle Studio",
                     font=ctk.CTkFont(size=14, weight="bold")).pack(side="left", padx=10, pady=4)
        self.theme_var = tk.StringVar(value=self._theme)
        ctk.CTkOptionMenu(tb, variable=self.theme_var, values=list(THEMES), width=100,
                          command=self.set_theme).pack(side="right", padx=8, pady=4)
        ctk.CTkLabel(tb, text="Theme:").pack(side="right")

    def set_theme(self, name):
        """Single source of truth for theming — keeps both windows in sync."""
        if name not in THEMES:
            return
        self._theme = name
        ctk.set_appearance_mode({"Light": "light", "Dark": "dark", "System": "system"}[name])
        if hasattr(self, "theme_var"):
            self.theme_var.set(name)
        ed = self._editor
        if ed is not None and ed.winfo_exists():
            ed.theme_var.set(name)
            ed._apply_theme(name)   # recolour the editor's text panes + reload

    # model build
    # ── model hooks for the shared engine (app_base.App) ──
    def _make_project(self, cfg):
        return make_project_v2(cfg)
    def _project_to_render(self, project):
        return project_to_render_v2(project)
    def _build_ass(self, cfg, groups):
        return build_ass_v2(cfg, groups)
    def _on_project_loaded(self):
        self._undo, self._redo = [], []

    # undo
    def push_undo(self):
        self._undo.append(copy.deepcopy(self._project))
        if len(self._undo) > 100:
            self._undo.pop(0)
        self._redo.clear()

    def undo(self):
        if self._undo:
            self._redo.append(copy.deepcopy(self._project))
            self._project = self._undo.pop()
            self._rebuild_render()

    def redo(self):
        if self._redo:
            self._undo.append(copy.deepcopy(self._project))
            self._project = self._redo.pop()
            self._rebuild_render()

    # _generate / _render_exact are inherited from app_base.App (they call the
    # _build_ass hook above), so no override is needed here.

    def open_editor(self):
        if self._project is None:
            self.log("Load a lyrics JSON first."); return
        if self._editor is not None and self._editor.winfo_exists():
            self._editor.lift(); return
        self._editor = CueTableEditor(self)

    # presets carry v2 cues
    def _preset_dict(self):
        d = base.App._preset_dict(self)
        d["cues"] = None
        d["cues_v2"] = serialize_cues_v2(self._project) if self._project else None
        d["theme"] = getattr(self, "_theme", "Dark")
        return d

    def on_load_preset(self):
        p = filedialog.askopenfilename(filetypes=[("Preset JSON", "*.json")])
        if not p:
            return
        try:
            d = json.load(open(p, encoding="utf-8"))
        except Exception as e:
            messagebox.showerror("Load preset failed", str(e)); return
        self._apply_style_preset(d)
        if d.get("theme") in THEMES:
            self.set_theme(d["theme"])   # syncs both toolbars + ctk appearance
        self._reload_groups()
        if d.get("cues_v2") and apply_cues_v2(self._project, d["cues_v2"]):
            self._rebuild_render()
        elif d.get("cues_v2"):
            self.log("⚠ saved cues don't match this lyrics source — kept defaults")
        self.log(f"✓ Loaded preset ← {p}")

    # _apply_style_preset is inherited from app_base.App (shared style loader).

    # ── cue-model mutations (used by the editor) ──
    def words_in_layout(self):
        """Ordered list of (wid_repr) — here we expose per-word rows for the table:
        returns list of (gidx, lidx, tidx, token) in display order."""
        rows = []
        for gi, g in enumerate(self._project["layout"]):
            for li, ln in enumerate(g["lines"]):
                for ti, tok in enumerate(ln["toks"]):
                    rows.append((gi, li, ti, tok))
        return rows

    def _next_color(self, lane):
        used = {t["color"] for t in self._project[lane]}
        pal = self._project["palette"]
        for c in range(len(pal)):
            if c not in used:
                return c
        return len(self._project[lane]) % len(pal)

    def make_tag(self, lane, ids):
        if len(ids) < 1:
            return
        self.push_undo()
        tags = self._project[lane]
        ids = set(ids)
        # remove these ids from existing tags (a word belongs to one tag/lane)
        for t in tags:
            t["ids"] -= ids
        tags[:] = [t for t in tags if t["ids"]]
        tags.append({"ids": ids, "color": self._next_color(lane), "trigger": None, "dur": None})
        self._rebuild_render()

    def clear_tag(self, lane, ids):
        self.push_undo()
        for t in self._project[lane]:
            t["ids"] -= set(ids)
        self._project[lane][:] = [t for t in self._project[lane] if t["ids"]]
        self._rebuild_render()

    def set_tag_props(self, lane, ti, trigger, dur):
        self.push_undo()
        self._project[lane][ti]["trigger"] = trigger
        self._project[lane][ti]["dur"] = dur
        self._rebuild_render()

    def set_global(self, key, val):
        self.push_undo()
        self._project["globals"][key] = val
        self._rebuild_render()

    def set_layout_props(self, gi, win_start, win_end, linger, accumulate):
        self.push_undo()
        g = self._project["layout"][gi]
        g["win_start"] = win_start; g["win_end"] = win_end
        g["linger"] = linger; g["accumulate"] = accumulate
        self._rebuild_render()

    def toggle_word_del(self, ids, value):
        self.push_undo()
        idset = set(ids)
        for g in self._project["layout"]:
            for ln in g["lines"]:
                for tok in ln["toks"]:
                    if any(i in idset for i in tok["ids"]):
                        tok["del"] = value
        self._rebuild_render()

    def add_break(self, gi, li, ti, after=True):
        """Split a line at a token boundary (line-break before/after a word)."""
        self.push_undo()
        ln = self._project["layout"][gi]["lines"][li]; toks = ln["toks"]
        pos = ti + 1 if after else ti
        if 0 < pos < len(toks):
            self._project["layout"][gi]["lines"][li:li + 1] = [{"toks": toks[:pos]}, {"toks": toks[pos:]}]
        self._rebuild_render()

    def merge_prev_word(self, gi, li, ti, sep=""):
        """Merge token ti with the previous token (same line)."""
        self.push_undo()
        toks = self._project["layout"][gi]["lines"][li]["toks"]
        if ti > 0:
            ids = toks[ti - 1]["ids"] + toks[ti]["ids"]
            toks[ti - 1:ti + 1] = [{"ids": ids, "sep": sep, "del": toks[ti - 1].get("del", False)}]
        self._rebuild_render()

    # ── layout-lane (event) structure ──
    def layout_merge(self, gidxs):
        """Merge adjacent layout groups (events) into one (concatenate lines)."""
        idx = sorted(set(gidxs))
        if len(idx) < 2 or idx != list(range(idx[0], idx[-1] + 1)):
            self.log("Merge events: select adjacent layout groups"); return
        self.push_undo()
        L = self._project["layout"]; first = L[idx[0]]
        lines = [ln for gi in idx for ln in L[gi]["lines"]]
        merged = {**first, "lines": lines, "win_start": None, "win_end": None}
        self._project["layout"] = L[:idx[0]] + [merged] + L[idx[-1] + 1:]
        self._rebuild_render()

    def layout_ungroup(self, gi):
        """Split an event into one event per line."""
        self.push_undo()
        L = self._project["layout"]; g = L[gi]
        new = [{"label": g["label"], "lines": [ln], "accumulate": g["accumulate"],
                "win_start": None, "win_end": None, "linger": g.get("linger"), "del": False}
               for ln in g["lines"]]
        self._project["layout"] = L[:gi] + new + L[gi + 1:]
        self._rebuild_render()

    def layout_split_event(self, gi, li):
        """Split event gi so that line li starts a new event."""
        self.push_undo()
        L = self._project["layout"]; g = L[gi]
        if 0 < li < len(g["lines"]):
            a = {**g, "lines": g["lines"][:li], "win_start": None, "win_end": None}
            b = {**g, "lines": g["lines"][li:], "win_start": None, "win_end": None}
            self._project["layout"] = L[:gi] + [a, b] + L[gi + 1:]
        self._rebuild_render()


class _ToolTip:
    """Delayed hover tooltip shared across the editor's panes."""
    def __init__(self, master, delay=600):
        self.master = master; self.delay = delay
        self.win = None; self.after_id = None; self.last = None

    def schedule(self, text, x, y):
        if text == self.last and self.win:
            return
        self.cancel()
        self.last = text
        self.after_id = self.master.after(self.delay, lambda: self._show(text, x, y))

    def _show(self, text, x, y):
        self.hide()
        self.win = tk.Toplevel(self.master); self.win.wm_overrideredirect(True)
        self.win.wm_geometry(f"+{x}+{y}")
        tk.Label(self.win, text=text, bg="#ffffe0", fg="#000", relief="solid", borderwidth=1,
                 font=("monospace", 9), justify="left", padx=4, pady=2).pack()

    def cancel(self):
        if self.after_id:
            self.master.after_cancel(self.after_id); self.after_id = None

    def hide(self):
        self.cancel(); self.last = None
        if self.win:
            self.win.destroy(); self.win = None


# ─────────────────────────────────────────────────────────────────────
# Cue Table Editor — 3 synced panes (layout | fade-in | fade-out)
# ─────────────────────────────────────────────────────────────────────
class CueTableEditor(ctk.CTkToplevel):
    def __init__(self, app):
        super().__init__(app)
        self.app = app
        self.title("Cue Table — v2")
        self.geometry("1040x700")
        self.transient(app)
        self.collapsed = set()              # collapsed layout-group indices
        self.rows = []                      # line-number -> row meta
        self.sel_lane = None                # 'fin_tags' | 'fout_tags' | 'layout' | 'word'
        self.sel_ids = set()                # working selection of word ids (a lane)
        self.sel_word = None                # (gi,li,ti,wid) for word ops
        self.sel_group = None               # gi for layout props
        self.sel_groups = set()             # multiple layout headers (for merge)
        self._last_click = None             # (lane, wid) — for click-again drill-down
        self._anchor_ln = None              # row line where a drag/range started
        self._dragging = False              # in a B1 drag-select (defer heavy refresh)
        self.couple = tk.BooleanVar(value=False)
        self._tip = _ToolTip(self)
        self.theme_name = getattr(app, "_theme", "Dark") or "Dark"
        self._build()
        self._apply_theme(self.theme_name)
        self.reload()

    def G(self):  # resolved globals
        return self.app._project["globals"]

    def _build(self):
        bar = ctk.CTkFrame(self, fg_color="transparent"); bar.pack(fill="x", padx=4, pady=4)
        def sep():
            ctk.CTkFrame(bar, width=2, height=24, fg_color="gray40").pack(side="left", padx=6)
        ctk.CTkButton(bar, text="↶ Undo", width=64, command=self.app.undo).pack(side="left")
        ctk.CTkButton(bar, text="↷ Redo", width=64, command=self.app.redo).pack(side="left", padx=3)
        sep()
        ctk.CTkButton(bar, text="Group", width=64, command=self._group).pack(side="left")
        ctk.CTkButton(bar, text="Ungroup", width=70, command=self._ungroup).pack(side="left", padx=3)
        ctk.CTkButton(bar, text="Split event", width=80, command=self._split_event).pack(side="left")
        ctk.CTkButton(bar, text="Delete/Restore", width=100, command=self._toggle_del).pack(side="left", padx=3)
        sep()
        ctk.CTkButton(bar, text="Break ▏", width=64, command=lambda: self._break(False)).pack(side="left")
        ctk.CTkButton(bar, text="▏Break", width=64, command=lambda: self._break(True)).pack(side="left", padx=3)
        ctk.CTkButton(bar, text="Merge •", width=70, command=lambda: self._merge("")).pack(side="left")
        ctk.CTkButton(bar, text="Merge ␣", width=70, command=lambda: self._merge(" ")).pack(side="left", padx=3)
        ctk.CTkCheckBox(bar, text="Preview-couple", variable=self.couple).pack(side="right", padx=4)
        self.theme_var = tk.StringVar(value=self.theme_name)
        ctk.CTkOptionMenu(bar, variable=self.theme_var, values=list(THEMES), width=92,
                          command=lambda v: self.app.set_theme(v)).pack(side="right", padx=4)
        ctk.CTkLabel(bar, text="Theme:").pack(side="right")

        mid = ctk.CTkFrame(self, fg_color="transparent"); mid.pack(fill="both", expand=True, padx=4)
        self.vsb = ctk.CTkScrollbar(mid, command=self._yview)
        self.vsb.pack(side="right", fill="y")
        # Each lane = a column frame with its header directly above its pane, so
        # the header always tracks the pane width when the window resizes.
        self.L = self._column(mid, "LAYOUT (event · lines · words)", 52, True)
        self.I = self._column(mid, "FADE-IN", 22, False)
        self.O = self._column(mid, "FADE-OUT", 22, False)
        for pane, lane in ((self.I, "fin_tags"), (self.O, "fout_tags"), (self.L, "layout")):
            pane.bind("<Button-1>", lambda e, p=pane, ln=lane: self._click(e, p, ln))
            pane.bind("<Control-Button-1>", lambda e, p=pane, ln=lane: self._click(e, p, ln, add=True))
            pane.bind("<Shift-Button-1>", lambda e, p=pane, ln=lane: self._range_click(e, p, ln))
            pane.bind("<B1-Motion>", lambda e, p=pane, ln=lane: self._range_click(e, p, ln, light=True))
            pane.bind("<ButtonRelease-1>", lambda e: self._drag_release())
            pane.bind("<Motion>", lambda e, p=pane, ln=lane: self._hover(e, p, ln))
            pane.bind("<Leave>", lambda e: self._tip.hide())
        # Delete key = delete/restore the current selection (unless typing in a field)
        for seq in ("<Delete>", "<KP_Delete>", "<BackSpace>"):
            self.bind(seq, self._key_delete)

        # properties
        outer, self.prop = base.ctk_labelframe(self, "Properties"); outer.pack(fill="x", padx=4, pady=3)
        self._build_props()

        gouter, g = base.ctk_labelframe(self, "Global defaults (changing these updates every inherited value)")
        gouter.pack(fill="x", padx=4, pady=3)
        self.g_fin = tk.StringVar(); self.g_fout = tk.StringVar(); self.g_ling = tk.StringVar()
        for c, (lab, var, key) in enumerate((("fade-in ms", self.g_fin, "fade_in_ms"),
                                             ("fade-out ms", self.g_fout, "fade_out_ms"),
                                             ("linger s", self.g_ling, "linger"))):
            ctk.CTkLabel(g, text=lab).grid(row=0, column=c * 2, sticky="e", padx=4, pady=3)
            e = ctk.CTkEntry(g, textvariable=var, width=70); e.grid(row=0, column=c * 2 + 1, sticky="w")
            e.bind("<Return>", lambda ev, k=key, v=var: self._set_global(k, v))
            e.bind("<FocusOut>", lambda ev, k=key, v=var: self._set_global(k, v))

        foot = ctk.CTkFrame(self, fg_color="transparent"); foot.pack(fill="x", padx=4, pady=3)
        ctk.CTkLabel(foot, text_color="#888", justify="left",
                     text="Click a FADE cell = select its group; Ctrl-click = add to selection, then Group. "
                          "Grey italic = inherited default.").pack(side="left")
        ctk.CTkButton(foot, text="Close", width=70, command=self.destroy).pack(side="right")

    def _column(self, parent, title, width, expand):
        col = ctk.CTkFrame(parent, fg_color="transparent")
        col.pack(side="left", fill="both", expand=expand)
        ctk.CTkLabel(col, text=title, anchor="w",
                     font=ctk.CTkFont(size=12, weight="bold")).pack(fill="x", padx=2)
        return self._mk_text(col, width, expand)

    def _mk_text(self, parent, width, expand=True):
        t = tk.Text(parent, width=width, height=22, font=("monospace", 10), wrap="none",
                    cursor="arrow", yscrollcommand=self._on_text_scroll, highlightthickness=0, padx=4)
        t.pack(fill="both", expand=True)
        t.tag_configure("sel", underline=True)
        t.config(state="disabled")
        return t

    def _apply_theme(self, name):
        th = THEMES.get(name, THEMES["Dark"])
        self.theme_name = name; self.app._theme = name
        pal = th["palette"]
        for t in (self.L, self.I, self.O):
            t.config(bg=th["bg"], fg=th["fg"], insertbackground=th["fg"])
            for i, col in enumerate(pal):
                t.tag_configure(f"bg{i}", background=col)
            t.tag_configure("hdr", foreground=th["hdr"], font=("monospace", 10, "bold"))
            t.tag_configure("inh", foreground=th["inh"], font=("monospace", 10, "italic"))
            t.tag_configure("ovr", foreground=th["ovr"], font=("monospace", 10))
            t.tag_configure("del", foreground=th["del"], overstrike=True, font=("monospace", 10, "italic"))
        # customtkinter appearance drives all chrome (this window + the main app)
        ctk.set_appearance_mode({"Light": "light", "Dark": "dark", "System": "system"}.get(name, "dark"))
        if hasattr(self, "rows"):
            self.reload()

    # synced scrolling
    def _on_text_scroll(self, *a):
        self.vsb.set(*a)
        for t in (self.L, self.I, self.O):
            t.yview_moveto(a[0])
    def _yview(self, *a):
        for t in (self.L, self.I, self.O):
            t.yview(*a)

    # ── render ──
    def reload(self):
        if not self.winfo_exists():
            return
        p = self.app._project
        if p is None:
            return
        self._validate_selection()
        yfrac = self.L.yview()[0] if self.rows else 0.0   # preserve scroll position
        words = p["words"]; G = p["globals"]
        for t in (self.L, self.I, self.O):
            t.config(state="normal"); t.delete("1.0", "end")
        self.rows = []

        def fin_disp(wid, tok_start):
            ti, t = _tag_of(p["fin_tags"], wid)
            if t is None:
                return f"· {tok_start:.2f}", "inh", None
            trig = t["trigger"] if t.get("trigger") is not None else min(words[i]["start"] for i in t["ids"])
            dur = t["dur"] if t.get("dur") is not None else G["fade_in_ms"]
            style = "ovr" if (t.get("trigger") is not None or t.get("dur") is not None) else "inh"
            return f"@{trig:.2f}/{int(dur)}", style, t["color"]

        def fout_disp(wid, tok_end):
            ti, t = _tag_of(p["fout_tags"], wid)
            if t is None:
                return "· none", "inh", None
            trig = t["trigger"] if t.get("trigger") is not None else max(words[i]["end"] for i in t["ids"])
            dur = t["dur"] if t.get("dur") is not None else G["fade_out_ms"]
            style = "ovr" if (t.get("trigger") is not None or t.get("dur") is not None) else "inh"
            return f"@{trig:.2f}/{int(dur)}", style, t["color"]

        for gi, g in enumerate(p["layout"]):
            ids = [i for ln in g["lines"] for tk_ in ln["toks"] for i in tk_["ids"]]
            if ids:
                s = g["win_start"] if g.get("win_start") is not None else min(words[i]["start"] for i in ids)
                ling = g["linger"] if g.get("linger") is not None else G["linger"]
                e = g["win_end"] if g.get("win_end") is not None else max(words[i]["end"] for i in ids) + ling
            else:
                s = e = 0.0
            arrow = "▸" if gi in self.collapsed else "▾"
            dd = "  (deleted)" if g.get("del") else ""
            gcol = gi % len(p["palette"])     # colour each event (layout group) like the fade lanes
            self._row(self.L, f"{arrow} [{g['label']}] {s:.2f}-{e:.2f} {g.get('accumulate','words')}{dd}",
                      "hdr", gcol)
            self._row(self.I, "", None); self._row(self.O, "", None)
            self.rows.append(("hdr", gi))
            if gi in self.collapsed:
                continue
            for li, ln in enumerate(g["lines"]):
                for ti, tok in enumerate(ln["toks"]):
                    wid = tok["ids"][0]
                    ts = min(words[i]["start"] for i in tok["ids"]); te = max(words[i]["end"] for i in tok["ids"])
                    txt = base.token_text(words, tok).strip() or "∅"
                    last_in_line = (ti == len(ln["toks"]) - 1)
                    lmark = " ⏎" if (last_in_line and li < len(g["lines"]) - 1) else ""
                    self._row(self.L, "   " + txt + lmark, "del" if tok.get("del") else "ovr", gcol)
                    # pad fade cells to full column width so the group colour
                    # renders as a solid bar (a Text tag only paints behind text)
                    d, st, col = fin_disp(wid, ts); self._row(self.I, (" " + d).ljust(21), st, col)
                    d, st, col = fout_disp(wid, te); self._row(self.O, (" " + d).ljust(21), st, col)
                    self.rows.append(("word", gi, li, ti, wid))
        for t in (self.L, self.I, self.O):
            t.config(state="disabled")
            t.yview_moveto(yfrac)            # restore scroll position (no view reset)
        self.vsb.set(*self.L.yview())
        self._apply_selection_highlight()
        self._refresh_props()
        # reflect globals
        self.g_fin.set(str(int(G["fade_in_ms"]))); self.g_fout.set(str(int(G["fade_out_ms"])))
        self.g_ling.set(f"{G['linger']:.2f}")

    def _validate_selection(self):
        """Drop selection indices that went stale after a structural edit."""
        p = self.app._project; nL = len(p["layout"])
        if self.sel_group is not None and self.sel_group >= nL:
            self.sel_group = None
        self.sel_groups = {g for g in self.sel_groups if g < nL}
        if self.sel_word:
            gi, li, ti, wid = self.sel_word
            try:
                p["layout"][gi]["lines"][li]["toks"][ti]
            except (IndexError, KeyError):
                self.sel_word = None
        # sel_ids reference canonical word indices (immutable) — always valid

    def _row(self, pane, text, style, color=None):
        start = pane.index("end-1c")
        pane.insert("end", text + "\n")
        end = pane.index("end-1c")
        line = start.split(".")[0]
        if color is not None:
            pane.tag_add(f"bg{color % 10}", f"{line}.0", f"{line}.end")
        if style:
            pane.tag_add(style, f"{line}.0", f"{line}.end")

    # ── interaction ──
    def _row_at(self, pane, ev):
        idx = pane.index(f"@{ev.x},{ev.y}")
        ln = int(idx.split(".")[0]) - 1
        return ln if 0 <= ln < len(self.rows) else None

    def _range_click(self, ev, pane, lane, light=False):
        """Shift-click or click-drag: select the range of rows from the press
        anchor to here (no modifier needed for drag). During a drag (`light`),
        only the cheap highlight is updated; the property panel / preview-couple
        refresh is deferred to <ButtonRelease> to avoid per-motion lag."""
        ln = self._row_at(pane, ev)
        if ln is None or self._anchor_ln is None:
            return
        lo, hi = sorted((self._anchor_ln, ln))
        rng = [self.rows[i] for i in range(lo, hi + 1) if 0 <= i < len(self.rows)]
        gids = {r[1] for r in rng if r[0] == "hdr"}
        wids = {r[4] for r in rng if r[0] == "word"}
        self._last_click = None; self.sel_word = None
        if lane == "layout" and gids and not wids:        # range of event headers → merge target
            self.sel_lane = "layout"; self.sel_groups = gids; self.sel_ids = set()
            self.sel_group = min(gids)
        elif wids:                                         # range of words → fade group / delete
            self.sel_lane = "word" if lane == "layout" else lane
            self.sel_ids = wids; self.sel_groups = set()
            self.sel_group = next((r[1] for r in rng if r[0] == "word"), None)
        else:
            return
        if light:
            self._dragging = True
            self._apply_selection_highlight()   # cheap; full refresh on release
        else:
            self._after_select()

    def _drag_release(self):
        if self._dragging:
            self._dragging = False
            self._refresh_props()               # heavy work once, after the drag
            if self.couple.get():
                self._scrub_to_selection()

    def _key_delete(self, ev):
        # let the Delete key edit text normally when a field has focus
        if isinstance(self.focus_get(), tk.Entry):
            return
        self._toggle_del()

    def _click(self, ev, pane, lane, add=False):
        ln = self._row_at(pane, ev)
        if ln is None:
            return
        self._anchor_ln = ln          # establish anchor for a subsequent drag/shift-click
        self._dragging = False
        row = self.rows[ln]
        if row[0] == "hdr":
            gi = row[1]
            if lane == "layout":
                if ev.x < 20 and not add:          # arrow zone toggles collapse
                    self.collapsed ^= {gi}
                    self.reload(); return
                self.sel_lane = "layout"; self.sel_word = None; self.sel_ids = set()
                self._last_click = None
                if add:
                    self.sel_groups ^= {gi}
                else:
                    self.sel_groups = {gi}
                self.sel_group = gi
            self._after_select()
            return
        _, gi, li, ti, wid = row
        if lane == "layout":
            self.sel_lane = "word"; self.sel_word = (gi, li, ti, wid); self.sel_group = gi
            self.sel_ids = set(); self.sel_groups = set(); self._last_click = None
        else:
            if add:
                self.sel_lane = lane
                self.sel_ids ^= {wid}
                self._last_click = None
            else:
                ti2, t = _tag_of(self.app._project[lane], wid)
                full = set(t["ids"]) if t else {wid}
                # first click on a cell selects its whole group; clicking the SAME
                # cell again drills down to that single word.
                same_cell = (self._last_click == (lane, wid))
                if same_cell and self.sel_ids == full and len(full) > 1:
                    self.sel_ids = {wid}
                else:
                    self.sel_ids = full
                self.sel_lane = lane
                self._last_click = (lane, wid)
            self.sel_group = gi
        self._after_select()

    def _after_select(self):
        self._apply_selection_highlight()
        self._refresh_props()
        if self.couple.get():
            self._scrub_to_selection()

    def _apply_selection_highlight(self):
        for t in (self.L, self.I, self.O):
            t.config(state="normal"); t.tag_remove("sel", "1.0", "end"); t.config(state="disabled")
        pane = {"fin_tags": self.I, "fout_tags": self.O}.get(self.sel_lane)
        if pane and self.sel_ids:
            pane.config(state="normal")
            for ln, row in enumerate(self.rows):
                if row[0] == "word" and row[4] in self.sel_ids:
                    pane.tag_add("sel", f"{ln + 1}.0", f"{ln + 1}.end")
            pane.config(state="disabled")
        if self.sel_lane == "layout" and self.sel_groups:
            self.L.config(state="normal")
            for ln, row in enumerate(self.rows):
                if row[0] == "hdr" and row[1] in self.sel_groups:
                    self.L.tag_add("sel", f"{ln + 1}.0", f"{ln + 1}.end")
            self.L.config(state="disabled")

    # ── hover tooltips: show the resolved default + its source ──
    def _hover(self, ev, pane, lane):
        ln = self._row_at(pane, ev)
        if ln is None:
            self._tip.hide(); return
        txt = self._tip_text(self.rows[ln], lane)
        if txt:
            self._tip.schedule(txt, ev.x_root + 14, ev.y_root + 12)
        else:
            self._tip.hide()

    def _tip_text(self, row, lane):
        p = self.app._project; words = p["words"]; G = p["globals"]
        if row[0] == "hdr":
            if lane == "layout":
                g = p["layout"][row[1]]
                ling = "global %.2fs" % G["linger"] if g.get("linger") is None else "set %.2fs" % g["linger"]
                return f"event window: auto from words unless overridden · linger: {ling}"
            return None
        _, gi, li, ti, wid = row
        if lane == "fin_tags":
            ti2, t = _tag_of(p["fin_tags"], wid)
            if t is None:
                return f"fade-in: own time {words[wid]['start']:.2f}s · dur {int(G['fade_in_ms'])}ms (global)"
            dt = min(words[i]['start'] for i in t["ids"])
            trg = "overridden %.2fs" % t["trigger"] if t.get("trigger") is not None else f"default {dt:.2f}s (first word)"
            dd = "overridden %dms" % int(t["dur"]) if t.get("dur") is not None else f"default {int(G['fade_in_ms'])}ms (global)"
            return f"fade-in group · trigger: {trg} · dur: {dd}"
        if lane == "fout_tags":
            ti2, t = _tag_of(p["fout_tags"], wid)
            if t is None:
                return "fade-out: none (group the word to add one)"
            de = max(words[i]['end'] for i in t["ids"])
            trg = "overridden %.2fs" % t["trigger"] if t.get("trigger") is not None else f"default {de:.2f}s (last word end)"
            dd = "overridden %dms" % int(t["dur"]) if t.get("dur") is not None else f"default {int(G['fade_out_ms'])}ms (global)"
            return f"fade-out group · trigger: {trg} · dur: {dd}"
        return None

    def _scrub_to_selection(self):
        words = self.app._project["words"]; ids = self.sel_ids or ({self.sel_word[3]} if self.sel_word else set())
        if self.sel_group is not None and not ids:
            g = self.app._project["layout"][self.sel_group]
            ids = {i for ln in g["lines"] for tk_ in ln["toks"] for i in tk_["ids"]}
        if ids:
            t = min(words[i]["start"] for i in ids if i < len(words))
            self.app.time_var.set(t); self.app._on_release_time()

    # ── ops (context-aware on the active lane) ──
    def _group(self):
        if self.sel_lane in ("fin_tags", "fout_tags") and self.sel_ids:
            self.app.make_tag(self.sel_lane, set(self.sel_ids))
        elif self.sel_lane == "layout" and len(self.sel_groups) >= 2:
            self.app.layout_merge(self.sel_groups)
        else:
            self.app.log("Group: select fade cells, or 2+ adjacent layout headers.")
    def _ungroup(self):
        if self.sel_lane in ("fin_tags", "fout_tags") and self.sel_ids:
            self.app.clear_tag(self.sel_lane, set(self.sel_ids))
        elif self.sel_lane == "layout" and self.sel_group is not None:
            self.app.layout_ungroup(self.sel_group)
    def _split_event(self):
        if self.sel_word:
            gi, li, ti, _ = self.sel_word
            self.app.layout_split_event(gi, li)
        else:
            self.app.log("Split event: select a word; its line starts the new event.")
    def _toggle_del(self):
        if self.sel_word:
            gi, li, ti, wid = self.sel_word
            tok = self.app._project["layout"][gi]["lines"][li]["toks"][ti]
            self.app.toggle_word_del(tok["ids"], not tok.get("del", False))
        elif self.sel_ids:
            self.app.toggle_word_del(self.sel_ids, True)
    def _break(self, after):
        if self.sel_word:
            gi, li, ti, _ = self.sel_word; self.app.add_break(gi, li, ti, after)
    def _merge(self, sep):
        if self.sel_word:
            gi, li, ti, _ = self.sel_word; self.app.merge_prev_word(gi, li, ti, sep)

    def _set_global(self, key, var):
        try:
            v = float(var.get())
        except ValueError:
            return
        if v != self.G().get(key):
            self.app.set_global(key, v)

    # ── property panels ──
    def _build_props(self):
        self.pf = ctk.CTkFrame(self.prop, fg_color="transparent"); self.pf.pack(fill="x", padx=4, pady=3)

    def _refresh_props(self):
        for w in self.pf.winfo_children():
            w.destroy()
        p = self.app._project
        if self.sel_lane == "layout" and self.sel_group is not None:
            g = p["layout"][self.sel_group]
            ctk.CTkLabel(self.pf, text=f"Layout group [{g['label']}]").grid(row=0, column=0, columnspan=2, sticky="w")
            self._pe("win start (s)", g.get("win_start"), 1, "auto")
            self._pe("win end (s)", g.get("win_end"), 2, "auto")
            self._pe("linger (s)", g.get("linger"), 3, f"{self.G()['linger']:.2f} (global)")
            ctk.CTkLabel(self.pf, text="accumulate").grid(row=4, column=0, sticky="e", padx=4)
            self.acc_v = tk.StringVar(value=g.get("accumulate", "words"))
            ctk.CTkOptionMenu(self.pf, variable=self.acc_v, width=90,
                              values=["words", "lines", "off"]).grid(row=4, column=1, sticky="w")
            ctk.CTkButton(self.pf, text="Apply", width=70, command=self._apply_layout).grid(row=5, column=1, sticky="w", pady=3)
            self._ws = self.pf.grid_slaves(row=1, column=1)[0]
            self._we = self.pf.grid_slaves(row=2, column=1)[0]
            self._wl = self.pf.grid_slaves(row=3, column=1)[0]
        elif self.sel_lane in ("fin_tags", "fout_tags") and self.sel_ids:
            ti, t = _tag_of(p[self.sel_lane], next(iter(self.sel_ids)))
            lane = "Fade-in" if self.sel_lane == "fin_tags" else "Fade-out"
            ctk.CTkLabel(self.pf, text=f"{lane} group ({len(self.sel_ids)} words)").grid(row=0, column=0, columnspan=3, sticky="w")
            words = p["words"]
            if t:
                if self.sel_lane == "fin_tags":
                    deftrig = min(words[i]["start"] for i in t["ids"]); defdur = self.G()["fade_in_ms"]
                else:
                    deftrig = max(words[i]["end"] for i in t["ids"]); defdur = self.G()["fade_out_ms"]
                self._pe("trigger (s)", t.get("trigger"), 1, f"{deftrig:.2f} (boundary word)")
                self._pe("dur (ms)", t.get("dur"), 2, f"{int(defdur)} (global)")
                ctk.CTkButton(self.pf, text="Apply", width=70, command=lambda: self._apply_tag(ti)).grid(row=3, column=1, sticky="w", pady=3)
                self._tg = self.pf.grid_slaves(row=1, column=1)[0]
                self._td = self.pf.grid_slaves(row=2, column=1)[0]
            else:
                ctk.CTkLabel(self.pf, text="(ungrouped — click Group to create a fade group)").grid(row=1, column=0, columnspan=3, sticky="w")
        elif self.sel_word:
            gi, li, ti, wid = self.sel_word
            tok = p["layout"][gi]["lines"][li]["toks"][ti]
            ctk.CTkLabel(self.pf, text=f"Word: {base.token_text(p['words'], tok).strip()!r}  "
                                      f"(start {p['words'][wid]['start']:.2f}s)  "
                                      f"{'[deleted]' if tok.get('del') else ''}").grid(row=0, column=0, sticky="w")
        else:
            ctk.CTkLabel(self.pf, text="Select a layout header, a fade cell, or a word.").grid(row=0, column=0, sticky="w")

    def _pe(self, label, value, row, default_hint):
        ctk.CTkLabel(self.pf, text=label).grid(row=row, column=0, sticky="e", padx=4)
        e = ctk.CTkEntry(self.pf, width=90)
        if value is not None:
            e.insert(0, f"{value:.2f}" if isinstance(value, float) else str(value))
        e.grid(row=row, column=1, sticky="w", pady=2)
        ctk.CTkLabel(self.pf, text=f"↳ {default_hint}", text_color="#888",
                     font=ctk.CTkFont(size=11, slant="italic")).grid(row=row, column=2, sticky="w", padx=4)

    @staticmethod
    def _f(entry):
        s = entry.get().strip()
        return None if s == "" else float(s)

    def _apply_layout(self):
        try:
            self.app.set_layout_props(self.sel_group, self._f(self._ws), self._f(self._we),
                                      self._f(self._wl), self.acc_v.get())
        except ValueError:
            self.app.log("Layout props must be numbers or blank.")

    def _apply_tag(self, ti):
        try:
            self.app.set_tag_props(self.sel_lane, ti, self._f(self._tg), self._f(self._td))
        except ValueError:
            self.app.log("Tag props must be numbers or blank.")


if __name__ == "__main__":
    AppV2().mainloop()
