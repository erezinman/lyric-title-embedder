#!/usr/bin/env python3
"""Karaoke Subtitle Studio — standalone dialog that turns Suno aligned-lyrics
into an ASS subtitle with per-word fade-in. Controls sit alongside a live,
draggable on-frame preview; optional ffmpeg burn-in.

Stdlib only (tkinter, Tk 8.6 PNG). Needs ffmpeg+libass on PATH for exact
preview / burn; fc-list (fontconfig) for the font picker.

Run:  python3 karaoke_subtitle_gui.py
"""
import json, os, subprocess, tempfile, threading
import tkinter as tk
from tkinter import filedialog, messagebox, colorchooser
import tkinter.font as tkfont
import customtkinter as ctk
from core import *   # HERE, FFMPEG…, helpers, constants (shared, UI-free)
import engine.ffmpeg

ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")



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
        self._action_bar = bar
        self._dock_sep = ctk.CTkFrame(self, height=6, fg_color="gray30", cursor="sb_v_double_arrow")
        self.dock_holder = ctk.CTkFrame(self, height=240)
        self.dock_holder.pack_propagate(False)
        self._dock_sep.bind("<B1-Motion>", self._drag_dock_sep)
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
    # ── model hooks — each front-end app supplies these ──
    def _make_project(self, cfg):
        """Build the editable cue project from cfg['json_path']."""
        raise NotImplementedError
    def _project_to_render(self, project):
        """Flatten the project into render-groups (the shape build/preview consume)."""
        raise NotImplementedError
    def _build_ass(self, cfg, groups):
        """Return (ass_text, n_events) for the given render-groups."""
        raise NotImplementedError
    def _load_cues(self, preset):
        """Apply a preset's cue section onto the freshly-built project (optional)."""
        pass
    def _on_project_loaded(self):
        """Hook after a fresh project is built (e.g. reset undo). Optional."""
        pass

    def _drag_dock_sep(self, ev):
        # raise the dock by dragging the separator up; clamp to a sane range
        new_h = max(140, min(self.winfo_height() - 220, self.dock_holder.winfo_height() - ev.y))
        self.dock_holder.configure(height=new_h)

    def _reload_groups(self):
        if not os.path.isfile(self.json_var.get()):
            return
        try:
            self._project = self._make_project(self.cfg())
            self._on_project_loaded()
            self._rebuild_render()
            self._box_from_margins()
            self._refresh_preview()
        except Exception as e:
            self.log(f"✗ load: {e}")

    def _rebuild_render(self):
        """Recompute render-groups from the project and refresh everything."""
        self._groups = self._project_to_render(self._project) if self._project else []
        if hasattr(self, "time_scale"):
            self.time_scale.configure(to=round(total_duration(self._groups), 1))
        self._refresh_preview()
        if self._editor is not None and self._editor.winfo_exists():
            self._editor.reload()

    def open_editor(self):
        """Open the app's cue editor (subclass provides the editor window)."""
        raise NotImplementedError

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
        self.canvas.delete("tx")
        if not self._groups:
            return
        t = self.time_var.get()
        ev = next((g for g in self._groups if g["start"] <= t <= g["end"]), None)
        if ev is None:
            return
        al = ALIGN_LABELS[self.align_var.get()]
        l, top, r, b = self.box
        ax = l if al in (1, 4, 7) else r if al in (3, 6, 9) else (l + r) / 2
        ay = b if al in (1, 2, 3) else top if al in (7, 8, 9) else (top + b) / 2
        gstyle = ev.get("group_style") or {}
        mode = ev.get("accumulate", "words")
        rows = []
        for line in ev["lines"]:
            ws = line["words"]
            items, widths, fonts = [], [], []
            for w in ws:
                res = self._pv_resolve(w.get("style"), gstyle)
                f = self._pv_font(res["font"], res["fontsize"], res["bold"])
                wtxt = w["text"]
                widths.append(f.measure(wtxt)); fonts.append(f)
                if mode == "words":
                    appeared = w["start_s"] <= t
                elif mode == "lines":
                    appeared = bool(ws) and ws[0]["start_s"] <= t
                else:
                    appeared = True
                items.append((wtxt, res, appeared))
            rows.append((items, widths, fonts))
        n = len(rows)
        lhs = [max((fnt.metrics("linespace") for fnt in fonts), default=0) or 1 for _, _, fonts in rows]
        total_h = sum(lhs)
        block_top = ay - total_h if al in (1, 2, 3) else ay if al in (7, 8, 9) else ay - total_h / 2
        y = block_top
        for (items, widths, fonts), lh in zip(rows, lhs):
            full_w = sum(widths)
            lx = ax if al in (1, 4, 7) else ax - full_w if al in (3, 6, 9) else ax - full_w / 2
            x = lx
            for (wtxt, res, appeared), wbw, fnt in zip(items, widths, fonts):
                if appeared and wtxt.strip():
                    for ox, oy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                        self.canvas.create_text(x + ox, y + oy, text=wtxt, fill=res["outline"],
                                                font=fnt, anchor="nw", tags="tx")
                    self.canvas.create_text(x, y, text=wtxt, fill=res["primary"],
                                            font=fnt, anchor="nw", tags="tx")
                x += wbw
            y += lh

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

    def _pv_gctx(self):
        return {"font": self.font_var.get(), "fontsize": self.size_var.get(),
                "bold": self.bold_var.get(), "primary": self._color["primary"],
                "outline": self._color["outline"]}

    def _pv_resolve(self, word_style, group_style):
        g = self._pv_gctx(); out = {}
        for k in g:
            if (word_style or {}).get(k) is not None:    out[k] = word_style[k]
            elif (group_style or {}).get(k) is not None: out[k] = group_style[k]
            else:                                        out[k] = g[k]
        return out

    def _pv_font(self, family, size, bold):
        import tkinter.font as tkfont
        px = max(8, round(size * self._font_px_factor(family) / self.sy()))
        key = (family, px, bool(bold))
        f = getattr(self, "_pv_fonts", None)
        if f is None:
            f = self._pv_fonts = {}
        if key not in f:
            f[key] = tkfont.Font(family=family, size=-px, weight="bold" if bold else "normal")
        return f[key]

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
            ass_text, _ = self._build_ass(cfg, self._groups)
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
        return engine.ffmpeg.probe_duration(path)

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
        text, n = self._build_ass(cfg, self._groups)
        with open(self.ass_var.get(), "w", encoding="utf-8") as f:
            f.write(text)
        self.log(f"✓ Wrote {self.ass_var.get()}  ({n} events)")
        return n

    def on_generate(self):
        try: self._generate()
        except Exception as e: messagebox.showerror("Generate failed", str(e))

    # ── presets ──
    def _preset_dict(self):
        """Style/placement preset (shared). Subclasses extend with their cues."""
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
        }

    def _apply_style_preset(self, d):
        """Apply the shared style/placement keys from a loaded preset."""
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
        self._apply_style_preset(d)
        self._reload_groups()       # builds the default project from the source
        self._load_cues(d)          # subclass overlays its saved cue edits
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
        cmd = engine.ffmpeg.burn_cmd(self.vid_var.get(), self.ass_var.get(), self.out_var.get())
        total = self._probe_duration(self.vid_var.get()) or total_duration(self._groups) or 1.0
        self._set_progress(0.0, "burning…")
        self.log(f"Burning → {self.out_var.get()}")
        # Worker thread ONLY mutates this dict; the main thread polls it (Tk
        # widget/after calls are not thread-safe and must stay on the main loop).
        self._burn_state = {"frac": 0.0, "done": False, "err": None}

        def run():
            ok, err = engine.ffmpeg.run(cmd, total, lambda f: self._burn_state.__setitem__("frac", f))
            self._burn_state.update(done=True, err=(None if ok else err))

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
