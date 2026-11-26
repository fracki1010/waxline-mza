// Human summary of a queued write: its kind plus the field that identifies it on screen.
export function summarize(entry: { label: string; body: Record<string, unknown> }): string {
  const who = entry.body.customerName ?? entry.body.name ?? entry.body.plate ?? "";
  return who ? `${entry.label}: ${String(who)}` : entry.label;
}
