import { cn } from "@/lib/utils";
import { badgeToneClass } from "@/lib/badge-tones";

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
        badgeToneClass(good ? "success" : "danger", "rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums normal-case tracking-normal"),
      )}
    >
      {isUp ? "↑" : "↓"} {Math.abs(pct)}%
    </span>
  );
}
