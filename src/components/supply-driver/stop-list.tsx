import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTransferStops } from "@/lib/api/transfer-driver.functions";
import { todayInTZ } from "@/lib/tz";
import { addDays, formatDateLabel } from "@/lib/bodega-deadline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  StatusBadge,
  SupplyOrderStatusBadge,
  TagBadge,
} from "@/components/admin/status-badge";
import { TransferSheet } from "@/components/supply-driver/transfer-sheet";

export function TransferStopList() {
  const fetchStops = useServerFn(getTransferStops);
  const today = todayInTZ();
  const tomorrow = addDays(today, 1);
  const [deliveryDate, setDeliveryDate] = useState(tomorrow);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const stopsQ = useQuery({
    queryKey: ["transferStops", deliveryDate],
    queryFn: () => fetchStops({ data: { delivery_date: deliveryDate } }),
  });

  const stats = useMemo(() => {
    const rows = stopsQ.data ?? [];
    return {
      total: rows.length,
      pending: rows.filter((r) => r.status !== "delivered").length,
      delivered: rows.filter((r) => r.status === "delivered").length,
      corrections: rows.filter((r) => r.needs_correction).length,
    };
  }, [stopsQ.data]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Paradas</h2>
        <p className="text-sm text-muted-foreground">
          Entregas a sucursales e intercambios entre bodegas · {formatDateLabel(deliveryDate)}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Button size="sm" variant={deliveryDate === tomorrow ? "default" : "outline"} onClick={() => setDeliveryDate(tomorrow)}>
          Mañana
        </Button>
        <Button size="sm" variant={deliveryDate === today ? "default" : "outline"} onClick={() => setDeliveryDate(today)}>
          Hoy
        </Button>
        <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="w-auto h-9" />
      </div>

      <div className="flex gap-2 text-xs">
        <TagBadge className="text-[10px] normal-case tracking-normal">{stats.total} paradas</TagBadge>
        <StatusBadge tone="warning" className="text-[10px] normal-case tracking-normal">{stats.pending} pendientes</StatusBadge>
        <StatusBadge tone="primary" className="text-[10px] normal-case tracking-normal">{stats.delivered} entregadas</StatusBadge>
        {stats.corrections > 0 && (
          <StatusBadge tone="danger" className="text-[10px] normal-case tracking-normal">{stats.corrections} correcciones</StatusBadge>
        )}
      </div>

      {stopsQ.isLoading && (
        <p className="text-sm text-muted-foreground py-8 text-center">Cargando paradas…</p>
      )}

      {!stopsQ.isLoading && (stopsQ.data ?? []).length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Sin paradas para esta fecha.
        </div>
      )}

      <div className="space-y-2">
        {(stopsQ.data ?? []).map((stop) => (
          <button
            key={stop.order_id}
            type="button"
            onClick={() => setSelectedOrderId(stop.order_id)}
            className="w-full rounded-xl border bg-card p-4 text-left hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold truncate">{stop.stop_label}</p>
                {stop.branch_address && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{stop.branch_address}</p>
                )}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {stop.is_inter_bodega && <StatusBadge tone="info" className="text-[10px]">Inter-bodega</StatusBadge>}
                  <TagBadge className="text-[10px]">Desde {stop.bodega_name}</TagBadge>
                  <span className="text-xs text-muted-foreground">{stop.item_count} productos</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                {stop.needs_correction && (
                  <StatusBadge tone="danger" className="text-[10px]">Corrección</StatusBadge>
                )}
                <SupplyOrderStatusBadge status={stop.status} />
              </div>
            </div>
          </button>
        ))}
      </div>

      <TransferSheet
        orderId={selectedOrderId}
        onOpenChange={(open) => !open && setSelectedOrderId(null)}
      />
    </div>
  );
}
