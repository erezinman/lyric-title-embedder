// Splitter.tsx — draggable pane divider. "vertical" = a column divider that
// drags horizontally (controls a width, e.g. the left rail); "horizontal" = a
// row divider that drags vertically and grows the pane BELOW it when dragged
// up (controls a height, e.g. the bottom dock). Double-click resets; arrow
// keys nudge by 16px. Same window-listener drag pattern as the stage box.
import { useCallback, useEffect, useRef } from "react";

const STEP = 16;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface SplitterProps {
  orientation: "vertical" | "horizontal";
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  onChange: (v: number) => void;
  label?: string;
}

export function Splitter({ orientation, value, min, max, defaultValue, onChange, label }: SplitterProps) {
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const handlersRef = useRef<{ move: (e: PointerEvent) => void; up: () => void } | null>(null);
  const removeListeners = useCallback(() => {
    if (!handlersRef.current) return;
    window.removeEventListener("pointermove", handlersRef.current.move);
    window.removeEventListener("pointerup", handlersRef.current.up);
    handlersRef.current = null;
  }, []);
  useEffect(() => () => removeListeners(), [removeListeners]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const x0 = e.clientX, y0 = e.clientY, v0 = valueRef.current;
    const move = (e2: PointerEvent) => {
      const d = orientation === "vertical" ? e2.clientX - x0 : y0 - e2.clientY;
      onChangeRef.current(clamp(v0 + d, min, max));
    };
    const up = () => removeListeners();
    handlersRef.current = { move, up };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [orientation, min, max, removeListeners]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const grow = orientation === "vertical" ? "ArrowRight" : "ArrowUp";
    const shrink = orientation === "vertical" ? "ArrowLeft" : "ArrowDown";
    if (e.key !== grow && e.key !== shrink) return;
    e.preventDefault();
    onChangeRef.current(clamp(valueRef.current + (e.key === grow ? STEP : -STEP), min, max));
  }, [orientation, min, max]);

  return (
    <div
      className={"splitter " + orientation}
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDoubleClick={() => onChangeRef.current(defaultValue)}
      onKeyDown={onKeyDown}
    />
  );
}
