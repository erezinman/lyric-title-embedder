import type { Project } from "../types";

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok || (data && typeof data === "object" && "error" in data)) {
    throw new Error((data && (data as { error?: string }).error) || `HTTP ${res.status}`);
  }
  return data as T;
}

export async function call<T = unknown>(tool: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/call", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, args }),
  });
  const data = await res.json();
  if (!res.ok || (data && "error" in data)) throw new Error(data?.error || `HTTP ${res.status}`);
  return data.result as T;
}

export async function getState(): Promise<Project> {
  return jsonOrThrow<Project>(await fetch("/api/state"));
}

export async function getEnv(): Promise<{ same_host: boolean }> {
  return jsonOrThrow<{ same_host: boolean }>(await fetch("/api/env"));
}

export async function getRender(): Promise<unknown> {
  return jsonOrThrow(await fetch("/api/render"));
}

export interface ConnectInfo {
  host: string;
  port: number;
  api_url: string;
  ws_url: string;
  mcp_url: string;
  token_required: boolean;
}

export async function getConnect(): Promise<ConnectInfo> {
  return jsonOrThrow<ConnectInfo>(await fetch("/api/connect"));
}

export async function getFonts(): Promise<string[]> {
  const data = await jsonOrThrow<{ fonts?: string[] }>(await fetch("/api/fonts"));
  return Array.isArray(data?.fonts) ? data.fonts : [];
}

export async function getAss(): Promise<string> {
  const res = await fetch("/api/ass");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export function getFrameUrl(t: number): string {
  return `/api/frame?t=${t}`;
}

export const projects = {
  list: async (): Promise<string[]> => jsonOrThrow<string[]>(await fetch("/api/projects")),
  open: async (name: string): Promise<void> => { await postJson("/api/projects/open", { name }); },
  save: async (name: string): Promise<void> => { await postJson("/api/projects/save", { name }); },
  create: async (form: FormData): Promise<{ opened: string }> => {
    const res = await fetch("/api/projects/create", { method: "POST", body: form });
    return jsonOrThrow<{ opened: string }>(res);
  },
};

import type { VideoMeta } from "../types";

// Post-create video attach/swap/clear (Feature A). Upload streams bytes via
// multipart; path mode names a same-host server file; clear detaches via DELETE.
export const video = {
  upload: async (file: File): Promise<{ video: VideoMeta | null }> => {
    const form = new FormData();
    form.append("video_file", file, file.name);
    const res = await fetch("/api/video", { method: "POST", body: form });
    return jsonOrThrow<{ video: VideoMeta | null }>(res);
  },
  setPath: async (path: string): Promise<{ video: VideoMeta | null }> =>
    postJson<{ video: VideoMeta | null }>("/api/video", { path }),
  clear: async (): Promise<{ video: VideoMeta | null }> => {
    const res = await fetch("/api/video", { method: "DELETE" });
    return jsonOrThrow<{ video: VideoMeta | null }>(res);
  },
};

export async function burn(out: string, video_in?: string): Promise<{ job_id: string }> {
  return postJson<{ job_id: string }>("/api/burn", { out, video_in });
}

export async function burnStatus(jobId: string): Promise<{ frac: number; done: boolean; ok: boolean; err: string | null; out: string }> {
  return jsonOrThrow(await fetch(`/api/burn/${jobId}`));
}

async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return jsonOrThrow<T>(res);
}
