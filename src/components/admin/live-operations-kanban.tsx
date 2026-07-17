import type { getLiveOperations } from "@/lib/api/admin.functions";
import { fmtMoney } from "@/lib/format";
import { PaymentStatusBadge, TagBadge } from "@/components/admin/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LiveKanban } from "@/components/admin/live-route-sections";

type LiveData = Awaited<ReturnType<typeof getLiveOperations>>;
type Stop = LiveData["stops"][number];

const COLUMNS = [
  { key: "unvisited" as const, label: "Sin visitar", header: "border-border bg-muted/50 text-muted-foreground", dot: "bg-muted-foreground/50" },
  { key: "pending" as const, label: "Pendiente", header: "border-amber-600/40 bg-amber-500/10 text-amber-800", dot: "bg-amber-500" },
  { key: "delivered" as const, label: "Entregado", header: "border-emerald-600/40 bg-emerald-500/10 text-emerald-800", dot: "bg-emerald-500" },
  { key: "failed" as const, label: "Fallido", header: "border-red-600/40 bg-red-500/10 text-red-800", dot: "bg-red-500" },
];

function StopCard({ stop }: { stop: Stop }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-3 space-y-1.5">
        <div className="font-medium text-sm leading-snug">{stop.customer_name}</div>
        {stop.address && (
          <div className="text-xs text-muted-foreground line-clamp-2">{stop.address}</div>
        )}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <TagBadge className="text-[10px] font-normal normal-case tracking-normal">
            {stop.route_name}
          </TagBadge>
          {stop.driver_name && (
            <span className="text-[10px] text-muted-foreground">{stop.driver_name}</span>
          )}
        </div>
        {stop.status === "delivered" && stop.total > 0 && (
          <div className="text-xs font-semibold tabular-nums text-primary">{fmtMoney(stop.total)}</div>
        )}
        {stop.payment_status && (
          <PaymentStatusBadge status={stop.payment_status} />
        )}
      </CardContent>
    </Card>
  );
}

export function LiveOperationsKanban({
  kanban,
  title,
}: {
  kanban: LiveKanban;
  title?: string;
}) {
  const totalStops =
    kanban.unvisited.length + kanban.pending.length + kanban.delivered.length + kanban.failed.length;

  if (totalStops === 0 && title) return null;

  return (
    <div className="space-y-2">
      {title && (
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-0.5">
          {title}
        </h3>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 min-h-[320px]">
        {COLUMNS.map((col) => {
          const items = kanban[col.key];
          return (
            <div key={col.key} className="flex flex-col min-h-0 rounded-xl border bg-card overflow-hidden">
              <div className={cn("px-3 py-2.5 flex items-center justify-between shrink-0 border-b", col.header)}>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
                  <span className={cn("h-2 w-2 rounded-full", col.dot)} />
                  {col.label}
                </div>
                <span className="text-xs font-bold tabular-nums">{items.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[520px]">
                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">Sin registros</p>
                ) : (
                  items.map((stop) => (
                    <StopCard key={`${stop.route_id}-${stop.customer_id}`} stop={stop} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
