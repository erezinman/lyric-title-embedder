import { useEffect, useState } from "react";
import { getEnv, projects } from "../../api/client";
import { isDesktop, pickOpen } from "../../model/desktop";

type Source = "suno_json" | "srt";
type Provide = "upload" | "path";
type LineBreak = "none" | "every_n" | "punctuation" | "per_cue";

export function CreateProjectModal({
  onCreated,
  onClose,
}: {
  onCreated: (name: string) => void;
  onClose: () => void;
}) {
  const [canServerPaths, setCanServerPaths] = useState(false);
  const [name, setName] = useState("");
  const [source, setSource] = useState<Source>("suno_json");

  const [lyricsMode, setLyricsMode] = useState<Provide>("upload");
  const [lyricsFile, setLyricsFile] = useState<File | null>(null);
  const [lyricsPath, setLyricsPath] = useState("");

  const [videoMode, setVideoMode] = useState<Provide>("upload");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPath, setVideoPath] = useState("");

  const [groupBy, setGroupBy] = useState<"section" | "line">("section");
  const [skipDashes, setSkipDashes] = useState(true);
  const [lineBreak, setLineBreak] = useState<LineBreak>("none");
  const [nWords, setNWords] = useState(5);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreate =
    name.trim() !== "" &&
    (lyricsMode === "upload" ? lyricsFile !== null : lyricsPath.trim() !== "");

  useEffect(() => { void getEnv().then((e) => setCanServerPaths(e.can_use_server_paths)).catch(() => setCanServerPaths(false)); }, []);

  const browseLyrics = async () => {
    const ext = source === "srt" ? ["srt"] : ["json"];
    const p = await pickOpen({ filters: [{ name: "Lyrics", extensions: ext }] });
    if (p) { setLyricsMode("path"); setLyricsPath(p); }
  };
  const browseVideo = async () => {
    const p = await pickOpen({ filters: [{ name: "Video", extensions: ["mp4", "mov", "mkv", "webm"] }] });
    if (p) { setVideoMode("path"); setVideoPath(p); }
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("name", name);
      fd.set("source", source);
      if (lyricsMode === "upload") { if (lyricsFile) fd.set("lyrics_file", lyricsFile); }
      else fd.set("lyrics_path", lyricsPath);
      if (videoMode === "upload") { if (videoFile) fd.set("video_file", videoFile); }
      else if (videoPath) fd.set("video_path", videoPath);
      if (source === "suno_json") { fd.set("group_by", groupBy); fd.set("skip_dashes", String(skipDashes)); }
      else { fd.set("line_break", lineBreak); fd.set("n_words", String(nWords)); }
      const { opened } = await projects.create(fd);
      onCreated(opened);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const ModeSwitch = ({ mode, set }: { mode: Provide; set: (m: Provide) => void }) => (
    <div className="seg2" role="group">
      <button type="button" className={"seg-btn" + (mode === "upload" ? " on" : "")} onClick={() => set("upload")}>Upload</button>
      {canServerPaths && (
        <button type="button" className={"seg-btn" + (mode === "path" ? " on" : "")} onClick={() => set("path")}>Server path</button>
      )}
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal cpm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="ks-h2">New project</h2>
          <button className="btn ghost" onClick={onClose} aria-label="Close">×</button>
        </div>

        <label className="fld">
          <span>Project name</span>
          <input className="text-inp" aria-label="Project name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <div className="fld">
          <span>Source</span>
          <div className="seg2" role="group">
            <button type="button" className={"seg-btn" + (source === "suno_json" ? " on" : "")} onClick={() => setSource("suno_json")}>Suno JSON</button>
            <button type="button" className={"seg-btn" + (source === "srt" ? " on" : "")} onClick={() => setSource("srt")}>SRT</button>
          </div>
        </div>

        <div className="fld">
          <span>Lyrics</span>
          <ModeSwitch mode={lyricsMode} set={setLyricsMode} />
          {isDesktop && (
            <button type="button" className="btn ghost browse-btn" aria-label="Browse lyrics"
                    onClick={() => void browseLyrics()}>Browse…</button>
          )}
          {lyricsMode === "upload" ? (
            <input type="file" aria-label="Lyrics file" accept={source === "srt" ? ".srt,text/plain" : ".json,application/json"}
                   onChange={(e) => setLyricsFile(e.target.files?.[0] ?? null)} />
          ) : (
            <input className="text-inp" aria-label="Lyrics server path" value={lyricsPath} onChange={(e) => setLyricsPath(e.target.value)} placeholder="/abs/path/to/lyrics" />
          )}
        </div>

        <div className="fld">
          <span>Video (optional)</span>
          <ModeSwitch mode={videoMode} set={setVideoMode} />
          {isDesktop && (
            <button type="button" className="btn ghost browse-btn" aria-label="Browse video"
                    onClick={() => void browseVideo()}>Browse…</button>
          )}
          {videoMode === "upload" ? (
            <input type="file" aria-label="Video file" accept="video/*" onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)} />
          ) : (
            <input className="text-inp" aria-label="Video server path" value={videoPath} onChange={(e) => setVideoPath(e.target.value)} placeholder="/abs/path/to/video.mp4" />
          )}
        </div>

        <details className="adv">
          <summary>Advanced</summary>
          {source === "suno_json" ? (
            <>
              <label className="fld">
                <span>Group by</span>
                <select className="combo" aria-label="Group by" value={groupBy} onChange={(e) => setGroupBy(e.target.value as "section" | "line")}>
                  <option value="section">Section</option>
                  <option value="line">Line</option>
                </select>
              </label>
              <label className="fld row">
                <input type="checkbox" checked={skipDashes} onChange={(e) => setSkipDashes(e.target.checked)} />
                <span>Skip dash-only filler lines</span>
              </label>
            </>
          ) : (
            <>
              <label className="fld">
                <span>Line breaks</span>
                <select className="combo" aria-label="Line breaks" value={lineBreak} onChange={(e) => setLineBreak(e.target.value as LineBreak)}>
                  <option value="none">No breaks (single line)</option>
                  <option value="every_n">Every N words</option>
                  <option value="punctuation">On punctuation</option>
                  <option value="per_cue">One line per cue</option>
                </select>
              </label>
              {lineBreak === "every_n" && (
                <label className="fld">
                  <span>Words per line</span>
                  <input className="text-inp" type="number" min={1} aria-label="Words per line" value={nWords} onChange={(e) => setNWords(Math.max(1, Number(e.target.value) || 1))} />
                </label>
              )}
            </>
          )}
        </details>

        {error && <div className="form-err" role="alert">{error}</div>}

        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={() => void submit()} disabled={busy || !canCreate}>Create</button>
        </div>
      </div>
    </div>
  );
}
