import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useDashboardPeriod } from "@/hooks/use-dashboard-period";
import { useBranchScope } from "@/lib/branch-scope";
import { PeriodPicker } from "@/components/admin/period-picker";
import { StatCardArea, StatCardSimple } from "@/components/admin/stat-cards";
import { PageHeader } from "@/components/admin/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  getDashboardSummary,
  getDashboardTrend,
  reportSalesByDriver,
} from "@/lib/api/admin.functions";
import { trendLabels, trendSeries } from "@/lib/dashboard-trend";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

// ─── chart constants ──────────────────────────────────────────────────────────

const C1 = "#00636f";
const C2 = "#3b82f6";
const C3 = "#f59e0b";
const C4 = "#6b7280";

const deliveryOutcomesConfig: ChartConfig = {
  Entregado: { label: "Entregado", color: C1 },
  Fallido: { label: "Fallido", color: C3 },
  Pendiente: { label: "Pendiente", color: C4 },
};

const driverComparisonConfig: ChartConfig = {
  Vendido: { label: "Vendido", color: C1 },
  Cobrado: { label: "Cobrado", color: C2 },
};

const moneyFmt = (v: unknown) => [fmtMoney(Number(v)), ""] as [string, string];

// ─── main component ──────────────────────────────────────────────────────────

export function SupervisorDashboard() {
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
  const trendFn = useServerFn(getDashboardTrend);
  const byDriverFn = useServerFn(reportSalesByDriver);

  // ── queries (all parallel) ────────────────────────────────────────────────
  const { data: cur } = useQuery({
    queryKey: ["dashboard", "sup", "cur", currentRange, branchId],
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
    queryKey: ["dashboard", "sup", "prev", previousRange, branchId],
    queryFn: () =>
      summaryFn({
        data: {
          date_from: previousRange.from,
          date_to: previousRange.to,
          branch_id: branchId,
        },
      }),
  });

  const { data: trend } = useQuery({
    queryKey: ["dashboard", "trend", currentRange, branchId],
    queryFn: () =>
      trendFn({
        data: {
          date_from: currentRange.from,
          date_to: currentRange.to,
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

  // ── chart data ───────────────────────────────────────────────────────────
  const trendBuckets = trend?.buckets ?? [];
  const seriesLabels = trendLabels(trendBuckets);

  const outcomeData = trendBuckets.map((d) => ({
    label: d.label,
    Entregado: d.delivered,
    Fallido: d.failed,
    Pendiente: d.pending,
  }));

  const driverCompData = (byDriver ?? []).slice(0, 10).map((d) => ({
    name: d.driver_name ?? "—",
    Vendido: d.sold,
    Cobrado: d.collected,
  }));

  // ── KPI shortcuts ─────────────────────────────────────────────────────────
  const delivered = cur?.deliveries.delivered ?? 0;
  const total = cur?.deliveries.total ?? 0;
  const failed = cur?.deliveries.failed ?? 0;
  const pending = cur?.deliveries.pending ?? 0;
  const soldAmount = cur?.deliveries.soldAmount ?? 0;
  const collectedTotal = cur?.payments.collectedTotal ?? 0;

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header — no BranchSwitcher for supervisor */}
      <PageHeader
        title="Panel de control"
        action={
          <PeriodPicker
            period={period}
            onPeriodChange={setPeriod}
            customRange={customRange}
            onCustomRangeChange={setCustomRange}
          />
        }
      />

      {/* KPI grid — sparklines for money, simple for counts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        <StatCardArea
          label="Ventas"
          value={soldAmount}
          mode="money"
          series={trendSeries(trendBuckets, "sold")}
          seriesLabels={seriesLabels}
        />
        <StatCardArea
          label="Cobrado"
          value={collectedTotal}
          mode="money"
          series={trendSeries(trendBuckets, "collected")}
          seriesLabels={seriesLabels}
        />
        <StatCardSimple
          label="Entregas"
          value={delivered}
          displayValue={`${delivered}/${total}`}
          delta={prev ? { current: delivered, previous: prev.deliveries.delivered } : undefined}
          series={trendSeries(trendBuckets, "delivered")}
          seriesLabels={seriesLabels}
        />
        <StatCardSimple
          label="Fallidas"
          value={failed}
          highlight={failed > 0}
          delta={prev ? { current: failed, previous: prev.deliveries.failed, inverted: true } : undefined}
          series={trendSeries(trendBuckets, "failed")}
          seriesLabels={seriesLabels}
          chartType="bar"
        />
      </div>

      {/* Charts row — 2 cols desktop, stacked mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Delivery outcomes stacked bar */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Resultados de entregas</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={deliveryOutcomesConfig} className="h-52">
              <BarChart data={outcomeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <ChartTooltip />
                <Legend iconType="circle" iconSize={10} />
                <Bar dataKey="Entregado" stackId="a" fill={C1} />
                <Bar dataKey="Fallido" stackId="a" fill={C3} />
                <Bar dataKey="Pendiente" stackId="a" fill={C4} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Driver comparison grouped horizontal bar */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Comparación por repartidor</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={driverComparisonConfig} className="h-52">
              <BarChart data={driverCompData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v) => fmtMoney(v)}
                  tick={{ fontSize: 10 }}
                />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                <ChartTooltip formatter={moneyFmt} />
                <Legend iconType="circle" iconSize={10} />
                <Bar dataKey="Vendido" fill={C1} radius={[0, 3, 3, 0]} name="Vendido" />
                <Bar dataKey="Cobrado" fill={C2} radius={[0, 3, 3, 0]} name="Cobrado" />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Driver detail table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Detalle por repartidor</CardTitle>
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
                  <th className="px-4 py-2.5 text-right font-medium">Gastos</th>
                </tr>
              </thead>
              <tbody>
                {(byDriver ?? []).length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      Sin datos para el período.
                    </td>
                  </tr>
                ) : (
                  (byDriver ?? []).map((d) => (
                    <tr key={d.driver_id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-2.5">
                        <Link
                          to="/app/deliveries"
                          search={{ driver_id: d.driver_id } as Record<string, string>}
                          className="font-medium hover:underline"
                        >
                          {d.driver_name ?? "—"}
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
                          d.expenses > 0 && "text-rose-600 font-medium",
                        )}
                      >
                        {fmtMoney(d.expenses)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
