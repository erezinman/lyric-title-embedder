import "@testing-library/jest-dom/vitest";

// Polyfill PointerEvent for jsdom (which lacks it).
// fireEvent.pointerDown/Move/Up create PointerEvent instances; without this
// polyfill they fall back to plain Event and clientX/movementX are undefined.
if (typeof window !== "undefined" && typeof window.PointerEvent === "undefined") {
  class PointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;
    isPrimary: boolean;
    constructor(type: string, params: PointerEventInit & MouseEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
      this.pointerType = params.pointerType ?? "mouse";
      this.isPrimary = params.isPrimary ?? true;
    }
  }
  (window as any).PointerEvent = PointerEvent;
}
