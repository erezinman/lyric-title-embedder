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
import os, json, tkinter as tk
from tkinter import filedialog, messagebox
import customtkinter as ctk
import app_base as base
import engine
import controller
from engine.model import make_project, _tag_of, BUILTIN, PALETTE
from engine.render import project_to_render
project_to_render_v2 = project_to_render
make_project_v2 = make_project          # back-compat name used elsewhere/tests

from engine.ass import build_ass
build_ass_v2 = build_ass

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



from engine.io import serialize_cues, apply_cues
serialize_cues_v2 = serialize_cues
apply_cues_v2 = apply_cues


# ─────────────────────────────────────────────────────────────────────
# App (subclass v1; swap model/build/editor)
# ─────────────────────────────────────────────────────────────────────
class AppV2(base.App):
    def __init__(self):
        self._session = None            # so the _project setter is safe during base __init__
        super().__init__()
        self._session = controller.Session(on_change=self._rebuild_render)
        if getattr(self, "_pending_project", None) is not None:
            self._session.set_project(self._pending_project)
        self.title("Karaoke Subtitle Studio v2")
        self._theme = getattr(self, "_theme", "Dark")
        # v2 embeds the cue dock in the bottom area, so it needs a taller window
        # than the v1 base default (v1 never mounts the dock).
        self.geometry("1280x960")
        self.dock_holder.configure(height=340)
        self._build_toolbar()

    @property
    def _project(self):
        s = getattr(self, "_session", None)
        return s.project if s is not None else getattr(self, "_pending_project", None)

    @_project.setter
    def _project(self, v):
        s = getattr(self, "_session", None)
        if s is None:
            self._pending_project = v       # before the session exists (base __init__)
        else:
            s.set_project(v)

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

    def _build_left_rail(self, main):
        rail = ctk.CTkTabview(main, width=500)
        rail.grid(row=0, column=0, sticky="nsew", padx=(0, 6))
        rail.add("Style"); rail.add("Inspector")
        style_tab = ctk.CTkScrollableFrame(rail.tab("Style"), label_text="")
        style_tab.pack(fill="both", expand=True)
        self._build_io(style_tab)
        self._build_style(style_tab)
        self._bind_mousewheel(style_tab)
        self.inspector_tab = ctk.CTkScrollableFrame(rail.tab("Inspector"), label_text="")
        self.inspector_tab.pack(fill="both", expand=True)

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

    # undo
    def undo(self):
        self._session.undo()

    def redo(self):
        self._session.redo()

    # _generate / _render_exact are inherited from app_base.App (they call the
    # _build_ass hook above), so no override is needed here.

    def _ensure_dock(self):
        if getattr(self, "_editor", None) is not None and self._editor.winfo_exists():
            return
        self._dock_win = None
        self._dock_detached = False
        self._editor = CueDock(self.dock_holder, self)
        self._editor.pack(fill="both", expand=True)
        self._dock_sep.pack(fill="x", before=self._action_bar)
        self.dock_holder.pack(fill="x", before=self._action_bar)

    def toggle_dock_detached(self):
        detached = not getattr(self, "_dock_detached", False)
        if getattr(self, "_editor", None) is not None and self._editor.winfo_exists():
            self._editor.destroy()
        if getattr(self, "_dock_win", None) is not None and self._dock_win.winfo_exists():
            self._dock_win.destroy()
        self._dock_win = None
        if detached:
            self._dock_sep.pack_forget(); self.dock_holder.pack_forget()
            self._dock_win = ctk.CTkToplevel(self)
            self._dock_win.title("Cue dock"); self._dock_win.geometry("1040x700")
            self._editor = CueDock(self._dock_win, self)
            self._editor.pack(fill="both", expand=True)
        else:
            self._editor = CueDock(self.dock_holder, self)
            self._editor.pack(fill="both", expand=True)
            self._dock_sep.pack(fill="x", before=self._action_bar)
            self.dock_holder.pack(fill="x", before=self._action_bar)
        self._dock_detached = detached
        self._editor.reload()

    def _on_project_loaded(self):
        self._ensure_dock()

    def open_editor(self):
        self._ensure_dock()
        if getattr(self, "_dock_win", None) is not None and self._dock_win.winfo_exists():
            self._dock_win.lift()
        return self._editor

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

    def make_tag(self, lane, ids):                 self._session.do("make_tag", lane, set(ids))
    def clear_tag(self, lane, ids):                self._session.do("clear_tag", lane, set(ids))
    def set_tag_props(self, lane, ti, trigger, dur): self._session.do("set_tag_props", lane, ti, trigger, dur)
    def set_global(self, key, val):                self._session.do("set_global", key, val)
    def set_layout_props(self, gi, win_start, win_end, linger, accumulate):
        self._session.do("set_layout_props", gi, win_start, win_end, linger, accumulate)
    def set_group_style(self, gi, partial):        self._session.do("set_group_style", gi, partial)
    def set_cue_style(self, ids, partial):         self._session.do("set_cue_style", set(ids), partial)
    def toggle_word_del(self, ids, value):         self._session.do("toggle_word_del", set(ids), value)
    def add_break(self, gi, li, ti, after=True):   self._session.do("add_break", gi, li, ti, after)
    def merge_prev_word(self, gi, li, ti, sep=""): self._session.do("merge_prev_word", gi, li, ti, sep)
    def layout_ungroup(self, gi):                  self._session.do("layout_ungroup", gi)
    def layout_split_event(self, gi, li):          self._session.do("layout_split_event", gi, li)
    def layout_merge(self, gidxs):
        if not self._session.do("layout_merge", set(gidxs)):
            self.log("Merge events: select adjacent layout groups")


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
class CueDock(ctk.CTkFrame):
    def __init__(self, parent, app):
        super().__init__(parent)
        self.app = app
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

        # properties — built into inspector_tab (clears stale widgets from previous dock instance)
        for _w in self.app.inspector_tab.winfo_children():
            _w.destroy()
        outer, self.prop = base.ctk_labelframe(self.app.inspector_tab, "Properties")
        outer.pack(fill="x", padx=4, pady=3)
        self._build_props()

        gouter, g = base.ctk_labelframe(self.app.inspector_tab, "Global defaults (changing these updates every inherited value)")
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
        ctk.CTkButton(foot, text="Detach ⧉", width=84, command=self.app.toggle_dock_detached).pack(side="right", padx=4)

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
            g_style = g.get("style") or {}
            self._build_style_section(6, "Style — group overrides (blank = inherit)",
                                      g_style, self._glob_style(), "gs", True, self._apply_group_style)
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

    # ── style helpers ──────────────────────────────────────────────────
    def _opt_int(self, var):
        s = var.get().strip()
        return None if s == "" else int(float(s))

    def _opt_bool(self, var):
        v = var.get()
        return None if v == "(inherit)" else (v == "on")

    def _opt_border(self, var):
        v = var.get()
        return None if v == "(inherit)" else (3 if v == "box" else 1)

    def _glob_style(self):
        a = self.app
        return {"font": a.font_var.get(), "fontsize": a.size_var.get(), "bold": a.bold_var.get(),
                "primary": a._color["primary"], "outline": a._color["outline"], "back": a._color["back"],
                "back_alpha": a.backa_var.get(), "outline_w": a.outline_var.get(),
                "shadow": a.shadow_var.get(), "border_style": a.border_var.get()}

    def _build_style_section(self, row0, title, cur_style, gd, prefix, allow_border, apply_cmd):
        import customtkinter as ctk
        from tkinter import colorchooser
        r = row0
        ctk.CTkLabel(self.pf, text=title, font=ctk.CTkFont(size=12, weight="bold")).grid(
            row=r, column=0, columnspan=3, sticky="w", pady=(8, 2)); r += 1
        colors = {}                                   # key -> override hex or None
        def hint(row, text):
            ctk.CTkLabel(self.pf, text=f"↳ {text}", text_color="#888",
                         font=ctk.CTkFont(size=11, slant="italic")).grid(row=row, column=2, sticky="w", padx=4)
        def lab(row, text):
            ctk.CTkLabel(self.pf, text=text).grid(row=row, column=0, sticky="e", padx=4)
        # font (combo with (inherit))
        font_var = ctk.StringVar(value=cur_style.get("font") or "(inherit)")
        lab(r, "font"); cb = ctk.CTkComboBox(self.pf, variable=font_var, width=150,
            values=["(inherit)"] + [f for f in (self.app._fonts or [])]); cb.grid(row=r, column=1, sticky="w")
        hint(r, str(gd["font"])); r += 1
        # fontsize
        size_var = ctk.StringVar(value=("" if cur_style.get("fontsize") is None else str(cur_style["fontsize"])))
        lab(r, "size"); ctk.CTkEntry(self.pf, textvariable=size_var, width=80).grid(row=r, column=1, sticky="w")
        hint(r, f"{gd['fontsize']}"); r += 1
        # bold
        bold_var = ctk.StringVar(value=("(inherit)" if cur_style.get("bold") is None else ("on" if cur_style["bold"] else "off")))
        lab(r, "bold"); ctk.CTkOptionMenu(self.pf, variable=bold_var, width=100,
            values=["(inherit)", "on", "off"]).grid(row=r, column=1, sticky="w")
        hint(r, "on" if gd["bold"] else "off"); r += 1
        # colors: primary / outline / box
        def color_row(row, key, label):
            colors[key] = cur_style.get(key)   # None or hex
            lab(row, label)
            holder = ctk.CTkFrame(self.pf, fg_color="transparent"); holder.grid(row=row, column=1, sticky="w")
            sw = ctk.CTkButton(holder, text="", width=40,
                               fg_color=(colors[key] or gd[key]))
            def pick(_key=key, _sw=sw):
                c = colorchooser.askcolor(color=(colors[_key] or gd[_key]))
                if c and c[1]:
                    colors[_key] = c[1]; _sw.configure(fg_color=c[1])
            def clear(_key=key, _sw=sw):
                colors[_key] = None; _sw.configure(fg_color=gd[_key])
            sw.configure(command=pick); sw.pack(side="left")
            ctk.CTkButton(holder, text="↺", width=26, command=clear).pack(side="left", padx=3)
            hint(row, "inherit" if colors[key] is None else "set")
        color_row(r, "primary", "text color"); r += 1
        color_row(r, "outline", "outline color"); r += 1
        color_row(r, "back", "box color"); r += 1
        # box alpha
        balpha_var = ctk.StringVar(value=(cur_style.get("back_alpha") or ""))
        lab(r, "box alpha"); ctk.CTkEntry(self.pf, textvariable=balpha_var, width=80).grid(row=r, column=1, sticky="w")
        hint(r, str(gd["back_alpha"])); r += 1
        # outline width
        obord_var = ctk.StringVar(value=("" if cur_style.get("outline_w") is None else str(cur_style["outline_w"])))
        lab(r, "outline width"); ctk.CTkEntry(self.pf, textvariable=obord_var, width=80).grid(row=r, column=1, sticky="w")
        hint(r, f"{gd['outline_w']}"); r += 1
        # shadow
        oshad_var = ctk.StringVar(value=("" if cur_style.get("shadow") is None else str(cur_style["shadow"])))
        lab(r, "shadow"); ctk.CTkEntry(self.pf, textvariable=oshad_var, width=80).grid(row=r, column=1, sticky="w")
        hint(r, f"{gd['shadow']}"); r += 1
        # border style (group only)
        border_var = None
        if allow_border:
            cbs = cur_style.get("border_style")
            border_var = ctk.StringVar(value=("(inherit)" if cbs is None else ("box" if cbs == 3 else "outline")))
            lab(r, "box mode"); ctk.CTkOptionMenu(self.pf, variable=border_var, width=100,
                values=["(inherit)", "outline", "box"]).grid(row=r, column=1, sticky="w")
            hint(r, "box" if gd["border_style"] == 3 else "outline"); r += 1
        ctk.CTkButton(self.pf, text="Apply style", width=90, command=apply_cmd).grid(row=r, column=1, sticky="w", pady=4); r += 1
        # stash controls under the prefix for the apply method
        setattr(self, f"_{prefix}_font", font_var); setattr(self, f"_{prefix}_size", size_var)
        setattr(self, f"_{prefix}_bold", bold_var); setattr(self, f"_{prefix}_balpha", balpha_var)
        setattr(self, f"_{prefix}_obord", obord_var); setattr(self, f"_{prefix}_oshad", oshad_var)
        setattr(self, f"_{prefix}_border", border_var); setattr(self, f"_{prefix}_colors", colors)
        return r

    def _build_group_partial(self, prefix, allow_border):
        partial = {}
        fv = getattr(self, f"_{prefix}_font").get()
        partial["font"] = None if fv in ("", "(inherit)") else fv
        partial["fontsize"] = self._opt_int(getattr(self, f"_{prefix}_size"))
        partial["bold"] = self._opt_bool(getattr(self, f"_{prefix}_bold"))
        ba = getattr(self, f"_{prefix}_balpha").get().strip()
        partial["back_alpha"] = None if ba == "" else ba.upper()[:2]
        partial["outline_w"] = self._opt_int(getattr(self, f"_{prefix}_obord"))
        partial["shadow"] = self._opt_int(getattr(self, f"_{prefix}_oshad"))
        if allow_border and getattr(self, f"_{prefix}_border") is not None:
            partial["border_style"] = self._opt_border(getattr(self, f"_{prefix}_border"))
        partial.update(getattr(self, f"_{prefix}_colors"))   # {primary/outline/back: hex or None}
        return partial

    def _apply_group_style(self):
        if self.sel_group is None:
            return
        try:
            self.app.set_group_style(self.sel_group, self._build_group_partial("gs", True))
        except ValueError:
            self.app.log("Style values must be numbers or blank.")


if __name__ == "__main__":
    AppV2().mainloop()
