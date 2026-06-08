// VideoControl.tsx — Feature A: attach / swap / clear the project video after
// creation. Four states (Empty / Attached / Swapping / Confirm-clear) per the
// design handoff (design-system/handoff-a1/preview/video-control.html). Upload
// and clear round-trip through /api/video (FormData / DELETE); the new video
// object {path,w,h,duration_s} from the WS state echo drives the Attached meta.
import { useRef, useState } from "react";
import { Icon } from "../icons/Icon";
import type { VideoMeta } from "../../types";

export interface VideoControlProps {
  video: VideoMeta | null;
  /** Upload a chosen/dropped file (multipart POST /api/video). */
  onUpload: (file: File) => Promise<void>;
  /** Clear the media pointer (DELETE /api/video). Cues/styling are kept. */
  onClear: () => Promise<void>;
}

const ACCEPT = ".mp4,.mov,.mkv,.webm";

/** Filename from a path (handles both / and \ separators). */
export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

/** Duration → "M:SS.ms" (e.g. 42.18 → "0:42.18"); null → "—". */
export function fmtDuration(s: number | null): string {
  if (s == null || !isFinite(s)) return "—";
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  const whole = Math.floor(rem);
  const frac = Math.round((rem - whole) * 100);
  return `${m}:${String(whole).padStart(2, "0")}.${String(frac).padStart(2, "0")}`;
}

export function VideoControl({ video, onUpload, onClear }: VideoControlProps) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Re-entrancy guard: while busy, all action affordances are disabled, so a
  // second attach/swap/clear can't fire mid-flight (no double-swap).
  const upload = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setConfirming(false);
    try { await onUpload(file); } finally { setBusy(false); }
  };

  const clear = async () => {
    if (busy) return;
    setBusy(true);
    try { await onClear(); } finally { setBusy(false); setConfirming(false); }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    void upload(e.dataTransfer.files?.[0]);
  };

  const pickFile = () => { if (!busy) fileRef.current?.click(); };

  const hidden = (
    <input ref={fileRef} type="file" accept={ACCEPT} className="vc-file-input"
      style={{ display: "none" }} aria-hidden="true" tabIndex={-1}
      onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
  );

  // ---- Swapping (busy with a video already attached, or attaching from empty) ----
  if (busy) {
    const name = video ? baseName(video.path) : "video";
    return (
      <div className="vc">
        <div className="vc-hd">Video</div>
        <div className="vc-file" data-state="swapping">
          <span className="vc-thumb busy"><span className="vc-spin" aria-hidden="true" /></span>
          <span className="vc-finfo">
            <span className="vc-fname" title={name}>{name}</span>
            <span className="vc-fmeta"><span className="cy">replacing…</span> · re-probing duration</span>
          </span>
        </div>
        <div className="vc-prog" role="progressbar" aria-label="Re-probing video"><i /></div>
        {hidden}
      </div>
    );
  }

  // ---- Empty (no video) ----
  if (!video) {
    return (
      <div className="vc">
        <div className="vc-hd">Video</div>
        <div className={"vc-well" + (dragOver ? " over" : "")}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}>
          <span className="vc-ic" aria-hidden="true"><Icon name="film" size={22} /></span>
          <span className="vc-cap">Drop a video or <button type="button" className="vc-browse" onClick={pickFile}>browse…</button></span>
          <span className="vc-hint">.mp4 · .mov · .mkv</span>
        </div>
        <button type="button" className="vc-attach" onClick={pickFile}>
          <Icon name="plus" size={14} />Attach video…
        </button>
        {hidden}
      </div>
    );
  }

  const name = baseName(video.path);
  const dims = video.w != null && video.h != null ? `${video.w}×${video.h}` : "—";

  // ---- Confirm-clear (inline danger confirm; reassures cues/styling kept) ----
  if (confirming) {
    return (
      <div className="vc">
        <div className="vc-hd">Video</div>
        <div className="vc-confirm" role="group" aria-label="Confirm clear video">
          <span className="vc-q">Detach <b title={name}>{name}</b>? Cues &amp; styling are kept.</span>
          <span className="vc-cr">
            <button type="button" className="vc-btn" onClick={() => setConfirming(false)}>Cancel</button>
            <button type="button" className="vc-btn danger" onClick={() => void clear()}>Clear video</button>
          </span>
        </div>
        {hidden}
      </div>
    );
  }

  // ---- Attached ----
  return (
    <div className="vc">
      <div className="vc-hd">Video</div>
      <div className="vc-file" data-state="attached">
        <span className="vc-thumb" aria-hidden="true"><Icon name="play" size={14} /></span>
        <span className="vc-finfo">
          <span className="vc-fname" title={name}>{name}</span>
          <span className="vc-fmeta">
            <span className="cy">{dims}</span> · {fmtDuration(video.duration_s)} · <span className="ok">linked</span>
          </span>
        </span>
        <span className="vc-acts">
          <button type="button" className="vc-ib" title="Swap" aria-label="Swap video" onClick={pickFile}>
            <Icon name="undo" size={15} />
          </button>
          <button type="button" className="vc-ib danger" title="Clear" aria-label="Clear video" onClick={() => setConfirming(true)}>
            <Icon name="close" size={14} />
          </button>
        </span>
      </div>
      {hidden}
    </div>
  );
}
