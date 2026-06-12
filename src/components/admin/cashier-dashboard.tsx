import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useDashboardPeriod } from "@/hooks/use-dashboard-period";
import { useBranchScope } from "@/lib/branch-scope";
import { PeriodPicker } from "@/components/admin/period-picker";
import { DeltaBadge } from "@/components/admin/delta-badge";
import { PageHeader } from "@/components/admin/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardSummary, listPaymentsAdmin } from "@/lib/api/admin.functions";
import { fmtMoney, fmtQty } from "@/lib/format";
import { cn } from "@/lib/utils";

// ─── local KPI card ───────────────────────────────────────────────────────────

function StatKpiCard({
  label,
  value,
  prevValue,
  mode = "qty",
  sub,
  highlight,
  inverted,
  displayValue,
}: {
  label: string;
  value: number;
  prevValue?: number;
  mode?: "qty" | "money";
  sub?: string;
  highlight?: boolean;
  inverted?: boolean;
  displayValue?: string;
}) {
  return (
    <div className={cn("stat-card stat-card-simple", highlight && "stat-card-highlight")}>
      <div className="stat-card-label">{label}</div>
      <span className="stat-card-value">
        {displayValue ?? (mode === "money" ? fmtMoney(value) : fmtQty(value))}
      </span>
      {sub && <div className="stat-card-sub">{sub}</div>}
      {prevValue !== undefined && (
        <DeltaBadge current={value} previous={prevValue} inverted={inverted} />
      )}
    </div>
  );
}

// ─── constants ────────────────────────────────────────────────────────────────

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  credit: "Crédito",
  other: "Otro",
};

const METHOD_ORDER = ["cash", "transfer", "credit", "other"];

// ─── main component ───────────────────────────────────────────────────────────

export function CashierDashboard() {
  const { branchId } = useBranchScope();
  const { period, setPeriod, currentRange, previousRange, customRange, setCustomRange } =
    useDashboardPeriod("day");

  // ── server functions ────────────────────────────────────────────────────
  const summaryFn = useServerFn(getDashboardSummary);
  const paymentsFn = useServerFn(listPaymentsAdmin);

  // ── queries ─────────────────────────────────────────────────────────────
  const { data: cur } = useQuery({
    queryKey: ["dashboard", "cashier", "cur", currentRange, branchId],
    queryFn: () =>
      summaryFn({
        data: {
          date_from: currentRange.from,
          date_to: currentRange.to,
          branch_id: branchId,
        },
      }),
  });

  const { data: prev } = useQuery({
    queryKey: ["dashboard", "cashier", "prev", previousRange, branchId],
    queryFn: () =>
      summaryFn({
        data: {
          date_from: previousRange.from,
          date_to: previousRange.to,
          branch_id: branchId,
        },
      }),
  });

  const { data: pendingPays } = useQuery({
    queryKey: ["dashboard", "cashier", "pending-pays", currentRange, branchId],
    queryFn: () =>
      paymentsFn({
        data: {
          date_from: currentRange.from,
          date_to: currentRange.to,
          status: "pending",
          branch_id: branchId,
        },
      }),
  });

  // ── derived values ───────────────────────────────────────────────────────
  const curPending =
    (cur?.payments.pendingAmount ?? 0) + (cur?.payments.byMethod["credit"] ?? 0);
  const prevPending =
    (prev?.payments.pendingAmount ?? 0) + (prev?.payments.byMethod["credit"] ?? 0);

  const byMethod = cur?.payments.byMethod ?? {};
  const collectedTotal = cur?.payments.collectedTotal ?? 0;
  const methodEntries = METHOD_ORDER.filter((k) => (byMethod[k] ?? 0) > 0).map((k) => ({
    key: k,
    label: PAYMENT_LABELS[k] ?? k,
    amount: byMethod[k] ?? 0,
    pct: collectedTotal > 0 ? ((byMethod[k] ?? 0) / collectedTotal) * 100 : 0,
  }));

  const pendingRows = (pendingPays ?? []).slice(0, 10);

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Inicio"
        action={
          <PeriodPicker
            period={period}
            onPeriodChange={setPeriod}
            customRange={customRange}
            onCustomRangeChange={setCustomRange}
          />
        }
      />

      {/* KPI grid — 2 cols mobile / 2 tablet / 4 desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatKpiCard
          label="Despachos"
          value={cur?.dispatches.count ?? 0}
          prevValue={prev?.dispatches.count}
          sub={`${fmtQty(cur?.dispatches.units ?? 0)} u cargadas`}
        />
        <StatKpiCard
          label="Cobrado"
          value={cur?.payments.collectedTotal ?? 0}
          prevValue={prev?.payments.collectedTotal}
          mode="money"
        />
        <StatKpiCard
          label="Pendiente / Crédito"
          value={curPending}
          prevValue={prevPending}
          mode="money"
          highlight={curPending > 0}
          inverted
        />
        <StatKpiCard
          label="Gastos"
          value={cur?.expenses.total ?? 0}
          prevValue={prev?.expenses.total}
          mode="money"
          sub={`${fmtQty(cur?.expenses.count ?? 0)} registros`}
        />
      </div>

      {/* Payment method breakdown */}
      {methodEntries.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Cobros por método</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {methodEntries.map((m) => (
              <div key={m.key} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{m.label}</span>
                  <span className="font-semibold tabular-nums">
                    {fmtMoney(m.amount)}
                    <span className="text-muted-foreground font-normal ml-1.5">
                      {m.pct.toFixed(0)}%
                    </span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${m.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Two tables — stacked mobile, side-by-side desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pending payments */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Cobros pendientes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-muted-foreground">
                    <th className="px-4 py-2.5 text-left font-medium">Cliente</th>
                    <th className="px-4 py-2.5 text-right font-medium">Monto</th>
                    <th className="px-4 py-2.5 text-left font-medium">Ruta</th>
                    <th className="px-4 py-2.5 text-left font-medium">Método</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-8 text-center text-muted-foreground"
                      >
                        Sin cobros pendientes.
                      </td>
                    </tr>
                  ) : (
                    pendingRows.map((p) => (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-2.5 truncate max-w-[120px]">
                          {p.customer_name ?? "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium text-amber-600">
                          {fmtMoney(p.amount)}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[100px]">
                          {p.route_name ?? "—"}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {PAYMENT_LABELS[p.method] ?? p.method}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t text-sm">
              <Link to="/app/payments" className="text-primary hover:underline">
                Ver todos →
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Despachos del período */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Despachos del período</CardTitle>
            <Link to="/app/dispatch" className="text-xs text-primary hover:underline">Ver todos →</Link>
          </CardHeader>
          <CardContent>
            {(cur?.dispatches.count ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Sin despachos en el período.</p>
            ) : (
              <div className="space-y-1 text-sm">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Total despachos</span>
                  <span className="font-semibold tabular-nums">{cur?.dispatches.count ?? 0}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">Unidades cargadas</span>
                  <span className="font-semibold tabular-nums">{fmtQty(cur?.dispatches.units ?? 0)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
