import { useEffect, useState } from "react";
import { getAss, getEnv } from "../api/client";
import { Icon } from "./icons/Icon";

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
      setTimeout(() => URL.revokeObjectURL(url), 0);   // defer: revoking synchronously races the download in some engines
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="export-pop" role="dialog" onClick={(e) => e.stopPropagation()}>
      <div className="exp-h">Export</div>
      <div className="exp-sec">
        <label className="exp-l" htmlFor="exp-out">Output filename</label>
        <input id="exp-out" className="exp-inp mono" aria-label="Output file"
               value={out} onChange={(e) => setOut(e.target.value)} />
        {sameHost && (
          <>
            <label className="exp-l" htmlFor="exp-vid">Input video <span className="exp-opt">optional · same-host path · defaults to project video</span></label>
            <input id="exp-vid" className="exp-inp mono" aria-label="Input video" placeholder="project video"
                   value={videoIn} onChange={(e) => setVideoIn(e.target.value)} />
          </>
        )}
        {err && <div className="form-err" role="alert">{err}</div>}
        <button className="btn primary exp-burn" onClick={() => { onBurn(out, videoIn || undefined); onClose(); }}>
          <Icon name="film" size={15} />Burn video
        </button>
      </div>
      <div className="exp-div" />
      <div className="exp-row" role="button" tabIndex={0} aria-label="Download .ass"
           onClick={() => void downloadAss()}
           onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void downloadAss(); } }}>
        <span className="exp-row-i"><Icon name="download" size={16} /></span>
        <span className="exp-row-t">
          <b>Download .ass</b>
          <span className="exp-row-s">Subtitle file only — no render</span>
        </span>
      </div>
    </div>
  );
}
