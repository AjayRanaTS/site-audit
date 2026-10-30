export function scoreStatus(score: number | null | undefined) {
  if (typeof score !== "number") return { label: "Unavailable", color: "text-slate-400", ring: "#64748b" };
  if (score >= 90) return { label: "Good", color: "text-emerald-300", ring: "#10b981" };
  if (score >= 50) return { label: "Needs improvement", color: "text-amber-300", ring: "#f59e0b" };
  return { label: "Poor", color: "text-rose-300", ring: "#ef4444" };
}

export function emptyFindingsMessage(score: number | null | undefined, verifiedMessage: string) {
  return typeof score === "number" ? verifiedMessage : "PageSpeed category data is unavailable for this run.";
}

export function formatBytes(bytes: unknown) {
  if (typeof bytes !== "number") return "Unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
