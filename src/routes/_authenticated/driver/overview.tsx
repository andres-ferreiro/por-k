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
import { listTodayDeliveries, listTodayPayments, listTodayExpenses, getMyRouteToday } from "@/lib/api/driver.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { DeliverySheet } from "@/components/driver/delivery-sheet";
import { fmtMoney } from "@/lib/format";
import { useDashboardPeriod, type Period } from "@/hooks/use-dashboard-period";
import { cn } from "@/lib/utils";

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

function DriverPeriodPicker({ period, onPeriodChange }: { period: Period; onPeriodChange: (p: Period) => void }) {
  return (
    <div className="flex rounded-lg border bg-muted p-0.5 gap-0.5 w-fit">
      {(["day", "week"] as Period[]).map((p) => (
        <button
          key={p}
          onClick={() => onPeriodChange(p)}
          type="button"
          className={cn(
            "rounded-md px-3 py-1 text-sm font-medium transition-colors",
            period === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {p === "day" ? "Día" : "Semana"}
        </button>
      ))}
    </div>
  );
}

function ProgressRing({ value, max, size = 80 }: { value: number; max: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const dash = circ * pct;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} className="stroke-muted" strokeWidth={6} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="hsl(var(--primary))"
          strokeWidth={6}
          fill="none"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <span className="absolute text-sm font-bold tabular-nums">
        {max > 0 ? `${Math.round(pct * 100)}%` : "—"}
      </span>
    </div>
  );
}

function Page() {
  const fetchDeliveries = useServerFn(listTodayDeliveries);
  const fetchPayments = useServerFn(listTodayPayments);
  const fetchExpenses = useServerFn(listTodayExpenses);
  const fetchRoute = useServerFn(getMyRouteToday);

  const { period, setPeriod, currentRange } = useDashboardPeriod("day");

  const { data: deliveries, isLoading: loadingDel } = useQuery({
    queryKey: ["driver", "deliveries", currentRange],
    queryFn: () => fetchDeliveries({ data: { date_from: currentRange.from, date_to: currentRange.to } }),
  });
  const { data: payments, isLoading: loadingPay } = useQuery({
    queryKey: ["driver", "payments", currentRange],
    queryFn: () => fetchPayments({ data: { date_from: currentRange.from, date_to: currentRange.to } }),
  });
  const { data: expenses, isLoading: loadingExp } = useQuery({
    queryKey: ["driver", "expenses", currentRange],
    queryFn: () => fetchExpenses({ data: { date_from: currentRange.from, date_to: currentRange.to } }),
  });
  const { data: route } = useQuery({
    queryKey: ["driver", "myRouteToday"],
    queryFn: () => fetchRoute(),
  });

  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);

  const isLoading = loadingDel || loadingPay || loadingExp;

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Icon icon={Loading03Icon} className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const rows = deliveries ?? [];
  const pays = payments ?? [];
  const exps = expenses ?? [];
  const totalRoute = route?.customers.length ?? 0;

  const delivered = rows.filter((r) => r.status === "delivered");
  const failed = rows.filter((r) => r.status === "failed");
  const totalSold = delivered.reduce((s, r) => s + r.total, 0);
  const totalReturned = delivered.reduce((s, r) => s + (r.return_amount ?? 0), 0);
  const totalExpenses = exps.reduce((s, e) => s + e.amount, 0);
  const saldoALiquidar = totalSold - totalReturned - totalExpenses;

  const totalPaid = pays.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);

  const byMethod: Record<string, number> = {};
  for (const p of pays) {
    if (p.status === "paid") byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;
  }

  const canEdit = (customerId: string) => !!route?.customers.find((c) => c.id === customerId);

  const title = period === "day" ? "Resumen de hoy" : "Resumen de la semana";

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">{title}</h1>
        <DriverPeriodPicker period={period} onPeriodChange={setPeriod} />
      </div>

      {/* Financial grid (2×2) */}
      <div className="grid grid-cols-2 gap-3">
        <Card className={totalSold > 0 ? "border-emerald-200 bg-emerald-50/40" : ""}>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground mb-0.5">Vendido</div>
            <div className={cn("text-2xl font-bold tabular-nums", totalSold > 0 ? "text-primary" : "")}>
              {fmtMoney(totalSold)}
            </div>
          </CardContent>
        </Card>

        <Card className={totalReturned > 0 ? "border-amber-200 bg-amber-50/40" : ""}>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground mb-0.5">Devuelto</div>
            <div className={cn("text-2xl font-bold tabular-nums", totalReturned > 0 ? "text-amber-600" : "")}>
              {fmtMoney(totalReturned)}
            </div>
          </CardContent>
        </Card>

        <Card className={totalExpenses > 0 ? "border-rose-200 bg-rose-50/40" : ""}>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground mb-0.5">Gastos</div>
            <div className={cn("text-2xl font-bold tabular-nums", totalExpenses > 0 ? "text-rose-600" : "")}>
              {fmtMoney(totalExpenses)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground mb-0.5">Saldo a liquidar</div>
            <div className="text-2xl font-bold tabular-nums text-primary">{fmtMoney(saldoALiquidar)}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">vendido − devuelto − gastos</div>
          </CardContent>
        </Card>
      </div>

      {/* Progress ring */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <ProgressRing value={delivered.length} max={totalRoute} size={80} />
            <div className="space-y-1">
              <div className="text-sm font-medium">Progreso de ruta</div>
              <div className="text-2xl font-bold tabular-nums">
                {delivered.length}
                <span className="text-sm font-normal text-muted-foreground"> / {totalRoute}</span>
              </div>
              {failed.length > 0 && (
                <div className="text-xs text-rose-600 font-medium">{failed.length} fallido{failed.length !== 1 ? "s" : ""}</div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

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
              {period === "day" ? "Aún no registras entregas hoy." : "No hay entregas en esta semana."}
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
