import React from "react";
import { Icon } from "../icons/Icon";

export function Toggle({ on, onClick }: { on: boolean; onClick?: () => void }) {
  return (
    <div className={"toggle " + (on ? "on" : "off")} onClick={onClick}>
      <div className="knob" />
    </div>
  );
}

export function Stepper({ value }: { value: string | number }) {
  return (
    <div className="step">
      <span className="pm">−</span>
      <span className="v">{value}</span>
      <span className="pm">+</span>
    </div>
  );
}

export function Select({ value }: { value: string }) {
  return (
    <div className="select">
      {value}
      <Icon name="chevDown" size={14} />
    </div>
  );
}

export function Combo({ value }: { value: string }) {
  return (
    <div className="combo">
      {value}
      <Icon name="chevDown" size={14} />
    </div>
  );
}

export function Swatches({ colors }: { colors: string[] }) {
  return (
    <div className="swatches">
      {colors.map((c, i) => (
        <i key={i} style={{ background: c }} />
      ))}
    </div>
  );
}

export function Chip({
  on,
  ghost,
  children,
  onClick,
}: {
  on?: boolean;
  ghost?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      className={"chip" + (on ? " on" : "") + (ghost ? " ghost" : "")}
      onClick={onClick}
    >
      {on && <span className="dot" />}
      {children}
    </div>
  );
}
