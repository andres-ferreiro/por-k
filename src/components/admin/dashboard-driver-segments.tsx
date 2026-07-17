import { Link } from "@tanstack/react-router";
import {
  DashboardChartPanel,
  truncateLabel,
} from "@/components/admin/dashboard-chart-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const CHART_AXIS = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const CHART_GRID = { strokeDasharray: "3 3", stroke: "hsl(var(--border))", strokeOpacity: 0.6 };

const driverPerfConfig: ChartConfig = {
  sold: { label: "Vendido", color: "#00636f" },
  collected: { label: "Cobrado", color: "#3b82f6" },
  expenses: { label: "Gastos", color: "#e24b4a" },
};

export type DashboardDriverRow = {
  driver_id: string;
  driver_name: string | null;
  sold: number;
  collected: number;
  pending: number;
  expenses: number;
};

export type DashboardDriverSummary = {
  id: string;
  name: string | null;
  sold: number;
  collected: number;
  pending: number;
  failed: number;
};

function toChartData(rows: DashboardDriverRow[]) {
  return rows
    .filter((d) => d.sold > 0 || d.collected > 0 || d.expenses > 0)
    .slice(0, 6)
    .map((d) => ({
      name: truncateLabel(d.driver_name ?? "—", 12),
      sold: d.sold,
      collected: d.collected,
      expenses: d.expenses,
    }));
}

export function DashboardDriverSegment({
  title,
  description,
  byDriver,
  drivers,
  showExpenses = true,
  tableVariant = "owner",
}: {
  title: string;
  description?: string;
  byDriver: DashboardDriverRow[];
  drivers?: DashboardDriverSummary[];
  showExpenses?: boolean;
  tableVariant?: "owner" | "supervisor";
}) {
  const chartData = toChartData(byDriver);
  const tableRows =
    tableVariant === "supervisor"
      ? byDriver.filter((d) => d.sold > 0 || d.collected > 0 || d.pending > 0 || d.expenses > 0)
      : (drivers ?? []);
  const hasData = chartData.length > 0 || tableRows.length > 0;

  if (!hasData) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </CardHeader>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Sin datos para el período.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <DashboardChartPanel
        title={`Rendimiento · ${title}`}
        subtitle={
          chartData.length
            ? `${chartData.length} repartidor${chartData.length === 1 ? "" : "es"} · vendido / cobrado${showExpenses ? " / gastos" : ""}`
            : undefined
        }
        empty={chartData.length === 0}
      >
        <ChartContainer config={driverPerfConfig} className="h-56 w-full aspect-auto">
          <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid horizontal={false} {...CHART_GRID} />
            <XAxis
              type="number"
              tickFormatter={(v) => fmtMoney(v)}
              tick={CHART_AXIS}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={76}
              tick={CHART_AXIS}
              tickLine={false}
              axisLine={false}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => (
                    <span className="font-mono tabular-nums">{fmtMoney(Number(value))}</span>
                  )}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="sold" fill="var(--color-sold)" radius={[0, 4, 4, 0]} barSize={8} />
            <Bar dataKey="collected" fill="var(--color-collected)" radius={[0, 4, 4, 0]} barSize={8} />
            {showExpenses && (
              <Bar dataKey="expenses" fill="var(--color-expenses)" radius={[0, 4, 4, 0]} barSize={8} />
            )}
          </BarChart>
        </ChartContainer>
      </DashboardChartPanel>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-2">
          <div>
            <CardTitle className="text-sm font-medium">Estado · {title}</CardTitle>
            {(tableVariant === "supervisor" ? tableRows.length : (drivers ?? []).length) > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
            {tableVariant === "supervisor"
              ? `${tableRows.length} repartidor${tableRows.length === 1 ? "" : "es"}`
              : `${(drivers ?? []).length} repartidor${(drivers ?? []).length === 1 ? "" : "es"}`}
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <th className="sticky left-0 z-10 bg-muted/40 px-4 py-2.5 text-left font-medium shadow-[1px_0_0_0_hsl(var(--border))]">
                    Repartidor
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium">Vendido</th>
                  <th className="px-4 py-2.5 text-right font-medium">Cobrado</th>
                  <th className="px-4 py-2.5 text-right font-medium">Pendiente</th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    {tableVariant === "supervisor" ? "Gastos" : "Fallidas"}
                  </th>
                </tr>
              </thead>
              <tbody>
            {tableVariant === "supervisor" ? (
              tableRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Sin datos para el período.
                  </td>
                </tr>
              ) : (
                (tableRows as DashboardDriverRow[]).map((d) => (
                  <tr key={d.driver_id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="sticky left-0 z-10 bg-card px-4 py-2.5 shadow-[1px_0_0_0_hsl(var(--border))]">
                      <Link
                        to="/app/deliveries"
                        search={{ driver_id: d.driver_id } as Record<string, string>}
                        className="font-medium hover:underline"
                      >
                        {d.driver_name ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-mono">{fmtMoney(d.sold)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-mono">{fmtMoney(d.collected)}</td>
                    <td
                      className={cn(
                        "px-4 py-2.5 text-right tabular-nums font-mono",
                        d.pending > 0 && "text-amber-600 font-medium",
                      )}
                    >
                      {fmtMoney(d.pending)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2.5 text-right tabular-nums font-mono",
                        d.expenses > 0 && "text-rose-600 font-medium",
                      )}
                    >
                      {fmtMoney(d.expenses)}
                    </td>
                  </tr>
                ))
              )
            ) : tableRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Sin datos para el período.
                </td>
              </tr>
            ) : (
              (tableRows as DashboardDriverSummary[]).map((d) => (
                <tr key={d.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="sticky left-0 z-10 bg-card px-4 py-2.5 shadow-[1px_0_0_0_hsl(var(--border))]">
                    <Link
                      to="/app/deliveries"
                      search={{ driver_id: d.id } as Record<string, string>}
                      className="font-medium hover:underline"
                    >
                      {d.name ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-mono">{fmtMoney(d.sold)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-mono">{fmtMoney(d.collected)}</td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right tabular-nums font-mono",
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
        </CardContent>
      </Card>
    </div>
  );
}

export function DashboardDriverSegments({
  dispatchByDriver,
  dispatchDrivers,
  preorderByDriver,
  preorderDrivers,
  tableVariant = "owner",
  showDispatch = true,
  showPreorder = true,
}: {
  dispatchByDriver: DashboardDriverRow[];
  dispatchDrivers?: DashboardDriverSummary[];
  preorderByDriver: DashboardDriverRow[];
  preorderDrivers?: DashboardDriverSummary[];
  tableVariant?: "owner" | "supervisor";
  showDispatch?: boolean;
  showPreorder?: boolean;
}) {
  const segments = [
    showDispatch ? (
      <DashboardDriverSegment
        key="dispatch"
        title="Tiendas de abarrotes"
        description="Rutas de reparto a tiendas"
        byDriver={dispatchByDriver}
        drivers={dispatchDrivers}
        tableVariant={tableVariant}
        showExpenses={tableVariant === "owner"}
      />
    ) : null,
    showPreorder ? (
      <DashboardDriverSegment
        key="preorder"
        title="Hoteles y restaurantes"
        description="Ruta de pedidos anticipados"
        byDriver={preorderByDriver}
        drivers={preorderDrivers}
        tableVariant={tableVariant}
        showExpenses={tableVariant === "owner"}
      />
    ) : null,
  ].filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-6",
        segments.length > 1 && "xl:grid-cols-2",
      )}
    >
      {segments}
    </div>
  );
}
