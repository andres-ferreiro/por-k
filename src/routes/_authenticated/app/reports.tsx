import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  reportSalesByProduct, reportSalesByDriver, reportSalesByCustomer,
} from "@/lib/api/admin.functions";
import { listRoutesForDispatch } from "@/lib/api/dispatches.functions";
import { listBranchDrivers } from "@/lib/api/routes.functions";
import { todayInTZ } from "@/lib/tz";
import { useBranchScope } from "@/lib/branch-scope";
import { downloadCSV } from "@/lib/csv";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/reports")({
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
        <p className="text-muted-foreground">Ventas, repartidores y clientes.</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex flex-wrap gap-2">
            {(["today","yesterday","7d","month","custom"] as Preset[]).map((p) => (
              <Button key={p} size="sm" variant={preset === p ? "default" : "outline"} onClick={() => applyPreset(p)}>
                {p === "today" ? "Hoy" : p === "yesterday" ? "Ayer" : p === "7d" ? "Últimos 7 días" : p === "month" ? "Mes actual" : "Personalizado"}
              </Button>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Field label="Desde">
              <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value || today); setPreset("custom"); }} />
            </Field>
            <Field label="Hasta">
              <Input type="date" value={to} onChange={(e) => { setTo(e.target.value || today); setPreset("custom"); }} />
            </Field>
            <Field label="Ruta">
              <Select value={routeId} onValueChange={setRouteId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {(routes ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Repartidor">
              <Select value={driverId} onValueChange={setDriverId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {(drivers ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.full_name ?? d.id.slice(0,8)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">Por producto</TabsTrigger>
          <TabsTrigger value="drivers">Por repartidor</TabsTrigger>
          <TabsTrigger value="customers">Por cliente</TabsTrigger>
        </TabsList>
        <TabsContent value="products"><ByProduct filters={filters} /></TabsContent>
        <TabsContent value="drivers"><ByDriver filters={filters} /></TabsContent>
        <TabsContent value="customers"><ByCustomer filters={filters} /></TabsContent>
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
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Ventas por producto</CardTitle>
        <Button size="sm" variant="outline" disabled={!data?.length} onClick={() => downloadCSV(
          `ventas_producto_${filters.date_from}_${filters.date_to}.csv`,
          (data ?? []).map((r) => ({ producto: r.product_name ?? "", unidad: r.unit ?? "", vendido: r.units_sold, devuelto: r.units_returned, monto: r.amount })),
        )}><Download className="h-4 w-4 mr-1" />CSV</Button>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {!isLoading && (data?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">Sin ventas en este rango.</p>}
        {(data?.length ?? 0) > 0 && (
          <div className="overflow-x-auto">
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
                {(data ?? []).map((r) => (
                  <TableRow key={r.product_id}>
                    <TableCell>{r.product_name ?? r.product_id.slice(0,8)} {r.unit && <span className="text-xs text-muted-foreground">({r.unit})</span>}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(r.units_sold)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{fmtNum(r.units_returned)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{fmtMoney(r.amount)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold bg-muted/40">
                  <TableCell colSpan={3}>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(total)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
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
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Ventas por repartidor</CardTitle>
        <Button size="sm" variant="outline" disabled={!data?.length} onClick={() => downloadCSV(
          `ventas_repartidor_${filters.date_from}_${filters.date_to}.csv`,
          (data ?? []).map((r) => ({ repartidor: r.driver_name ?? "", vendido: r.sold, cobrado: r.collected, pendiente: r.pending, gastos: r.expenses, neto: r.net })),
        )}><Download className="h-4 w-4 mr-1" />CSV</Button>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {!isLoading && (data?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">Sin actividad en este rango.</p>}
        {(data?.length ?? 0) > 0 && (
          <div className="overflow-x-auto">
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
                {(data ?? []).map((r) => (
                  <TableRow key={r.driver_id}>
                    <TableCell>{r.driver_name ?? r.driver_id.slice(0,8)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(r.sold)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(r.collected)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${r.pending > 0 ? "text-destructive" : ""}`}>{fmtMoney(r.pending)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(r.expenses)}</TableCell>
                    <TableCell className={`text-right tabular-nums font-medium ${r.net < 0 ? "text-destructive" : ""}`}>{fmtMoney(r.net)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold bg-muted/40">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(totals.sold)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(totals.collected)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(totals.pending)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(totals.expenses)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(totals.net)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ByCustomer({ filters }: { filters: Filters }) {
  const fn = useServerFn(reportSalesByCustomer);
  const { data, isLoading } = useQuery({
    queryKey: ["rep", "customer", filters],
    queryFn: () => fn({ data: { ...filters, limit: 100 } }),
  });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Top clientes</CardTitle>
        <Button size="sm" variant="outline" disabled={!data?.length} onClick={() => downloadCSV(
          `ventas_cliente_${filters.date_from}_${filters.date_to}.csv`,
          (data ?? []).map((r) => ({ cliente: r.customer_name ?? "", visitas: r.visits, monto: r.amount })),
        )}><Download className="h-4 w-4 mr-1" />CSV</Button>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {!isLoading && (data?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">Sin ventas en este rango.</p>}
        {(data?.length ?? 0) > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Visitas</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((r) => (
                  <TableRow key={r.customer_id}>
                    <TableCell>{r.customer_name ?? r.customer_id.slice(0,8)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.visits}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{fmtMoney(r.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
