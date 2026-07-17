import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useDashboardPeriod } from "@/hooks/use-dashboard-period";
import { useBranchScope } from "@/lib/branch-scope";
import { PeriodPicker } from "@/components/admin/period-picker";
import { StatCardArea, StatCardSimple } from "@/components/admin/stat-cards";
import { DashboardDriverSegments } from "@/components/admin/dashboard-driver-segments";
import { DashboardRouteFilter } from "@/components/admin/dashboard-route-filter";
import { PageHeader } from "@/components/admin/data-table";
import { useDashboardChannel } from "@/hooks/use-dashboard-channel";
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

// ─── main component ──────────────────────────────────────────────────────────

export function SupervisorDashboard() {
  const { branchId } = useBranchScope();
  const { channel, setChannel, routeMode } = useDashboardChannel();
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
    queryKey: ["dashboard", "sup", "cur", currentRange, branchId, channel],
    queryFn: () =>
      summaryFn({
        data: {
          date_from: currentRange.from,
          date_to: currentRange.to,
          branch_id: branchId,
          route_mode: routeMode,
        },
      }),
  });

  const { data: prev } = useQuery({
    queryKey: ["dashboard", "sup", "prev", previousRange, branchId, channel],
    queryFn: () =>
      summaryFn({
        data: {
          date_from: previousRange.from,
          date_to: previousRange.to,
          branch_id: branchId,
          route_mode: routeMode,
        },
      }),
  });

  const { data: trend } = useQuery({
    queryKey: ["dashboard", "trend", currentRange, branchId, channel],
    queryFn: () =>
      trendFn({
        data: {
          date_from: currentRange.from,
          date_to: currentRange.to,
          branch_id: branchId,
          route_mode: routeMode,
        },
      }),
  });

  const { data: byDriverDispatch } = useQuery({
    queryKey: ["dashboard", "byDriver", "dispatch", currentRange, branchId],
    queryFn: () =>
      byDriverFn({
        data: {
          date_from: currentRange.from,
          date_to: currentRange.to,
          branch_id: branchId,
          route_mode: "dispatch",
        },
      }),
    enabled: channel === "all" || channel === "dispatch",
  });

  const { data: byDriverPreorder } = useQuery({
    queryKey: ["dashboard", "byDriver", "preorder", currentRange, branchId],
    queryFn: () =>
      byDriverFn({
        data: {
          date_from: currentRange.from,
          date_to: currentRange.to,
          branch_id: branchId,
          route_mode: "preorder",
        },
      }),
    enabled: channel === "all" || channel === "preorder",
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

  // ── KPI shortcuts ─────────────────────────────────────────────────────────
  const delivered = cur?.deliveries.delivered ?? 0;
  const total = cur?.deliveries.total ?? 0;
  const failed = cur?.deliveries.failed ?? 0;
  const pending = cur?.deliveries.pending ?? 0;
  const soldAmount = cur?.deliveries.soldAmount ?? 0;
  const collectedTotal = cur?.payments.collectedTotal ?? 0;
  const showDispatch = channel === "all" || channel === "dispatch";
  const showPreorder = channel === "all" || channel === "preorder";

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

      <DashboardRouteFilter value={channel} onChange={setChannel} />

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

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4">
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
      </div>

      <DashboardDriverSegments
        dispatchByDriver={byDriverDispatch ?? []}
        preorderByDriver={byDriverPreorder ?? []}
        tableVariant="supervisor"
        showDispatch={showDispatch}
        showPreorder={showPreorder}
      />
    </div>
  );
}
