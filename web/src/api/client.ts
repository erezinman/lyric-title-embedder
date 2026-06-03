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

export async function getRender(): Promise<unknown> {
  return jsonOrThrow(await fetch("/api/render"));
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
  create: async (name: string, lyrics_path: string): Promise<void> => {
    await postJson("/api/projects/new", { name, lyrics_path });
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
