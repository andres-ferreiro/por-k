import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { listPaymentsAdmin } from "@/lib/api/admin.functions";
import { listRoutesForDispatch } from "@/lib/api/dispatches.functions";
import { listBranchDrivers } from "@/lib/api/routes.functions";
import { APP_LOCALE, APP_TZ, todayInTZ } from "@/lib/tz";
import { useBranchScope } from "@/lib/branch-scope";
import { downloadCSV } from "@/lib/csv";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/payments")({
  component: PaymentsPage,
});

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

const methodLabel: Record<string, string> = {
  cash: "Efectivo", transfer: "Transferencia", credit: "Crédito", other: "Otro",
};

function PaymentsPage() {
  const today = todayInTZ();
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [routeId, setRouteId] = useState<string>("all");
  const [driverId, setDriverId] = useState<string>("all");
  const [method, setMethod] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [origin, setOrigin] = useState<string>("all");

  const listFn = useServerFn(listPaymentsAdmin);
  const routesFn = useServerFn(listRoutesForDispatch);
  const driversFn = useServerFn(listBranchDrivers);

  const { data: routes } = useQuery({ queryKey: ["admin", "routes"], queryFn: () => routesFn() });
  const { data: drivers } = useQuery({
    queryKey: ["admin", "drivers"],
    queryFn: () => driversFn({ data: { branch_id: null } }),
  });

  const { branchId } = useBranchScope();
  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin", "payments", dateFrom, dateTo, routeId, driverId, method, status, origin, branchId],
    queryFn: () =>
      listFn({
        data: {
          date_from: dateFrom,
          date_to: dateTo,
          route_id: routeId === "all" ? null : routeId,
          driver_id: driverId === "all" ? null : driverId,
          method: method === "all" ? null : (method as any),
          status: status === "all" ? null : (status as any),
          origin: origin === "all" ? null : (origin as any),
          branch_id: branchId,
        },
      }),
  });

  const totals = useMemo(() => {
    const all = rows ?? [];
    const paid = all.filter((p) => p.status === "paid");
    const byMethod: Record<string, number> = { cash: 0, transfer: 0, credit: 0, other: 0 };
    for (const p of paid) byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;
    return {
      total: paid.reduce((a, p) => a + p.amount, 0),
      pending: all.filter((p) => p.status === "pending").reduce((a, p) => a + p.amount, 0),
      byMethod,
      count: all.length,
    };
  }, [rows]);

  function exportCSV() {
    if (!rows?.length) return;
    downloadCSV(
      `pagos_${dateFrom}_${dateTo}.csv`,
      rows.map((r) => ({
        fecha: new Date(r.paid_at).toLocaleString(APP_LOCALE, { timeZone: APP_TZ }),
        repartidor: r.driver_name ?? "",
        ruta: r.route_name ?? "",
        cliente: r.customer_name ?? "",
        monto: r.amount,
        metodo: methodLabel[r.method] ?? r.method,
        estado: r.status === "paid" ? "Pagado" : "Pendiente",
        origen: r.from_delivery ? "Venta entrega" : "Abono manual",
        nota: r.note ?? "",
      })),
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pagos</h1>
          <p className="text-muted-foreground">Cobros del día y pendientes.</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={!rows?.length}>
          <Download className="h-4 w-4 mr-1" /> Exportar CSV
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6 grid gap-3 md:grid-cols-3 lg:grid-cols-7">
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
          <Field label="Método">
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="cash">Efectivo</SelectItem>
                <SelectItem value="transfer">Transferencia</SelectItem>
                <SelectItem value="credit">Crédito</SelectItem>
                <SelectItem value="other">Otro</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Estado">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="paid">Pagado</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Origen">
            <Select value={origin} onValueChange={setOrigin}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="delivery">Venta entrega</SelectItem>
                <SelectItem value="manual">Abono manual</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total cobrado" value={fmtMoney(totals.total)} />
        <Stat label="Efectivo" value={fmtMoney(totals.byMethod.cash)} />
        <Stat label="Transferencia" value={fmtMoney(totals.byMethod.transfer)} />
        <Stat label="Pendiente" value={fmtMoney(totals.pending)} accent={totals.pending > 0 ? "destructive" : undefined} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{totals.count} pagos</CardTitle></CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {!isLoading && (rows?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">Sin pagos para los filtros seleccionados.</p>
          )}
          {(rows?.length ?? 0) > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Ruta</TableHead>
                    <TableHead>Repartidor</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rows ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {new Date(r.paid_at).toLocaleString(APP_LOCALE, { timeZone: APP_TZ, dateStyle: "short", timeStyle: "short" })}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{r.customer_name ?? "—"}</TableCell>
                      <TableCell>{r.route_name ?? "—"}</TableCell>
                      <TableCell>{r.driver_name ?? "—"}</TableCell>
                      <TableCell>{methodLabel[r.method] ?? r.method}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "paid" ? "secondary" : "destructive"}>
                          {r.status === "paid" ? "Pagado" : "Pendiente"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.from_delivery ? "outline" : "secondary"}>
                          {r.from_delivery ? "Venta entrega" : "Abono manual"}
                        </Badge>
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

function Stat({ label, value, accent }: { label: string; value: string; accent?: "destructive" }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent>
        <div className={`text-2xl font-semibold tabular-nums ${accent === "destructive" ? "text-destructive" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
