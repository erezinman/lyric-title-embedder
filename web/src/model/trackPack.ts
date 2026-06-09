// trackPack.ts — pure row-packing for the timeline density toggle.
// lanes: one row per group · coherent: each group on one row, non-overlapping
// groups share · compact: greedy first-fit at the token level (groups may scatter).
// Overlap is strict + epsilon-guarded: touching endpoints (a.e == b.s) do NOT overlap.

export type Density = "compact" | "coherent" | "lanes";

export interface PackItem { key: string; gi: number; s: number; e: number; }
export interface PackResult { rows: PackItem[][]; rowOf: Map<string, number>; }

const EPS = 1e-6;
const overlaps = (aS: number, aE: number, bS: number, bE: number) =>
  aS < bE - EPS && bS < aE - EPS;

function build(rows: PackItem[][]): PackResult {
  const rowOf = new Map<string, number>();
  rows.forEach((row, r) => row.forEach((it) => rowOf.set(it.key, r)));
  return { rows, rowOf };
}

function byGroup(items: PackItem[]): Map<number, PackItem[]> {
  const m = new Map<number, PackItem[]>();
  for (const it of items) {
    const arr = m.get(it.gi);
    if (arr) arr.push(it);
    else m.set(it.gi, [it]);
  }
  return m;
}

function packLanes(items: PackItem[]): PackResult {
  const g = byGroup(items);
  const gis = [...g.keys()].sort((a, b) => a - b);
  return build(gis.map((gi) => g.get(gi)!));
}

function packCompact(items: PackItem[]): PackResult {
  const order = [...items].sort((a, b) => a.s - b.s || a.e - b.e);
  const rows: PackItem[][] = [];
  const ends: number[] = [];
  for (const it of order) {
    let r = ends.findIndex((end) => it.s >= end - EPS);
    if (r === -1) { r = ends.length; ends.push(0); rows.push([]); }
    ends[r] = it.e; // touching endpoints (a.e == b.s) do NOT overlap → share row
    rows[r].push(it);
  }
  return build(rows);
}

function packCoherent(items: PackItem[]): PackResult {
  const g = byGroup(items);
  const groups = [...g.entries()]
    .map(([gi, its]) => ({ gi, its, first: Math.min(...its.map((i) => i.s)) }))
    .sort((a, b) => a.first - b.first || a.gi - b.gi);
  const rows: PackItem[][] = [];
  for (const grp of groups) {
    let target = rows.findIndex(
      (row) => !grp.its.some((it) => row.some((ri) => overlaps(it.s, it.e, ri.s, ri.e))),
    );
    if (target === -1) { target = rows.length; rows.push([]); }
    rows[target].push(...grp.its);
  }
  return build(rows);
}

export function packTimeline(items: PackItem[], density: Density): PackResult {
  if (density === "lanes") return packLanes(items);
  if (density === "compact") return packCompact(items);
  return packCoherent(items);
}
