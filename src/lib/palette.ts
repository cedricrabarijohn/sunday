export const PALETTE = [
  { name: "indigo", hue: "#6366f1", soft: "rgba(99, 102, 241, 0.14)" },
  { name: "coral",  hue: "#f97316", soft: "rgba(249, 115, 22, 0.16)" },
  { name: "amber",  hue: "#f59e0b", soft: "rgba(245, 158, 11, 0.18)" },
  { name: "lime",   hue: "#84cc16", soft: "rgba(132, 204, 22, 0.18)" },
  { name: "teal",   hue: "#14b8a6", soft: "rgba(20, 184, 166, 0.18)" },
  { name: "sky",    hue: "#0ea5e9", soft: "rgba(14, 165, 233, 0.16)" },
  { name: "pink",   hue: "#ec4899", soft: "rgba(236, 72, 153, 0.16)" },
  { name: "violet", hue: "#a855f7", soft: "rgba(168, 85, 247, 0.16)" },
  { name: "slate",  hue: "#64748b", soft: "rgba(100, 116, 139, 0.18)" },
] as const;

export function colorForId(id: number) {
  const idx = Math.abs(id) % PALETTE.length;
  return PALETTE[idx];
}

export function colorForName(name: string) {
  const found = PALETTE.find((c) => c.name === name);
  return found ?? PALETTE[0];
}
