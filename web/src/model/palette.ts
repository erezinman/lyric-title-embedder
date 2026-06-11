export const PALETTE = ["#7A3A5A","#5A4A7A","#3A5A7A","#5A7A3A","#7A6A3A","#3A7A7A","#7A4A4A","#6A3A7A","#3A6A7A","#7A5A3A"] as const;
export function colorForIndex(i: number): string {
  return PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length];
}
export function eventColor(group: { color?: string } | null | undefined, gi: number): string {
  return group?.color || colorForIndex(gi);
}
