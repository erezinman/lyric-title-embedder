// test-util/dispatch.ts — /api/call capture + server-echo helpers (extracted
// from the Editor.merge.test.tsx pattern).
import { vi } from "vitest";
import { act } from "@testing-library/react";
import { FakeWS } from "./fakews";
import type { Project } from "../types";

/** Mock fetch to capture every /api/* request; returns the spy. */
export function mockApi() {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ result: {} }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }) as Response,
  );
}

export interface Dispatch { tool: string; args: Record<string, unknown> }

/** All parsed /api/call dispatches so far. */
export function dispatches(): Dispatch[] {
  const fetchMock = globalThis.fetch as unknown as { mock: { calls: unknown[][] } };
  return fetchMock.mock.calls
    .filter((c) => String(c[0]).includes("/api/call"))
    .map((c) => {
      try { return JSON.parse((c[1] as RequestInit).body as string) as Dispatch; }
      catch { return null; }
    })
    .filter((d): d is Dispatch => d != null);
}

/** Dispatches of one tool. */
export const dispatchesOf = (tool: string): Dispatch[] => dispatches().filter((d) => d.tool === tool);

/** Clear captured dispatches (between phases of one test). */
export function clearDispatches(): void {
  (globalThis.fetch as unknown as { mockClear: () => void }).mockClear();
}

/** Push a server state echo through the live FakeWS. */
export function emitState(state: Project): void {
  act(() => { FakeWS.last!.emit({ type: "state", state }); });
}
