import { cn } from "@/lib/utils";
import {
  DASHBOARD_CHANNEL_LABELS,
  type DashboardChannel,
} from "@/hooks/use-dashboard-channel";

const OPTIONS: DashboardChannel[] = ["all", "dispatch", "preorder"];

export function DashboardRouteFilter({
  value,
  onChange,
  className,
}: {
  value: DashboardChannel;
  onChange: (value: DashboardChannel) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1",
        className,
      )}
      role="tablist"
      aria-label="Filtrar por tipo de ruta"
    >
      {OPTIONS.map((option) => {
        const active = value === option;
        return (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {DASHBOARD_CHANNEL_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}
