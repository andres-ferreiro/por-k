import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useDashboardPeriod } from "@/hooks/use-dashboard-period";
import { useBranchScope } from "@/lib/branch-scope";
import { PeriodPicker } from "@/components/admin/period-picker";
import { PageHeader } from "@/components/admin/data-table";
import { StatCardArea, StatCardBar, StatCardSimple } from "@/components/admin/stat-cards";
import {
  DashboardChartPanel,
  truncateLabel,
} from "@/components/admin/dashboard-chart-panel";
import { DashboardDriverSegments } from "@/components/admin/dashboard-driver-segments";
import { DashboardRouteFilter } from "@/components/admin/dashboard-route-filter";
import { useDashboardChannel } from "@/hooks/use-dashboard-channel";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
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
  Label,
} from "recharts";
import {
  getDashboardSummary,
  getDashboardTrend,
  reportSalesByDriver,
  reportSalesByProduct,
} from "@/lib/api/admin.functions";
import { trendLabels, trendSeries } from "@/lib/dashboard-trend";
import { fmtMoney, fmtQty } from "@/lib/format";

// ─── constants ───────────────────────────────────────────────────────────────

const C1 = "#00636f";
const C2 = "#3b82f6";
const C3 = "#f59e0b";
const C4 = "#6b7280";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  credit: "Crédito",
  other: "Otro",
};

const PAYMENT_COLORS: Record<string, string> = {
  cash: C1,
  transfer: C2,
  credit: C3,
  other: C4,
};

const salesTrendConfig: ChartConfig = {
  current: { label: "Período actual", color: C1 },
  previous: { label: "Período anterior", color: C4 },
};

const topProductsConfig: ChartConfig = {
  amount: { label: "Monto", color: C2 },
  units: { label: "Unidades", color: C4 },
};

const paymentMethodsConfig: ChartConfig = {
  cash: { label: "Efectivo", color: C1 },
  transfer: { label: "Transferencia", color: C2 },
  credit: { label: "Crédito", color: C3 },
  other: { label: "Otro", color: C4 },
};

const CHART_AXIS = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const CHART_GRID = { strokeDasharray: "3 3", stroke: "hsl(var(--border))", strokeOpacity: 0.6 };

