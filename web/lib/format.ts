export function tcMs(value: string): number {
  const match = /^(\d{2}):(\d{2})\.(\d{3})$/.exec(value);
  if (!match) return 0;
  return Number(match[1]) * 60000 + Number(match[2]) * 1000 + Number(match[3]);
}

export function msTc(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const minutes = Math.floor(safe / 60000);
  const seconds = Math.floor((safe % 60000) / 1000);
  const millis = safe % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export function bytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function pct(bp: number): string {
  return `${(bp / 100).toFixed(1)}%`;
}

export function short(hash: string | null | undefined, size = 12): string {
  return hash ? hash.slice(0, size) : "—";
}

export function modelLabel(model: string, provider: string): string {
  const lowered = model.toLowerCase();
  if (lowered.includes("gemma-4-31b")) return "Gemma 4 31B";
  if (lowered.includes("gemma-4-e4b")) return "Gemma 4 E4B";
  if (provider === "scripted") return "Scripted cloud";
  if (provider === "rule") return "Rule planner";
  return model.split(":")[0];
}

export function sourceLabel(source: string): string {
  if (source === "cloud") return "Cloud";
  if (source === "local-failover") return "On device · failover";
  return "On device";
}
