import {
  ArrowLeftRightIcon,
  BanknoteIcon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  CreditCardIcon,
  Loading03Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listTodayDeliveries, listTodayPayments, getMyRouteToday } from "@/lib/api/driver.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { DeliverySheet } from "@/components/driver/delivery-sheet";
import { fmtMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/driver/overview")({
  component: Page,
});

const STATUS_META = {
  delivered: { label: "Entregado", cls: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: CheckmarkCircle02Icon },
  pending: { label: "Pendiente", cls: "bg-amber-100 text-amber-800 border-amber-200", icon: Clock01Icon },
  failed: { label: "Fallido", cls: "bg-rose-100 text-rose-800 border-rose-200", icon: CancelCircleIcon },
};

const METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transfer.",
  credit: "Crédito",
  other: "Otro",
};

const METHOD_ICON: Record<string, typeof BanknoteIcon> = {
  cash: BanknoteIcon,
  transfer: ArrowLeftRightIcon,
  credit: CreditCardIcon,
  other: MoreHorizontalIcon,
};

function Page() {
  const fetchDeliveries = useServerFn(listTodayDeliveries);
  const fetchPayments = useServerFn(listTodayPayments);
  const fetchRoute = useServerFn(getMyRouteToday);

  const { data: deliveries, isLoading: loadingDel } = useQuery({
    queryKey: ["driver", "deliveriesToday"],
    queryFn: () => fetchDeliveries({ data: {} }),
  });
  const { data: payments, isLoading: loadingPay } = useQuery({
    queryKey: ["driver", "paymentsToday"],
    queryFn: () => fetchPayments({ data: {} }),
  });
  const { data: route } = useQuery({
    queryKey: ["driver", "myRouteToday"],
    queryFn: () => fetchRoute(),
  });

  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);

  const isLoading = loadingDel || loadingPay;

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Icon icon={Loading03Icon} className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const rows = deliveries ?? [];
  const pays = payments ?? [];
  const totalRoute = route?.customers.length ?? 0;

  const delivered = rows.filter((r) => r.status === "delivered");
  const failed = rows.filter((r) => r.status === "failed");
  const totalSold = delivered.reduce((s, r) => s + r.total, 0);
  const totalPaid = pays.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);

  const byMethod: Record<string, number> = {};
  for (const p of pays) {
    if (p.status === "paid") byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;
  }

  const canEdit = (customerId: string) => !!route?.customers.find((c) => c.id === customerId);

  return (
    <div className="space-y-4 pb-4">
      <h1>Resumen de hoy</h1>

      {/* Primary stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="col-span-2">
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground mb-0.5">Total vendido</div>
            <div className="text-3xl font-bold tabular-nums text-primary">{fmtMoney(totalSold)}</div>
            {totalPaid !== totalSold && (
              <div className="text-xs text-muted-foreground mt-0.5">
                Cobrado: <span className="font-medium text-foreground">{fmtMoney(totalPaid)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground mb-0.5">Entregas</div>
            <div className="text-2xl font-bold tabular-nums">
              {delivered.length}
              <span className="text-sm font-normal text-muted-foreground"> / {totalRoute}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground mb-0.5">Fallidos</div>
            <div className={`text-2xl font-bold tabular-nums ${failed.length > 0 ? "text-rose-600" : ""}`}>
              {failed.length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payments by method */}
      {pays.length > 0 && (
        <Card>
          <CardContent className="py-4 space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cobros por método</div>
            <div className="space-y-1.5">
              {Object.entries(byMethod).map(([method, amount]) => {
                const pct = totalPaid > 0 ? (amount / totalPaid) * 100 : 0;
                return (
                  <div key={method} className="space-y-0.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Icon icon={METHOD_ICON[method] ?? BanknoteIcon} className="h-4 w-4" />
                        {METHOD_LABEL[method] ?? method}
                      </span>
                      <span className="font-semibold tabular-nums">{fmtMoney(amount)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity list */}
      <div className="space-y-1">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">Actividad</div>
        {rows.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Aún no registras entregas hoy.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const meta = STATUS_META[r.status] ?? STATUS_META.pending;
              const pay = pays.find((p) => p.customer_id === r.customer_id);
              const editable = canEdit(r.customer_id);
              return (
                <Card
                  key={r.id}
                  className={editable ? "cursor-pointer hover:bg-accent/40 transition-colors" : ""}
                  onClick={() => editable && setSelected({ id: r.customer_id, name: r.customer_name ?? "" })}
                >
                  <CardContent className="py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{r.customer_name}</span>
                        <Badge variant="outline" className={`${meta.cls} shrink-0`}>
                          <Icon icon={meta.icon} className="h-3 w-3 mr-1" />
                          {meta.label}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                        {r.units > 0 && (
                          <span className="tabular-nums">
                            {r.units} u · {fmtMoney(r.total)}
                          </span>
                        )}
                        {pay && (
                          <span className="flex items-center gap-1">
                            <Icon icon={METHOD_ICON[pay.method] ?? BanknoteIcon} className="h-3 w-3" />
                            {METHOD_LABEL[pay.method] ?? pay.method}
                            {pay.status === "pending" && (
                              <span className="ml-1 text-amber-600 font-medium">· Pendiente</span>
                            )}
                          </span>
                        )}
                        {r.comment && (
                          <span className="line-clamp-1 italic text-muted-foreground/70">{r.comment}</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <DeliverySheet
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        customer={selected}
      />
    </div>
  );
}
