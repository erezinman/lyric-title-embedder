// test-util/fakews.ts — the project's canonical WebSocket mock (extracted from
// Editor.test.tsx). Tests push server state via `FakeWS.last!.emit({...})`.
export class FakeWS {
  static last: FakeWS | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  url: string;
  constructor(url = "") { this.url = url; FakeWS.last = this; setTimeout(() => this.onopen?.(), 0); }
  send() {}
  close() { this.onclose?.(); }
  emit(o: unknown) { this.onmessage?.({ data: JSON.stringify(o) }); }
}

/** Install FakeWS as the global WebSocket (call in beforeEach). */
export function setupFakeWS(): void {
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWS;
}
