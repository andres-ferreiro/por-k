import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useDashboardPeriod } from "@/hooks/use-dashboard-period";
import { useBranchScope } from "@/lib/branch-scope";
import { PeriodPicker } from "@/components/admin/period-picker";
import { DeltaBadge } from "@/components/admin/delta-badge";
import { BranchSwitcher } from "@/components/admin/branch-switcher";
import { PageHeader } from "@/components/admin/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  getDashboardSummary,
  getDailyTotals,
  reportSalesByDriver,
  reportSalesByProduct,
} from "@/lib/api/admin.functions";
import { fmtMoney, fmtQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/lib/api/context.functions";

// ─── local KPI card (no chart, with delta badge) ─────────────────────────────

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

// ─── constants ───────────────────────────────────────────────────────────────

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  credit: "Crédito",
  other: "Otro",
};

const PAYMENT_COLORS: Record<string, string> = {
  cash: "hsl(var(--chart-1))",
  transfer: "hsl(var(--chart-2))",
  credit: "hsl(var(--chart-3))",
  other: "hsl(var(--chart-4))",
};

const salesTrendConfig: ChartConfig = {
  current: { label: "Período actual", color: "hsl(var(--chart-1))" },
  previous: { label: "Período anterior", color: "hsl(var(--chart-2))" },
};

const driverPerfConfig: ChartConfig = {
  sold: { label: "Vendido", color: "hsl(var(--chart-1))" },
};

const topProductsConfig: ChartConfig = {
  amount: { label: "Monto", color: "hsl(var(--chart-2))" },
};

const paymentMethodsConfig: ChartConfig = {
  cash: { label: "Efectivo", color: "hsl(var(--chart-1))" },
  transfer: { label: "Transferencia", color: "hsl(var(--chart-2))" },
  credit: { label: "Crédito", color: "hsl(var(--chart-3))" },
  other: { label: "Otro", color: "hsl(var(--chart-4))" },
};

const moneyFmt = (v: unknown) => [fmtMoney(Number(v)), ""] as [string, string];

// ─── main component ──────────────────────────────────────────────────────────