function pctOf(total: number, part: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function paymentMethodSub(byMethod: Record<string, number> | undefined): string {
  if (!byMethod) return "—";
  const cash = byMethod.cash ?? 0;
  const transfer = byMethod.transfer ?? 0;
  const credit = byMethod.credit ?? 0;
  const parts: string[] = [];
  if (cash > 0) parts.push(`Ef. ${pctOf(cash + transfer + credit + (byMethod.other ?? 0), cash)}`);
  if (transfer > 0) parts.push(`Trans. ${pctOf(cash + transfer + credit + (byMethod.other ?? 0), transfer)}`);
  return parts.length ? parts.join(" · ") : "Sin cobros";
}

// ─── main component ──────────────────────────────────────────────────────────

export function OwnerDashboard() {
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

  const summaryFn = useServerFn(getDashboardSummary);
  const trendFn = useServerFn(getDashboardTrend);
  const byDriverFn = useServerFn(reportSalesByDriver);
  const byProductFn = useServerFn(reportSalesByProduct);

  const { data: cur } = useQuery({
    queryKey: ["dashboard", "owner", "cur", currentRange, branchId, channel],
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
    queryKey: ["dashboard", "owner", "prev", previousRange, branchId, channel],
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

  const { data: trendPrev } = useQuery({
    queryKey: ["dashboard", "trend", "prev", previousRange, branchId, channel],
    queryFn: () =>
      trendFn({
        data: {
          date_from: previousRange.from,
          date_to: previousRange.to,
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

  const { data: summaryDispatch } = useQuery({
    queryKey: ["dashboard", "owner", "dispatch", currentRange, branchId],
    queryFn: () =>
      summaryFn({
        data: {
          date_from: currentRange.from,
          date_to: currentRange.to,
          branch_id: branchId,
          route_mode: "dispatch",
        },
      }),
    enabled: channel === "all",
  });

  const { data: summaryPreorder } = useQuery({
    queryKey: ["dashboard", "owner", "preorder", currentRange, branchId],
    queryFn: () =>
      summaryFn({
        data: {
          date_from: currentRange.from,
          date_to: currentRange.to,
          branch_id: branchId,
          route_mode: "preorder",
        },
      }),
    enabled: channel === "all",
  });

  const { data: byProduct } = useQuery({
    queryKey: ["dashboard", "byProduct", currentRange, branchId, channel],
    queryFn: () =>
      byProductFn({
        data: {
          date_from: currentRange.from,
          date_to: currentRange.to,
          branch_id: branchId,
          route_mode: routeMode,
        },
      }),
  });

  const curPending =
    (cur?.payments.pendingAmount ?? 0) + (cur?.payments.byMethod["credit"] ?? 0);
  const prevPending =
    (prev?.payments.pendingAmount ?? 0) + (prev?.payments.byMethod["credit"] ?? 0);

  const trendBuckets = trend?.buckets ?? [];
  const trendPrevBuckets = trendPrev?.buckets ?? [];
  const seriesLabels = trendLabels(trendBuckets);

  const salesTrendData = trendBuckets.map((d, i) => ({
    label: d.label,
    current: d.sold,
    previous: trendPrevBuckets[i]?.sold ?? 0,
  }));
  const salesTrendTotal = salesTrendData.reduce((a, d) => a + d.current, 0);
  const hasSalesTrend = salesTrendData.some((d) => d.current > 0 || d.previous > 0);

  const topProductsData = (byProduct ?? [])
    .filter((p) => p.amount > 0)
    .slice(0, 8)
    .map((p) => ({
      name: truncateLabel(p.product_name ?? "—", 10),
      fullName: p.product_name ?? "—",
      amount: p.amount,
      units: p.units_sold - p.units_returned,
      unit: p.unit,
    }));

  const collectedTotal = cur?.payments.collectedTotal ?? 0;
  const pieData = Object.entries(cur?.payments.byMethod ?? {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({
      key: k,
      name: PAYMENT_LABELS[k] ?? k,
      value: v,
      pct: pctOf(collectedTotal, v),
    }));

  const delivered = cur?.deliveries.delivered ?? 0;
  const totalDeliveries = cur?.deliveries.total ?? 0;
  const pendingDel = cur?.deliveries.pending ?? 0;
  const failedDel = cur?.deliveries.failed ?? 0;

  const showDispatch = channel === "all" || channel === "dispatch";
  const showPreorder = channel === "all" || channel === "preorder";
  const dispatchDrivers =
    channel === "all" ? (summaryDispatch?.drivers ?? []) : channel === "dispatch" ? (cur?.drivers ?? []) : [];
  const preorderDrivers =
    channel === "all" ? (summaryPreorder?.drivers ?? []) : channel === "preorder" ? (cur?.drivers ?? []) : [];

  return (
    <div className="space-y-6">
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

      {/* KPI row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        <StatCardArea
          label="Ventas"
          value={cur?.deliveries.soldAmount ?? 0}
          mode="money"
          sub={cur ? `${fmtQty(cur.deliveries.soldUnits)} u vendidas` : undefined}
          delta={
            prev
              ? { current: cur?.deliveries.soldAmount ?? 0, previous: prev.deliveries.soldAmount }
              : undefined
          }
          series={trendSeries(trendBuckets, "sold")}
          seriesLabels={seriesLabels}
        />
        <StatCardArea
          label="Cobrado"
          value={cur?.payments.collectedTotal ?? 0}
          mode="money"
          sub={
            cur
              ? `${cur.payments.count} registro${cur.payments.count === 1 ? "" : "s"} · ${paymentMethodSub(cur.payments.byMethod)}`
              : undefined
          }
          delta={
            prev
              ? { current: cur?.payments.collectedTotal ?? 0, previous: prev.payments.collectedTotal }
              : undefined
          }
          series={trendSeries(trendBuckets, "collected")}
          seriesLabels={seriesLabels}
        />
        <StatCardBar
          label="Métodos de pago"
          value={collectedTotal}
          mode="money"
          sub={paymentMethodSub(cur?.payments.byMethod)}
          bars={[
            cur?.payments.byMethod["cash"] ?? 0,
            cur?.payments.byMethod["transfer"] ?? 0,
            cur?.payments.byMethod["credit"] ?? 0,
            cur?.payments.byMethod["other"] ?? 0,
          ]}
          barLabels={["Ef.", "Trans.", "Créd.", "Otro"]}
          showIcon={false}
          delta={
            prev
              ? { current: collectedTotal, previous: prev.payments.collectedTotal }
              : undefined
          }
        />
        <StatCardBar
          label="Entregas"
          value={delivered}
          displayValue={`${delivered}/${totalDeliveries}`}
          sub={
            totalDeliveries > 0
              ? `${pendingDel} pend. · ${failedDel} fall.`
              : undefined
          }
          highlight={failedDel > 0}
          bars={[delivered, pendingDel, failedDel]}
          barLabels={["Entregadas", "Pendientes", "Fallidas"]}
          showIcon={false}
          delta={
            prev
              ? { current: delivered, previous: prev.deliveries.delivered }
              : undefined
          }
        />
      </div>

      {/* KPI row 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        <StatCardSimple
          label="Neto en caja"
          value={cur?.cashNet ?? 0}
          mode="money"
          sub={cur ? `Ef. ${fmtMoney(cur.payments.byMethod.cash ?? 0)} − gastos` : undefined}
          highlight={(cur?.cashNet ?? 0) < 0}
          delta={prev ? { current: cur?.cashNet ?? 0, previous: prev.cashNet } : undefined}
          series={trendSeries(trendBuckets, "cashNet")}
          seriesLabels={seriesLabels}
        />
        <StatCardSimple
          label="Crédito + Pendiente"
          value={curPending}
          mode="money"
          sub={cur
            ? `${fmtMoney(cur.payments.byMethod["credit"] ?? 0)} cred · ${fmtMoney(cur.payments.pendingAmount ?? 0)} pend`
            : undefined}
          highlight={curPending > 0}
          delta={prev ? { current: curPending, previous: prevPending, inverted: true } : undefined}
          series={trendSeries(trendBuckets, "pendingCredit")}
          seriesLabels={seriesLabels}
        />
        <StatCardSimple
          label="Despachos"
          value={cur?.dispatches.count ?? 0}
          sub={cur ? `${fmtQty(cur.dispatches.units)} u cargadas` : undefined}
          delta={
            prev
              ? { current: cur?.dispatches.count ?? 0, previous: prev.dispatches.count }
              : undefined
          }
          series={trendSeries(trendBuckets, "dispatches")}
          seriesLabels={seriesLabels}
          chartType="bar"
        />
        <StatCardSimple
          label="Unidades vendidas"
          value={cur?.deliveries.soldUnits ?? 0}
          sub={cur ? `${fmtMoney(cur.deliveries.soldAmount ?? 0)} en ventas` : undefined}
          delta={
            prev
              ? { current: cur?.deliveries.soldUnits ?? 0, previous: prev.deliveries.soldUnits }
              : undefined
          }
          series={trendSeries(trendBuckets, "soldUnits")}
          seriesLabels={seriesLabels}
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashboardChartPanel
          title="Tendencia de ventas"
          subtitle={
            hasSalesTrend
              ? `Total ${fmtMoney(salesTrendTotal)} · comparado con período anterior`
              : undefined
          }
          empty={!hasSalesTrend}
        >
          <ChartContainer config={salesTrendConfig} className="h-56 w-full aspect-auto">
            <LineChart data={salesTrendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} {...CHART_GRID} />
              <XAxis
                dataKey="label"
                tick={CHART_AXIS}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={(v) => fmtMoney(v)}
                tick={CHART_AXIS}
                tickLine={false}
                axisLine={false}
                width={68}
                domain={[0, (max: number) => Math.max(max, 1)]}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => (
                      <span className="font-mono tabular-nums">{fmtMoney(Number(value))}</span>
                    )}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="current"
                stroke="var(--color-current)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
              <Line
                type="monotone"
                dataKey="previous"
                stroke="var(--color-previous)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                strokeOpacity={0.45}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        </DashboardChartPanel>

        <DashboardChartPanel
          title="Productos más vendidos"
          subtitle={
            topProductsData.length
              ? `Top ${topProductsData.length} por monto neto`
              : undefined
          }
          empty={topProductsData.length === 0}
        >
          <ChartContainer config={topProductsConfig} className="h-56 w-full aspect-auto">
            <BarChart data={topProductsData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} {...CHART_GRID} />
              <XAxis
                dataKey="name"
                tick={CHART_AXIS}
                tickLine={false}
                axisLine={false}
                interval={0}
                angle={-28}
                textAnchor="end"
                height={52}
              />
              <YAxis
                tickFormatter={(v) => fmtMoney(v)}
                tick={CHART_AXIS}
                tickLine={false}
                axisLine={false}
                width={68}
                domain={[0, (max: number) => Math.max(max, 1)]}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => {
                      const row = payload?.[0]?.payload as { fullName?: string } | undefined;
                      return row?.fullName ?? "";
                    }}
                    formatter={(value, _name, item) => {
                      const row = item.payload as { units?: number; unit?: string | null };
                      const units = row.units ?? 0;
                      const unitLabel = row.unit ? ` ${row.unit}` : " u";
                      return (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-mono tabular-nums">{fmtMoney(Number(value))}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {fmtQty(units)}
                            {unitLabel}
                          </span>
                        </div>
                      );
                    }}
                  />
                }
              />
              <Bar
                dataKey="amount"
                fill="var(--color-amount)"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ChartContainer>
        </DashboardChartPanel>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashboardChartPanel
          title="Métodos de pago"
          subtitle={collectedTotal > 0 ? `Total cobrado ${fmtMoney(collectedTotal)}` : undefined}
          empty={pieData.length === 0}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <ChartContainer config={paymentMethodsConfig} className="mx-auto h-48 w-48 shrink-0 aspect-square">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={52}
                  outerRadius={72}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {pieData.map((d) => (
                    <Cell key={d.key} fill={PAYMENT_COLORS[d.key] ?? C4} />
                  ))}
                  <Label
                    content={({ viewBox }) => {
                      if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
                      const { cx, cy } = viewBox;
                      return (
                        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                          <tspan
                            x={cx}
                            y={(cy ?? 0) - 6}
                            className="fill-muted-foreground"
                            fontSize={10}
                          >
                            Total
                          </tspan>
                          <tspan
                            x={cx}
                            y={(cy ?? 0) + 10}
                            className="fill-foreground font-medium"
                            fontSize={12}
                            fontFamily="var(--font-mono)"
                          >
                            {fmtMoney(collectedTotal)}
                          </tspan>
                        </text>
                      );
                    }}
                  />
                </Pie>
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, _name, item) => {
                        const row = item.payload as { pct?: string };
                        return (
                          <span className="font-mono tabular-nums">
                            {fmtMoney(Number(value))} ({row.pct})
                          </span>
                        );
                      }}
                    />
                  }
                />
              </PieChart>
            </ChartContainer>

            <ul className="flex-1 space-y-2 text-sm min-w-0">
              {pieData.map((d) => (
                <li key={d.key} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: PAYMENT_COLORS[d.key] ?? C4 }}
                    />
                    <span className="truncate text-muted-foreground">{d.name}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-right">
                    <span className="font-mono">{fmtMoney(d.value)}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">{d.pct}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </DashboardChartPanel>
      </div>

      <DashboardDriverSegments
        dispatchByDriver={byDriverDispatch ?? []}
        dispatchDrivers={dispatchDrivers}
        preorderByDriver={byDriverPreorder ?? []}
        preorderDrivers={preorderDrivers}
        showDispatch={showDispatch}
        showPreorder={showPreorder}
      />

      <div className="flex items-center gap-4 text-sm">
        <Link to="/app/deliveries" className="text-primary hover:underline">
          Ver entregas →
        </Link>
        <Link to="/app/payments" className="text-primary hover:underline">
          Ver pagos →
        </Link>
      </div>
    </div>
  );
}
