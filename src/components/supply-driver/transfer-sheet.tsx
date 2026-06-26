import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getTransferOrderDetail,
  markCorrectionDelivered,
  markTransferOrderDelivered,
} from "@/lib/api/transfer-driver.functions";
import { QuantityControl } from "@/components/admin/bodega-quantity-control";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import {
  CorrectionStatusBadge,
  StatusBadge,
  SupplyOrderStatusBadge,
} from "@/components/admin/status-badge";
import { formatDateLabel } from "@/lib/bodega-deadline";
import { toast } from "sonner";

export function TransferSheet({
  orderId,
  onOpenChange,
}: {
  orderId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const open = !!orderId;
  const qc = useQueryClient();
  const getDetail = useServerFn(getTransferOrderDetail);
  const markDelivered = useServerFn(markTransferOrderDelivered);
  const markCorrection = useServerFn(markCorrectionDelivered);
  const [correctionQty, setCorrectionQty] = useState<Record<string, number>>({});

  const detailQ = useQuery({
    queryKey: ["transferOrderDetail", orderId],
    queryFn: () => getDetail({ data: { order_id: orderId! } }),
    enabled: open,
  });

  const order = detailQ.data;
  const isDelivered = order?.status === "delivered";
  const needsCorrection = order?.needs_correction ?? false;

  const shortageItems = useMemo(
    () => (order?.items ?? []).filter((i) => i.shortage_quantity > 0),
    [order?.items],
  );

  useEffect(() => {
    if (!open || !order) return;
    const map: Record<string, number> = {};
    for (const item of shortageItems) {
      map[item.id] = item.shortage_quantity;
    }
    setCorrectionQty(map);
  }, [open, order, shortageItems]);

  const deliverMut = useMutation({
    mutationFn: () => markDelivered({ data: { order_id: orderId! } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transferStops"] });
      qc.invalidateQueries({ queryKey: ["transferDayOverview"] });
      qc.invalidateQueries({ queryKey: ["transferHistory"] });
      qc.invalidateQueries({ queryKey: ["transferOrderDetail"] });
      toast.success("Entrega registrada");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const correctionMut = useMutation({
    mutationFn: () =>
      markCorrection({
        data: {
          order_id: orderId!,
          items: shortageItems.map((item) => ({
            item_id: item.id,
            correction_quantity: correctionQty[item.id] ?? 0,
          })),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transferStops"] });
      qc.invalidateQueries({ queryKey: ["transferDayOverview"] });
      qc.invalidateQueries({ queryKey: ["transferHistory"] });
      qc.invalidateQueries({ queryKey: ["transferOrderDetail"] });
      toast.success("Corrección registrada");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const hasCorrectionQty = shortageItems.some((item) => (correctionQty[item.id] ?? 0) > 0);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90dvh]">
        <DrawerHeader className="text-left border-b">
          <DrawerTitle>{order?.branch_name ?? "Detalle de entrega"}</DrawerTitle>
          {order && (
            <p className="text-xs text-muted-foreground">
              {formatDateLabel(order.delivery_date)} · Desde {order.bodega_name}
            </p>
          )}
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {detailQ.isLoading && (
            <p className="text-sm text-muted-foreground text-center py-8">Cargando…</p>
          )}
          {order && (
            <>
              <div className="flex flex-wrap gap-2">
                <SupplyOrderStatusBadge status={order.status} />
                {order.order_source === "bodega" && (
                  <StatusBadge tone="info">Inter-bodega</StatusBadge>
                )}
                {needsCorrection && (
                  <CorrectionStatusBadge status="pending" />
                )}
                {order.correction_status === "delivered" && (
                  <CorrectionStatusBadge status="delivered" />
                )}
              </div>
              {order.branch_address && (
                <p className="text-sm text-muted-foreground">{order.branch_address}</p>
              )}
              {order.notes && (
                <p className="text-sm rounded-lg border bg-muted/30 px-3 py-2">{order.notes}</p>
              )}

              {needsCorrection ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    La sucursal reportó faltantes. Indica cuánto entregas en esta corrección.
                  </p>
                  <div className="rounded-xl border overflow-hidden">
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-3 py-2 bg-muted/40 border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <span>Producto</span>
                      <span className="w-12 text-right">Ped.</span>
                      <span className="w-12 text-right">Rec.</span>
                      <span className="w-24 text-right">Entregar</span>
                    </div>
                    <ul className="divide-y">
                      {shortageItems.map((item) => (
                        <li
                          key={item.id}
                          className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 items-center px-3 py-3"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{item.name}</p>
                            <p className="text-xs text-destructive tabular-nums">
                              Falta {item.shortage_quantity}
                            </p>
                          </div>
                          <span className="text-sm tabular-nums text-muted-foreground w-12 text-right">
                            {item.quantity}
                          </span>
                          <span className="text-sm tabular-nums text-muted-foreground w-12 text-right">
                            {item.received_quantity ?? "—"}
                          </span>
                          <div className="w-24 flex justify-end">
                            <QuantityControl
                              value={correctionQty[item.id] ?? 0}
                              onChange={(v) =>
                                setCorrectionQty((prev) => ({ ...prev, [item.id]: v }))
                              }
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <ul className="space-y-2">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-3 text-sm">
                      <span className="flex-1">
                        {item.name}
                        <span className="text-muted-foreground text-xs ml-1">({item.unit})</span>
                      </span>
                      <span className="font-bold tabular-nums text-primary">{item.quantity}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <DrawerFooter className="border-t space-y-2">
          {needsCorrection ? (
            <Button
              className="w-full"
              disabled={!hasCorrectionQty || correctionMut.isPending}
              onClick={() => correctionMut.mutate()}
            >
              {correctionMut.isPending ? "Guardando…" : "Registrar corrección"}
            </Button>
          ) : (
            <Button
              className="w-full"
              disabled={!order || isDelivered || deliverMut.isPending}
              onClick={() => deliverMut.mutate()}
            >
              {isDelivered ? "Ya entregado" : deliverMut.isPending ? "Guardando…" : "Marcar como entregado"}
            </Button>
          )}
          <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