export function OwnerDashboard({
  roles,
  ownBranchName,
}: {
  roles: AppRole[];
  ownBranchName: string | null;
}) {
  const { branchId } = useBranchScope();
  const {
    period,
    setPeriod,
    currentRange,
    previousRange,
    customRange,
    setCustomRange,
  } = useDashboardPeriod("day");

  // ── server functions ──────────────────────────────────────────────────────
  const summaryFn = useServerFn(getDashboardSummary);
  const dailyFn = useServerFn(getDailyTotals);
  const byDriverFn = useServerFn(reportSalesByDriver);
  const byProductFn = useServerFn(reportSalesByProduct);

  // ── queries (all parallel) ────────────────────────────────────────────────
  const { data: cur } = useQuery({
    queryKey: ["dashboard", "owner", "cur", currentRange, branchId],
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
    queryKey: ["dashboard", "owner", "prev", previousRange, branchId],
    queryFn: () =>
      summaryFn({
        data: {
          date_from: previousRange.from,
          date_to: previousRange.to,
          branch_id: branchId,
        },
      }),
  });

  const { data: dailyCur } = useQuery({
    queryKey: ["dashboard", "daily", "cur", currentRange, branchId],
    queryFn: () =>
      dailyFn({
        data: {
          date_from: currentRange.from,
          date_to: currentRange.to,
          branch_id: branchId,
        },
      }),
  });

  const { data: dailyPrev } = useQuery({
    queryKey: ["dashboard", "daily", "prev", previousRange, branchId],
    queryFn: () =>
      dailyFn({
        data: {
          date_from: previousRange.from,
          date_to: previousRange.to,
          branch_id: branchId,
        },
      }),
  });

  const { data: byDriver } = useQuery({
    queryKey: ["dashboard", "byDriver", currentRange, branchId],
    queryFn: () =>
      byDriverFn({
        data: {
          date_from: currentRange.from,
          date_to: currentRange.to,
          branch_id: branchId,
        },
      }),
  });

  const { data: byProduct } = useQuery({
    queryKey: ["dashboard", "byProduct", currentRange, branchId],
    queryFn: () =>
      byProductFn({
        data: {
          date_from: currentRange.from,
          date_to: currentRange.to,
          branch_id: branchId,
        },
      }),
  });

  // ── derived KPI values ───────────────────────────────────────────────────
  const curPending =
    (cur?.payments.pendingAmount ?? 0) + (cur?.payments.byMethod["credit"] ?? 0);
  const prevPending =
    (prev?.payments.pendingAmount ?? 0) + (prev?.payments.byMethod["credit"] ?? 0);

  // ── chart data ───────────────────────────────────────────────────────────
  const salesTrendData = (dailyCur ?? []).map((d, i) => ({
    label: d.date.slice(5),
    current: d.sold,
    previous: dailyPrev?.[i]?.sold ?? 0,
  }));

  const driverPerfData = (byDriver ?? []).slice(0, 8).map((d) => ({
    name: d.driver_name ?? "—",
    sold: d.sold,
  }));

  const topProductsData = (byProduct ?? []).slice(0, 8).map((p) => ({
    name: p.product_name ?? "—",
    amount: p.amount,
  }));

  const pieData = Object.entries(cur?.payments.byMethod ?? {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({
      key: k,
      name: PAYMENT_LABELS[k] ?? k,
      value: v,
    }));

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Panel de control"
        action={
          <div className="flex items-center gap-3 flex-wrap">
            <BranchSwitcher roles={roles} ownBranchName={ownBranchName} />
            <PeriodPicker
              period={period}
              onPeriodChange={setPeriod}
              customRange={customRange}
              onCustomRangeChange={setCustomRange}
            />
          </div>
        }
      />

      {/* KPI grid — 2 cols mobile, 3 tablet, 6 desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatKpiCard
          label="Ventas"
          value={cur?.deliveries.soldAmount ?? 0}
          prevValue={prev?.deliveries.soldAmount}
          mode="money"
          sub={`${fmtQty(cur?.deliveries.soldUnits ?? 0)} uds.`}
        />
        <StatKpiCard
          label="Cobrado"
          value={cur?.payments.collectedTotal ?? 0}
          prevValue={prev?.payments.collectedTotal}
          mode="money"
        />
        <StatKpiCard
          label="Neto en caja"
          value={cur?.cashNet ?? 0}
          prevValue={prev?.cashNet}
          mode="money"
          highlight={(cur?.cashNet ?? 0) < 0}
        />
        <StatKpiCard
          label="Crédito/Pendiente"
          value={curPending}
          prevValue={prevPending}
          mode="money"
          highlight={curPending > 0}
          inverted
        />
        <StatKpiCard
          label="Despachos"
          value={cur?.dispatches.count ?? 0}
          prevValue={prev?.dispatches.count}
          sub={`${fmtQty(cur?.dispatches.units ?? 0)} uds. cargadas`}
        />
        <StatKpiCard
          label="Entregas"
          value={cur?.deliveries.delivered ?? 0}
          displayValue={`${cur?.deliveries.delivered ?? 0}/${cur?.deliveries.total ?? 0}`}
          prevValue={prev?.deliveries.delivered}
          sub={`${cur?.deliveries.pending ?? 0} pend. · ${cur?.deliveries.failed ?? 0} fall.`}
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sales trend line chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tendencia de ventas</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={salesTrendConfig} className="h-52">
              <LineChart data={salesTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => fmtMoney(v)} tick={{ fontSize: 11 }} width={72} />
                <ChartTooltip formatter={moneyFmt} />
                <Line
                  type="monotone"
                  dataKey="current"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  dot={false}
                  name="Actual"
                />
                <Line
                  type="monotone"
                  dataKey="previous"
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  strokeOpacity={0.35}
                  dot={false}
                  name="Anterior"
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Driver performance horizontal bar */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Rendimiento por repartidor</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={driverPerfConfig} className="h-52">
              <BarChart data={driverPerfData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => fmtMoney(v)} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                <ChartTooltip formatter={moneyFmt} />
                <Bar
                  dataKey="sold"
                  fill="hsl(var(--chart-1))"
                  radius={[0, 3, 3, 0]}
                  name="Vendido"
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top products vertical bar */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Productos más vendidos</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={topProductsConfig} className="h-52">
              <BarChart data={topProductsData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={(v) => fmtMoney(v)} tick={{ fontSize: 11 }} width={72} />
                <ChartTooltip formatter={moneyFmt} />
                <Bar
                  dataKey="amount"
                  fill="hsl(var(--chart-2))"
                  radius={[3, 3, 0, 0]}
                  name="Monto"
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Payment methods donut */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Métodos de pago</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={paymentMethodsConfig} className="h-52">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={80}
                >
                  {pieData.map((d) => (
                    <Cell
                      key={d.key}
                      fill={PAYMENT_COLORS[d.key] ?? "hsl(var(--chart-4))"}
                    />
                  ))}
                </Pie>
                <ChartTooltip formatter={moneyFmt} />
                <Legend iconType="circle" iconSize={10} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Driver status table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Estado por repartidor</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-medium">Repartidor</th>
                  <th className="px-4 py-2.5 text-right font-medium">Vendido</th>
                  <th className="px-4 py-2.5 text-right font-medium">Cobrado</th>
                  <th className="px-4 py-2.5 text-right font-medium">Pendiente</th>
                  <th className="px-4 py-2.5 text-right font-medium">Fallidas</th>
                </tr>
              </thead>
              <tbody>
                {(cur?.drivers ?? []).length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      Sin datos para el período.
                    </td>
                  </tr>
                ) : (
                  (cur?.drivers ?? []).map((d) => (
                    <tr key={d.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-2.5">
                        <Link
                          to="/app/deliveries"
                          search={{ driver_id: d.id } as Record<string, string>}
                          className="font-medium hover:underline"
                        >
                          {d.name ?? "—"}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {fmtMoney(d.sold)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {fmtMoney(d.collected)}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2.5 text-right tabular-nums",
                          d.pending > 0 && "text-amber-600 font-medium",
                        )}
                      >
                        {fmtMoney(d.pending)}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2.5 text-right tabular-nums",
                          d.failed > 0 && "text-rose-600 font-medium",
                        )}
                      >
                        {d.failed}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-4 px-4 py-3 border-t text-sm">
            <Link
              to="/app/deliveries"
              className="text-primary hover:underline"
            >
              Ver entregas →
            </Link>
            <Link
              to="/app/payments"
              className="text-primary hover:underline"
            >
              Ver pagos →
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
