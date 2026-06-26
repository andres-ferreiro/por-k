import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTransferHistory } from "@/lib/api/transfer-driver.functions";
import { formatDateLabel } from "@/lib/bodega-deadline";
import { StatusBadge } from "@/components/admin/status-badge";

export const Route = createFileRoute("/_authenticated/supply-driver/history")({
  component: TransferHistoryPage,
});

function TransferHistoryPage() {
  const fetchHistory = useServerFn(getTransferHistory);
  const historyQ = useQuery({
    queryKey: ["transferHistory"],
    queryFn: () => fetchHistory({ data: { limit: 40 } }),
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Historial</h2>
        <p className="text-sm text-muted-foreground">Entregas completadas recientes.</p>
      </div>

      {historyQ.isLoading && (
        <p className="text-sm text-muted-foreground py-8 text-center">Cargando…</p>
      )}

      {!historyQ.isLoading && (historyQ.data ?? []).length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Sin entregas registradas aún.
        </div>
      )}

      <div className="space-y-2">
        {(historyQ.data ?? []).map((row) => (
          <div key={row.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium truncate">{row.branch_name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDateLabel(row.delivery_date)} · Desde {row.bodega_name}
                </p>
              </div>
              {row.order_source === "bodega" && (
                <StatusBadge tone="info" className="text-[10px] shrink-0">Inter-bodega</StatusBadge>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
