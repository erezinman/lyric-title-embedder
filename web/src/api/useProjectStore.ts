import { useEffect, useRef, useState, useCallback } from "react";
import { call as apiCall, getState } from "./client";
import type { Project } from "../types";

export interface BurnMsg { frac: number; done: boolean; ok: boolean; err: string | null; out: string; }

export interface ProjectStore {
  project: Project | null;
  connected: boolean;
  lastExternal: number;
  burn: BurnMsg | null;
  call: <T = unknown>(tool: string, args: Record<string, unknown>) => Promise<T>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws`;
}

export function useProjectStore(): ProjectStore {
  const [project, setProject] = useState<Project | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastExternal, setLastExternal] = useState(0);
  const [burn, setBurn] = useState<BurnMsg | null>(null);
  const inflight = useRef(0);
  const retry = useRef(0);
  const closed = useRef(false);

  useEffect(() => {
    closed.current = false;
    let ws: WebSocket;
    const connect = () => {
      ws = new WebSocket(wsUrl());
      ws.onopen = () => { setConnected(true); retry.current = 0; };
      ws.onmessage = (e: MessageEvent) => {
        const msg = JSON.parse(typeof e.data === "string" ? e.data : "");
        if (msg.type === "state") {
          setProject(msg.state as Project);
          if (inflight.current > 0) inflight.current -= 1; else setLastExternal(Date.now());
        } else if (msg.type === "burn") {
          setBurn(msg.job as BurnMsg);
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (closed.current) return;
        const delay = Math.min(1000 * 2 ** retry.current, 8000);
        retry.current += 1;
        setTimeout(connect, delay);
      };
    };
    connect();
    return () => { closed.current = true; ws?.close(); };
  }, []);

  const call = useCallback(async <T,>(tool: string, args: Record<string, unknown>): Promise<T> => {
    inflight.current += 1;
    try {
      return await apiCall<T>(tool, args);
    } catch (e) {
      inflight.current = Math.max(0, inflight.current - 1);
      throw e;
    }
  }, []);

  const undo = useCallback(async () => { await call("undo", {}); }, [call]);
  const redo = useCallback(async () => { await call("redo", {}); }, [call]);

  return { project, connected, lastExternal, burn, call, undo, redo };
}

// Re-export for callers that need a one-shot REST fetch of the current project
// (e.g. hard-refresh without a WebSocket connection).
export { getState };

