import type { ReactNode } from "react";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function DashboardChartPanel({
  title,
  subtitle,
  children,
  empty,
  emptyMessage = "Sin datos para el período.",
  className,
  contentClassName,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  empty?: boolean;
  emptyMessage?: string;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <div className="min-w-0">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {subtitle && (
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">{subtitle}</p>
          )}
        </div>
      </CardHeader>
      <CardContent className={cn("pt-0", contentClassName)}>
        {empty ? <ChartEmptyState message={emptyMessage} /> : children}
      </CardContent>
    </Card>
  );
}

export function ChartEmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-52 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/20 text-center">
      <BarChart3 className="h-8 w-8 text-muted-foreground/40" aria-hidden />
      <p className="max-w-[16rem] text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

/** Truncate long axis labels for bar charts. */
export function truncateLabel(label: string, max = 14): string {
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1)}…`;
}
