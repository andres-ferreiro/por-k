import { cn } from "@/lib/utils";

export function DeltaBadge({
  current,
  previous,
  inverted = false,
}: {
  current: number;
  previous: number;
  /** If true, a positive delta is styled as negative (e.g. for "failed" counts) */
  inverted?: boolean;
}) {
  if (previous === 0) return null;

  const raw = ((current - previous) / Math.abs(previous)) * 100;
  const pct = Math.round(raw);
  if (pct === 0) return <span className="text-xs text-muted-foreground">Sin cambio</span>;

  const isUp = pct > 0;
  const good = inverted ? !isUp : isUp;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums",
        good
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
          : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
      )}
    >
      {isUp ? "↑" : "↓"} {Math.abs(pct)}%
    </span>
  );
}
