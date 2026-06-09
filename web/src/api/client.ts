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

// Deployment capabilities, driven by the daemon's launch-time file-access mode (not
// client IP). native = local/desktop (server paths + burn); transfer = hosted/remote
// (upload + subtitle-download only).
export interface Caps {
  file_access: "native" | "transfer";
  can_use_server_paths: boolean;
  can_burn_video: boolean;
}

export async function getEnv(): Promise<Caps> {
  return jsonOrThrow<Caps>(await fetch("/api/env"));
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

export interface CustomFont { family: string; url: string; ext: string; }
export interface FontsResponse { system: string[]; custom: CustomFont[]; fonts: string[]; }

export async function getFonts(): Promise<string[]> {
  const data = await jsonOrThrow<{ fonts?: string[] }>(await fetch("/api/fonts"));
  return Array.isArray(data?.fonts) ? data.fonts : [];
}

// Full font catalog (system + custom) and per-project custom-font lifecycle. The
// daemon persists uploaded faces (fontsdir wired) so an uploaded family burns.
export const fonts = {
  list: async (): Promise<FontsResponse> => {
    const data = await jsonOrThrow<Partial<FontsResponse>>(await fetch("/api/fonts"));
    return {
      system: Array.isArray(data.system) ? data.system : (Array.isArray(data.fonts) ? data.fonts : []),
      custom: Array.isArray(data.custom) ? data.custom : [],
      fonts: Array.isArray(data.fonts) ? data.fonts : (Array.isArray(data.system) ? data.system : []),
    };
  },
  upload: async (file: File, family?: string): Promise<{ family: string; url: string }> => {
    const form = new FormData();
    form.append("font_file", file, file.name);
    if (family) form.append("family", family);
    const res = await fetch("/api/fonts/upload", { method: "POST", body: form });
    return jsonOrThrow<{ family: string; url: string }>(res);
  },
  remove: async (family: string): Promise<{ deleted: boolean }> => {
    const res = await fetch(`/api/fonts/${encodeURIComponent(family)}`, { method: "DELETE" });
    return jsonOrThrow<{ deleted: boolean }>(res);
  },
};

export type LintSeverity = "blocking" | "advisory" | "info";

export interface LintIssue {
  level: "warn" | "error";
  severity: LintSeverity;
  code: string;
  msg: string;
  where: {
    word_id?: number;
    time?: number;
    placement?: boolean;
    pos?: [number, number];
    scope?: string;
    channel?: string;
    [k: string]: unknown;
  };
}

export async function lint(): Promise<LintIssue[]> {
  return call<LintIssue[]>("lint", {});
}

export async function getAss(): Promise<string> {
  const res = await fetch("/api/ass");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Subtitle text for client-side blob download. No server file write / no server path,
// so these work identically in native and transfer mode (ungated).
export async function getSrt(): Promise<string> {
  const res = await fetch("/api/srt");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export async function getVtt(): Promise<string> {
  const res = await fetch("/api/vtt");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export function getFrameUrl(t: number): string {
  return `/api/frame?t=${t}`;
}

export interface ProjectMeta {
  name: string;
  modified: number | null;   // project.json mtime (epoch seconds)
  duration_s: number | null; // last cue end
  caption: string[] | null;  // up to two preview lines
}

export const projects = {
  list: async (): Promise<ProjectMeta[]> => jsonOrThrow<ProjectMeta[]>(await fetch("/api/projects")),
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
