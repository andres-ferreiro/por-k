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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { listExpensesAdmin } from "@/lib/api/admin.functions";
import { listRoutesForDispatch } from "@/lib/api/dispatches.functions";
import { listBranchDrivers } from "@/lib/api/routes.functions";
import { APP_LOCALE, APP_TZ, todayInTZ } from "@/lib/tz";
import { downloadCSV } from "@/lib/csv";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/expenses")({
  component: ExpensesPage,
});

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

function ExpensesPage() {
  const today = todayInTZ();
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [routeId, setRouteId] = useState("all");
  const [driverId, setDriverId] = useState("all");

  const listFn = useServerFn(listExpensesAdmin);
  const routesFn = useServerFn(listRoutesForDispatch);
  const driversFn = useServerFn(listBranchDrivers);

  const { data: routes } = useQuery({ queryKey: ["admin", "routes"], queryFn: () => routesFn() });
  const { data: drivers } = useQuery({
    queryKey: ["admin", "drivers"],
    queryFn: () => driversFn({ data: { branch_id: null } }),
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin", "expenses", dateFrom, dateTo, routeId, driverId],
    queryFn: () =>
      listFn({
        data: {
          date_from: dateFrom,
          date_to: dateTo,
          route_id: routeId === "all" ? null : routeId,
          driver_id: driverId === "all" ? null : driverId,
        },
      }),
  });

  const total = useMemo(() => (rows ?? []).reduce((a, r) => a + r.amount, 0), [rows]);

  function exportCSV() {
    if (!rows?.length) return;
    downloadCSV(
      `gastos_${dateFrom}_${dateTo}.csv`,
      rows.map((r) => ({
        fecha: r.expense_date,
        repartidor: r.driver_name ?? "",
        ruta: r.route_name ?? "",
        descripcion: r.description,
        monto: r.amount,
      })),
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Gastos</h1>
          <p className="text-muted-foreground">Gastos registrados por repartidores.</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={!rows?.length}>
          <Download className="h-4 w-4 mr-1" /> Exportar CSV
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Desde">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value || today)} />
          </Field>
          <Field label="Hasta">
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value || today)} />
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total del periodo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-semibold tabular-nums">{fmtMoney(total)}</div>
          <p className="text-xs text-muted-foreground mt-1">{rows?.length ?? 0} registros</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {!isLoading && (rows?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">Sin gastos para los filtros seleccionados.</p>
          )}
          {(rows?.length ?? 0) > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Repartidor</TableHead>
                    <TableHead>Ruta</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Foto</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rows ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {new Date(r.created_at).toLocaleString(APP_LOCALE, { timeZone: APP_TZ, dateStyle: "short", timeStyle: "short" })}
                      </TableCell>
                      <TableCell>{r.driver_name ?? "—"}</TableCell>
                      <TableCell>{r.route_name ?? "—"}</TableCell>
                      <TableCell className="max-w-[300px] truncate">{r.description}</TableCell>
                      <TableCell>
                        {r.photo_url ? <span className="text-xs text-muted-foreground">📷</span> : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{fmtMoney(r.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
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
