import { Building03Icon, Loading03Icon, Restaurant01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/admin/status-badge";
import { Card, CardContent } from "@/components/ui/card";

export type DriverLoadOrder = {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_category: string;
  status: string;
  items: Array<{
    product_id: string;
    product_name: string;
    unit: string;
    quantity: number;
  }>;
};

type RouteCustomer = {
  id: string;
  name: string;
  category: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  hotel: "Hotel",
  restaurant: "Restaurante",
};

function categoryIcon(category: string) {
  return category === "restaurant" ? Restaurant01Icon : Building03Icon;
}

function sortOrdersByRoute(orders: DriverLoadOrder[], routeCustomers: RouteCustomer[]): DriverLoadOrder[] {
  const byCustomer = new Map(orders.map((o) => [o.customer_id, o]));
  const sorted: DriverLoadOrder[] = [];
  const seen = new Set<string>();

  for (const customer of routeCustomers) {
    const order = byCustomer.get(customer.id);
    if (!order || order.items.every((i) => i.quantity <= 0)) continue;
    sorted.push(order);
    seen.add(order.customer_id);
  }

  for (const order of orders) {
    if (seen.has(order.customer_id) || order.items.every((i) => i.quantity <= 0)) continue;
    sorted.push(order);
  }

  return sorted;
}

function formatDateLabel(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Ciudad_Juarez",
  });
}

export function DriverLoadDialog({
  open,
  onOpenChange,
  orders,
  routeCustomers,
  deliveryDate,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: DriverLoadOrder[];
  routeCustomers: RouteCustomer[];
  deliveryDate: string;
  loading?: boolean;
}) {
  const loadOrders = useMemo(
    () => sortOrdersByRoute(orders.filter((o) => o.status !== "cancelled" && o.status !== "failed"), routeCustomers),
    [orders, routeCustomers],
  );

  const totalUnits = useMemo(
    () => loadOrders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0),
    [loadOrders],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg h-[min(90dvh,720px)] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 pt-5 pb-3 shrink-0 border-b">
          <DialogTitle>Carga por hotel</DialogTitle>
          <p className="text-sm text-muted-foreground capitalize">{formatDateLabel(deliveryDate)}</p>
          {!loading && loadOrders.length > 0 && (
            <p className="text-xs text-muted-foreground tabular-nums">
              {loadOrders.length} {loadOrders.length === 1 ? "cliente" : "clientes"} · {totalUnits} unidades
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Icon icon={Loading03Icon} className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && loadOrders.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12 px-2">
              No hay pedidos para cargar en esta fecha.
            </p>
          )}

          {!loading &&
            loadOrders.map((order) => {
              const units = order.items.reduce((s, i) => s + i.quantity, 0);
              const category = order.customer_category;
              return (
                <Card key={order.id}>
                  <CardContent className="py-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold leading-tight">{order.customer_name}</div>
                        <StatusBadge tone="neutral" className="text-[10px] mt-1 normal-case tracking-normal">
                          <Icon icon={categoryIcon(category)} className="h-3 w-3 mr-1" />
                          {CATEGORY_LABELS[category] ?? category}
                        </StatusBadge>
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0 pt-0.5">
                        {units} u
                      </span>
                    </div>

                    <ul className="space-y-1.5">
                      {order.items
                        .filter((i) => i.quantity > 0)
                        .sort((a, b) => a.product_name.localeCompare(b.product_name, "es"))
                        .map((item) => (
                          <li
                            key={item.product_id}
                            className="flex items-baseline justify-between gap-3 text-sm border-b border-dashed last:border-0 pb-1.5 last:pb-0"
                          >
                            <span className="min-w-0 truncate">{item.product_name}</span>
                            <span className="tabular-nums font-medium shrink-0">
                              {item.quantity}
                              {item.unit ? (
                                <span className="text-muted-foreground font-normal ml-1">{item.unit}</span>
                              ) : null}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
