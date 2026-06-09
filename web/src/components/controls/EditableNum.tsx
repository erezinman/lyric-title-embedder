// EditableNum — a click-to-type value cell that drops in place of a stepper's
// value. Shows `display` text as a span until clicked/focused, then swaps to a
// numeric <input> seeded with `value`. Enter/blur commit the parsed result;
// Esc cancels; ArrowUp/Down nudge the input by `step` without committing.
// Ported faithfully from the shipped web app's atoms.jsx.
import { useEffect, useRef, useState } from "react";

export interface EditableNumProps {
  display: string;
  /** Seed for the input (shown via String(value)). Usually a number; pass a string
   *  when the field edits a non-decimal form (e.g. a 2-digit hex alpha byte). */
  value: number | string;
  parse?: (s: string) => number | null;
  onCommit: (n: number) => void;
  step?: number;
  className?: string;
  title?: string;
}

export function EditableNum({
  display,
  value,
  parse,
  onCommit,
  step,
  className,
  title = "Click to type a value",
}: EditableNumProps) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.select();
    }
  }, [editing]);
  const doParse = parse || ((s: string) => parseFloat(s));
  const cls = className ?? "v";
  if (editing) {
    const done = (commit: boolean) => {
      if (commit && ref.current) {
        const n = doParse(ref.current.value);
        if (n != null && !isNaN(n)) onCommit(n);
      }
      setEditing(false);
    };
    return (
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        className={cls + " num-in"}
        defaultValue={String(value)}
        onClick={(e) => e.stopPropagation()}
        onBlur={() => done(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            done(true);
          } else if (e.key === "Escape") {
            e.preventDefault();
            done(false);
          } else if (step && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
            e.preventDefault();
            if (!ref.current) return;
            const cur = doParse(ref.current.value);
            if (cur == null || isNaN(cur)) return;
            ref.current.value = String(+(cur + (e.key === "ArrowUp" ? step : -step)).toFixed(4));
          }
        }}
      />
    );
  }
  return (
    <span
      className={cls}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
    >
      {display}
    </span>
  );
}
