import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { getTransferDayOverview } from "@/lib/api/transfer-driver.functions";
import { todayInTZ } from "@/lib/tz";
import { addDays, formatDateLabel } from "@/lib/bodega-deadline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export function TransferDaySummary() {
  const fetchOverview = useServerFn(getTransferDayOverview);
  const today = todayInTZ();
  const tomorrow = addDays(today, 1);
  const [deliveryDate, setDeliveryDate] = useState(tomorrow);
  const [openBodegas, setOpenBodegas] = useState<Set<string>>(new Set());
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

  const overviewQ = useQuery({
    queryKey: ["transferDayOverview", deliveryDate],
    queryFn: () => fetchOverview({ data: { delivery_date: deliveryDate } }),
  });

  const bodegas = overviewQ.data?.bodegas ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Resumen del día</h2>
        <p className="text-sm text-muted-foreground">
          Totales por bodega para cargar la unidad · {formatDateLabel(deliveryDate)}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Button
          size="sm"
          variant={deliveryDate === tomorrow ? "default" : "outline"}
          onClick={() => setDeliveryDate(tomorrow)}
        >
          Mañana
        </Button>
        <Button
          size="sm"
          variant={deliveryDate === today ? "default" : "outline"}
          onClick={() => setDeliveryDate(today)}
        >
          Hoy
        </Button>
        <Input
          type="date"
          value={deliveryDate}
          onChange={(e) => setDeliveryDate(e.target.value)}
          className="w-auto h-9"
        />
      </div>

      {overviewQ.isLoading && (
        <p className="text-sm text-muted-foreground py-8 text-center">Cargando resumen…</p>
      )}

      {!overviewQ.isLoading && bodegas.length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Sin pedidos para esta fecha.
        </div>
      )}

      <div className="space-y-3">
        {bodegas.map((bodega) => {
          const isOpen = openBodegas.has(bodega.bodega_id);
          return (
            <Collapsible
              key={bodega.bodega_id}
              open={isOpen}
              onOpenChange={() =>
                setOpenBodegas((prev) => {
                  const next = new Set(prev);
                  if (next.has(bodega.bodega_id)) next.delete(bodega.bodega_id);
                  else next.add(bodega.bodega_id);
                  return next;
                })
              }
            >
              <div className="rounded-xl border bg-card overflow-hidden">
                <CollapsibleTrigger className="flex w-full items-start gap-3 px-4 py-4 hover:bg-muted/30 transition-colors text-left">
                  <Icon
                    icon={ArrowDown01Icon}
                    className={`h-4 w-4 mt-0.5 text-muted-foreground transition-transform ${isOpen ? "" : "-rotate-90"}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{bodega.bodega_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {bodega.branch_count} destino{bodega.branch_count !== 1 ? "s" : ""} · {bodega.products.length} productos
                    </p>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t divide-y">
                    {bodega.products.map((product) => {
                      const key = `${bodega.bodega_id}:${product.product_id}`;
                      const showBranches = expandedProduct === key;
                      return (
                        <div key={key} className="px-4 py-3">
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-3 text-left"
                            onClick={() => setExpandedProduct(showBranches ? null : key)}
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{product.name}</p>
                              <p className="text-xs text-muted-foreground">{product.unit}</p>
                            </div>
                            <Badge variant="primary" className="tabular-nums shrink-0">
                              {product.total_quantity}
                            </Badge>
                          </button>
                          {showBranches && (
                            <ul className="mt-2 ml-1 space-y-1 text-xs text-muted-foreground">
                              {product.branches.map((b) => (
                                <li key={b.branch_id} className="flex justify-between gap-2">
                                  <span className="truncate">{b.branch_name}</span>
                                  <span className="tabular-nums font-medium text-foreground">{b.quantity}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
