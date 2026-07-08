import { Download01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { usePagination } from "@/hooks/use-pagination";
import { SelectItem } from "@/components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  reportSalesByProduct, reportSalesByDriver, reportSalesByCustomer,
  getRouteEfficiencyReport,
  getReturnsReport,
} from "@/lib/api/admin.functions";
import { listRoutesForDispatch } from "@/lib/api/dispatches.functions";
import { listBranchDrivers } from "@/lib/api/routes.functions";
import { getMyContext } from "@/lib/api/context.functions";
import { todayInTZ } from "@/lib/tz";
import { useBranchScope } from "@/lib/branch-scope";
import { downloadCSV } from "@/lib/csv";

import {
  PageHeader, TableToolbar, DataTableCard, FilterSelect, FilterDateRangePicker,
  TablePagination,
} from "@/components/admin/data-table";
import { DeliveryPhotosTab } from "@/components/reports/delivery-photos-tab";

export const Route = createFileRoute("/_authenticated/app/reports")({
  loader: async ({ context }) => {
    const ctx = await context.queryClient.fetchQuery({
      queryKey: ["myContext"],
      queryFn: () => getMyContext(),
    });
    const allowed = ctx.roles.some((r) => r === "owner" || r === "supervisor");
    if (!allowed) throw redirect({ to: "/app" });
    return ctx;
  },
  component: ReportsPage,
});

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);
const fmtNum = (n: number) =>
  Number.isInteger(n) ? n.toString() : n.toFixed(2).replace(/\.?0+$/, "");

type Preset = "today" | "yesterday" | "7d" | "month" | "custom";

