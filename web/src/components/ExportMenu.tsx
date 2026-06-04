import { useEffect, useState } from "react";
import { getAss, getEnv } from "../api/client";

export function ExportMenu({
  projectName, onBurn, onClose,
}: {
  projectName: string;
  onBurn: (out: string, videoIn?: string) => void;
  onClose: () => void;
}) {
  const [out, setOut] = useState(`${projectName}_subbed.mp4`);
  const [videoIn, setVideoIn] = useState("");
  const [sameHost, setSameHost] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { void getEnv().then((e) => setSameHost(e.same_host)).catch(() => setSameHost(false)); }, []);

  const downloadAss = async () => {
    try {
      const text = await getAss();
      const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
      const a = document.createElement("a");
      a.href = url; a.download = `${projectName}.ass`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="export-pop" onClick={(e) => e.stopPropagation()}>
      <div className="ep-row head">Export</div>
      <label className="ep-row">
        <span>Output file</span>
        <input className="text-inp" aria-label="Output file" value={out} onChange={(e) => setOut(e.target.value)} />
      </label>
      {sameHost && (
        <label className="ep-row">
          <span>Input video (optional override)</span>
          <input className="text-inp" aria-label="Input video" placeholder="project video"
                 value={videoIn} onChange={(e) => setVideoIn(e.target.value)} />
        </label>
      )}
      {err && <div className="form-err" role="alert">{err}</div>}
      <div className="ep-actions">
        <button className="btn ghost" onClick={() => void downloadAss()}>Download .ass</button>
        <button className="btn primary" onClick={() => { onBurn(out, videoIn || undefined); onClose(); }}>Burn video</button>
      </div>
    </div>
  );
}
