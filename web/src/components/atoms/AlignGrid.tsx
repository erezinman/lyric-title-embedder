import React, { useEffect } from "react";

const ALIGN: Record<number, string> = {
  1: "Bottom-Left",
  2: "Bottom-Center",
  3: "Bottom-Right",
  4: "Mid-Left",
  5: "Center",
  6: "Mid-Right",
  7: "Top-Left",
  8: "Top-Center",
  9: "Top-Right",
};

// Numpad layout: top row = 7/8/9, middle = 4/5/6, bottom = 1/2/3
const NUMPAD_ORDER = [7, 8, 9, 4, 5, 6, 1, 2, 3];

export interface AlignGridProps {
  value: number;
  onPick: (n: number) => void;
  disabled?: boolean;
  /** Tooltip for the control button (e.g. the disabled-reason when \pos overrides). */
  title?: string;
}

export function AlignGrid({ value, onPick, disabled = false, title }: AlignGridProps) {
  const [open, setOpen] = React.useState(false);
  const cur = value || 2;
  const label = `${ALIGN[cur]} (${cur})`;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="ag-wrap">
      <button
        className="kit-sel"
        aria-label="Alignment" disabled={disabled}
        title={title || undefined}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </button>
      {open && (
        <>
          <div className="ag-back" onClick={() => setOpen(false)} />
          <div className="ag-grid" role="grid" aria-label="Alignment grid">
            {NUMPAD_ORDER.map((n) => (
              <button
                key={n}
                role="button"
                className={"ag-cell" + (cur === n ? " on" : "")}
                aria-label={`${ALIGN[n]} (${n})`}
                title={`${ALIGN[n]} (${n})`}
                onClick={() => {
                  onPick(n);
                  setOpen(false);
                }}
              >
                <span />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