function rangeFromPreset(p: Preset): { from: string; to: string } {
  const today = todayInTZ();
  const todayD = new Date(today + "T12:00:00Z");
  const shift = (days: number) => {
    const d = new Date(todayD);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  if (p === "today") return { from: today, to: today };
  if (p === "yesterday") { const y = shift(-1); return { from: y, to: y }; }
  if (p === "7d") return { from: shift(-6), to: today };
  if (p === "month") return { from: today.slice(0, 8) + "01", to: today };
  return { from: today, to: today };
}

function ReportsPage() {
  const today = todayInTZ();
  const [preset, setPreset] = useState<Preset>("today");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [routeId, setRouteId] = useState("all");
  const [driverId, setDriverId] = useState("all");

  function applyPreset(p: Preset) {
    setPreset(p);
    if (p !== "custom") {
      const r = rangeFromPreset(p);
      setFrom(r.from);
      setTo(r.to);
    }
  }

  const { branchId } = useBranchScope();
  const filters = { date_from: from, date_to: to, route_id: routeId === "all" ? null : routeId, driver_id: driverId === "all" ? null : driverId, branch_id: branchId };

  const routesFn = useServerFn(listRoutesForDispatch);
  const driversFn = useServerFn(listBranchDrivers);
  const { data: routes } = useQuery({ queryKey: ["admin", "routes"], queryFn: () => routesFn() });
  const { data: drivers } = useQuery({
    queryKey: ["admin", "drivers"], queryFn: () => driversFn({ data: { branch_id: null } }),
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Reportes" description="Ventas, repartidores y clientes." />

      <TableToolbar
        filters={
          <>
            {(["today", "yesterday", "7d", "month"] as Preset[]).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={preset === p ? "secondary" : "ghost"}
                className="h-10 px-3 text-sm"
                onClick={() => applyPreset(p)}
              >
                {p === "today" ? "Hoy" : p === "yesterday" ? "Ayer" : p === "7d" ? "7 días" : "Mes"}
              </Button>
            ))}
            <FilterDateRangePicker
              from={from}
              to={to}
              onFromChange={(v) => { setFrom(v || today); setPreset("custom"); }}
              onToChange={(v) => { setTo(v || today); setPreset("custom"); }}
            />
            <FilterSelect value={routeId} onValueChange={setRouteId} placeholder="Ruta">
              <SelectItem value="all">Todas las rutas</SelectItem>
              {(routes ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
            </FilterSelect>
            <FilterSelect value={driverId} onValueChange={setDriverId} placeholder="Repartidor">
              <SelectItem value="all">Todos</SelectItem>
              {(drivers ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.full_name ?? d.id.slice(0, 8)}</SelectItem>)}
            </FilterSelect>
          </>
        }
      />

      <Tabs defaultValue="products">
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <TabsList className="w-max min-w-full">
            <TabsTrigger value="products">Por producto</TabsTrigger>
            <TabsTrigger value="drivers">Por repartidor</TabsTrigger>
            <TabsTrigger value="customers">Por cliente</TabsTrigger>
            <TabsTrigger value="efficiency">Eficiencia rutas</TabsTrigger>
            <TabsTrigger value="returns">Devoluciones</TabsTrigger>
            <TabsTrigger value="photos">Fotos</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="products"><ByProduct filters={filters} /></TabsContent>
        <TabsContent value="drivers"><ByDriver filters={filters} /></TabsContent>
        <TabsContent value="customers"><ByCustomer filters={filters} /></TabsContent>
        <TabsContent value="efficiency"><ByRouteEfficiency filters={filters} /></TabsContent>
        <TabsContent value="returns"><ReturnsReport filters={filters} /></TabsContent>
        <TabsContent value="photos"><DeliveryPhotosTab filters={filters} /></TabsContent>
      </Tabs>
    </div>
  );
}

type Filters = { date_from: string; date_to: string; route_id: string | null; driver_id: string | null; branch_id: string | null };

function ByProduct({ filters }: { filters: Filters }) {
  const fn = useServerFn(reportSalesByProduct);
  const { data, isLoading } = useQuery({
    queryKey: ["rep", "product", filters],
    queryFn: () => fn({ data: filters }),
  });
  const total = useMemo(() => (data ?? []).reduce((a, r) => a + r.amount, 0), [data]);
  const rows = data ?? [];
  const pagination = usePagination(rows, undefined, [filters]);
  return (
    <DataTableCard>
      <div className="flex flex-row items-center justify-between px-4 py-3 border-b">
        <div className="text-sm font-medium">Ventas por producto</div>
        <Button size="sm" variant="outline" disabled={!data?.length} onClick={() => downloadCSV(
          `ventas_producto_${filters.date_from}_${filters.date_to}.csv`,
          (data ?? []).map((r) => ({ producto: r.product_name ?? "", unidad: r.unit ?? "", vendido: r.units_sold, devuelto: r.units_returned, monto: r.amount })),
        )}><Icon icon={Download01Icon} className="h-4 w-4 mr-1" />CSV</Button>
      </div>
      <div className="p-0">
        {isLoading && <p className="text-sm text-muted-foreground px-4 py-8">Cargando…</p>}
        {!isLoading && (data?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground px-4 py-8">Sin ventas en este rango.</p>}
        {(data?.length ?? 0) > 0 && (
          <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Vendidas</TableHead>
                  <TableHead className="text-right">Devueltas</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedItems.map((r) => (
                  <TableRow key={r.product_id}>
                    <TableCell>{r.product_name ?? r.product_id.slice(0,8)} {r.unit && <span className="text-xs text-muted-foreground">({r.unit})</span>}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(r.units_sold)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{fmtNum(r.units_returned)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{fmtMoney(r.amount)}</TableCell>
                  </TableRow>
                ))}
                {pagination.page === pagination.totalPages && (
                <TableRow className="font-semibold bg-muted/40">
                  <TableCell colSpan={3}>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(total)}</TableCell>
                </TableRow>
                )}
              </TableBody>
            </Table>
        )}
        <TablePagination {...pagination.controls} />
      </div>
    </DataTableCard>
  );
}

function ByDriver({ filters }: { filters: Filters }) {
  const fn = useServerFn(reportSalesByDriver);
  const { data, isLoading } = useQuery({
    queryKey: ["rep", "driver", filters],
    queryFn: () => fn({ data: filters }),
  });
  const totals = useMemo(() => {
    const rows = data ?? [];
    return {
      sold: rows.reduce((a, r) => a + r.sold, 0),
      collected: rows.reduce((a, r) => a + r.collected, 0),
      pending: rows.reduce((a, r) => a + r.pending, 0),
      expenses: rows.reduce((a, r) => a + r.expenses, 0),
      net: rows.reduce((a, r) => a + r.net, 0),
    };
  }, [data]);
  const rows = data ?? [];
  const pagination = usePagination(rows, undefined, [filters]);
  return (
    <DataTableCard>
      <div className="flex flex-row items-center justify-between px-4 py-3 border-b">
        <div className="text-sm font-medium">Ventas por repartidor</div>
        <Button size="sm" variant="outline" disabled={!data?.length} onClick={() => downloadCSV(
          `ventas_repartidor_${filters.date_from}_${filters.date_to}.csv`,
          (data ?? []).map((r) => ({ repartidor: r.driver_name ?? "", vendido: r.sold, cobrado: r.collected, pendiente: r.pending, gastos: r.expenses, neto: r.net })),
        )}><Icon icon={Download01Icon} className="h-4 w-4 mr-1" />CSV</Button>
      </div>
      <div className="p-0">
        {isLoading && <p className="text-sm text-muted-foreground px-4 py-8">Cargando…</p>}
        {!isLoading && (data?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground px-4 py-8">Sin actividad en este rango.</p>}
        {(data?.length ?? 0) > 0 && (
          <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Repartidor</TableHead>
                  <TableHead className="text-right">Vendido</TableHead>
                  <TableHead className="text-right">Cobrado</TableHead>
                  <TableHead className="text-right">Pendiente</TableHead>
                  <TableHead className="text-right">Gastos</TableHead>
                  <TableHead className="text-right">Neto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedItems.map((r) => (
                  <TableRow key={r.driver_id}>
                    <TableCell>{r.driver_name ?? r.driver_id.slice(0,8)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(r.sold)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(r.collected)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${r.pending > 0 ? "text-destructive" : ""}`}>{fmtMoney(r.pending)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(r.expenses)}</TableCell>
                    <TableCell className={`text-right tabular-nums font-medium ${r.net < 0 ? "text-destructive" : ""}`}>{fmtMoney(r.net)}</TableCell>
                  </TableRow>
                ))}
                {pagination.page === pagination.totalPages && (
                <TableRow className="font-semibold bg-muted/40">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(totals.sold)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(totals.collected)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(totals.pending)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(totals.expenses)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(totals.net)}</TableCell>
                </TableRow>
                )}
              </TableBody>
            </Table>
        )}
        <TablePagination {...pagination.controls} />
      </div>
    </DataTableCard>
  );
}

function ByCustomer({ filters }: { filters: Filters }) {
  const fn = useServerFn(reportSalesByCustomer);
  const { data, isLoading } = useQuery({
    queryKey: ["rep", "customer", filters],
    queryFn: () => fn({ data: { ...filters, limit: 100 } }),
  });
  const rows = data ?? [];
  const pagination = usePagination(rows, undefined, [filters]);
  return (
    <DataTableCard>
      <div className="flex flex-row items-center justify-between px-4 py-3 border-b">
        <div className="text-sm font-medium">Top clientes</div>
        <Button size="sm" variant="outline" disabled={!data?.length} onClick={() => downloadCSV(
          `ventas_cliente_${filters.date_from}_${filters.date_to}.csv`,
          (data ?? []).map((r) => ({ cliente: r.customer_name ?? "", visitas: r.visits, monto: r.amount })),
        )}><Icon icon={Download01Icon} className="h-4 w-4 mr-1" />CSV</Button>
      </div>
      <div className="p-0">
        {isLoading && <p className="text-sm text-muted-foreground px-4 py-8">Cargando…</p>}
        {!isLoading && (data?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground px-4 py-8">Sin ventas en este rango.</p>}
        {(data?.length ?? 0) > 0 && (
          <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Visitas</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedItems.map((r) => (
                  <TableRow key={r.customer_id}>
                    <TableCell>{r.customer_name ?? r.customer_id.slice(0,8)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.visits}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{fmtMoney(r.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
        )}
        <TablePagination {...pagination.controls} />
      </div>
    </DataTableCard>
  );
}

function fmtEfficiency(n: number | null, suffix = "") {
  if (n == null) return "—";
  return `${n}${suffix}`;
}

function ByRouteEfficiency({ filters }: { filters: Filters }) {
  const fn = useServerFn(getRouteEfficiencyReport);
  const { data, isLoading } = useQuery({
    queryKey: ["rep", "efficiency", filters],
    queryFn: () => fn({ data: filters }),
  });

  const rows = data ?? [];
  const pagination = usePagination(rows, undefined, [filters]);

  return (
    <DataTableCard>
      <div className="flex flex-row items-center justify-between px-4 py-3 border-b">
        <div className="text-sm font-medium">Eficiencia de rutas</div>
        <Button
          size="sm"
          variant="outline"
          disabled={!data?.length}
          onClick={() =>
            downloadCSV(
              `eficiencia_rutas_${filters.date_from}_${filters.date_to}.csv`,
              (data ?? []).map((r) => ({
                fecha: r.date,
                ruta: r.route_name,
                repartidor: r.driver_name ?? "",
                paradas: r.total_stops,
                completadas: r.completed_stops,
                completado_pct: r.completion_pct,
                fallidas_pct: r.failed_pct,
                minutos_activos: r.active_minutes ?? "",
                paradas_hora: r.stops_per_hour ?? "",
                min_por_parada: r.avg_minutes_per_stop ?? "",
                orden_pct: r.sequence_score ?? "",
              })),
            )
          }
        >
          <Icon icon={Download01Icon} className="h-4 w-4 mr-1" />
          CSV
        </Button>
      </div>
      <div className="p-0 overflow-x-auto">
        {isLoading && <p className="text-sm text-muted-foreground px-4 py-8">Cargando…</p>}
        {!isLoading && (data?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground px-4 py-8">Sin actividad en este rango.</p>
        )}
        {(data?.length ?? 0) > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 bg-card shadow-[1px_0_0_0_hsl(var(--border))]">Fecha</TableHead>
                <TableHead>Ruta</TableHead>
                <TableHead>Repartidor</TableHead>
                <TableHead className="text-right">Paradas</TableHead>
                <TableHead className="text-right">Completado</TableHead>
                <TableHead className="text-right">Paradas/h</TableHead>
                <TableHead className="text-right">Min/parada</TableHead>
                <TableHead className="text-right">Orden</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.paginatedItems.map((r) => (
                <TableRow key={`${r.date}-${r.route_id}`}>
                  <TableCell className="sticky left-0 z-10 bg-card whitespace-nowrap text-xs shadow-[1px_0_0_0_hsl(var(--border))]">{r.date}</TableCell>
                  <TableCell>{r.route_name}</TableCell>
                  <TableCell>{r.driver_name ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {r.completed_stops}/{r.total_stops}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {r.completion_pct}%
                    {r.failed_pct > 0 && (
                      <span className="text-rose-600 ml-1">({r.failed_pct}% ✕)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtEfficiency(r.stops_per_hour)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtEfficiency(r.avg_minutes_per_stop)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.sequence_score != null ? `${r.sequence_score}%` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <TablePagination {...pagination.controls} />
      </div>
    </DataTableCard>
  );
}

function ReturnsReport({ filters }: { filters: Filters }) {
  const fn = useServerFn(getReturnsReport);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "returns", filters],
    queryFn: () => fn({ data: filters }),
  });

  const [tab, setTab] = useState<"delivery" | "truck">("delivery");

  const deliveryRows = data?.delivery_returns ?? [];
  const truckRows = data?.truck_returns ?? [];
  const deliveryPagination = usePagination(deliveryRows, undefined, [filters, tab]);
  const truckPagination = usePagination(truckRows, undefined, [filters, tab]);

  function exportDeliveryCSV() {
    downloadCSV(
      deliveryRows.map((r) => ({
        Fecha: r.date,
        Ruta: r.route_name ?? "",
        Repartidor: r.driver_name ?? "",
        Cliente: r.customer_name ?? "",
        Producto: r.product_name ?? "",
        Unidad: r.unit ?? "",
        Cantidad: r.quantity,
      })),
      "devoluciones_clientes.csv",
    );
  }

  function exportTruckCSV() {
    downloadCSV(
      truckRows.map((r) => ({
        Fecha: r.date,
        Ruta: r.route_name ?? "",
        Repartidor: r.driver_name ?? "",
        Producto: r.product_name ?? "",
        Unidad: r.unit ?? "",
        Cantidad: r.quantity,
      })),
      "devoluciones_camion.csv",
    );
  }

  return (
    <div className="space-y-4 mt-2">
      <Tabs value={tab} onValueChange={(v) => setTab(v as "delivery" | "truck")}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <TabsList>
            <TabsTrigger value="delivery">Devoluciones de clientes ({deliveryRows.length})</TabsTrigger>
            <TabsTrigger value="truck">Devoluciones de camión ({truckRows.length})</TabsTrigger>
          </TabsList>
          <Button variant="outline" size="sm" className="h-9 text-sm" onClick={tab === "delivery" ? exportDeliveryCSV : exportTruckCSV} disabled={!data}>
            CSV
          </Button>
        </div>

        <TabsContent value="delivery">
          <DataTableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Ruta</TableHead>
                  <TableHead>Repartidor</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">Cargando…</TableCell></TableRow>
                )}
                {!isLoading && deliveryRows.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">Sin devoluciones de clientes en el período.</TableCell></TableRow>
                )}
                {deliveryPagination.paginatedItems.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs">{r.date}</TableCell>
                    <TableCell>{r.route_name ?? "—"}</TableCell>
                    <TableCell>{r.driver_name ?? "—"}</TableCell>
                    <TableCell>{r.customer_name ?? "—"}</TableCell>
                    <TableCell>{r.product_name ?? "—"}{r.unit ? <span className="text-xs text-muted-foreground ml-1">({r.unit})</span> : null}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(r.quantity)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination {...deliveryPagination.controls} />
          </DataTableCard>
        </TabsContent>

        <TabsContent value="truck">
          <DataTableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Ruta</TableHead>
                  <TableHead>Repartidor</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">Cargando…</TableCell></TableRow>
                )}
                {!isLoading && truckRows.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">Sin devoluciones de camión en el período.</TableCell></TableRow>
                )}
                {truckPagination.paginatedItems.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs">{r.date}</TableCell>
                    <TableCell>{r.route_name ?? "—"}</TableCell>
                    <TableCell>{r.driver_name ?? "—"}</TableCell>
                    <TableCell>{r.product_name ?? "—"}{r.unit ? <span className="text-xs text-muted-foreground ml-1">({r.unit})</span> : null}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(r.quantity)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination {...truckPagination.controls} />
          </DataTableCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}