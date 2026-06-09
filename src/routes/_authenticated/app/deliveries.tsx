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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { listDeliveriesAdmin, getDeliveryDetailAdmin } from "@/lib/api/admin.functions";
import { listRoutesForDispatch } from "@/lib/api/dispatches.functions";
import { listBranchDrivers } from "@/lib/api/routes.functions";
import { APP_LOCALE, APP_TZ, todayInTZ } from "@/lib/tz";
import { useBranchScope } from "@/lib/branch-scope";
import { downloadCSV } from "@/lib/csv";
import { Download, Eye } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/deliveries")({
  component: DeliveriesPage,
});

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

const statusLabel: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  delivered: { label: "Entregada", variant: "secondary" },
  pending: { label: "Pendiente", variant: "outline" },
  failed: { label: "Fallida", variant: "destructive" },
};

const methodLabel: Record<string, string> = {
  cash: "Efectivo", transfer: "Transferencia", credit: "Crédito", other: "Otro",
};

function DeliveriesPage() {
  const today = todayInTZ();
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [routeId, setRouteId] = useState("all");
  const [driverId, setDriverId] = useState("all");
  const [status, setStatus] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const listFn = useServerFn(listDeliveriesAdmin);
  const routesFn = useServerFn(listRoutesForDispatch);
  const driversFn = useServerFn(listBranchDrivers);

  const { data: routes } = useQuery({ queryKey: ["admin", "routes"], queryFn: () => routesFn() });
  const { data: drivers } = useQuery({
    queryKey: ["admin", "drivers"],
    queryFn: () => driversFn({ data: { branch_id: null } }),
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin", "deliveries", dateFrom, dateTo, routeId, driverId, status],
    queryFn: () =>
      listFn({
        data: {
          date_from: dateFrom,
          date_to: dateTo,
          route_id: routeId === "all" ? null : routeId,
          driver_id: driverId === "all" ? null : driverId,
          status: status === "all" ? null : (status as any),
        },
      }),
  });

  const totals = useMemo(() => {
    const all = rows ?? [];
    const delivered = all.filter((r) => r.status === "delivered");
    return {
      count: all.length,
      delivered: delivered.length,
      pending: all.filter((r) => r.status === "pending").length,
      failed: all.filter((r) => r.status === "failed").length,
      amount: delivered.reduce((a, r) => a + r.total, 0),
      units: delivered.reduce((a, r) => a + r.units, 0),
    };
  }, [rows]);

  function exportCSV() {
    if (!rows?.length) return;
    downloadCSV(
      `entregas_${dateFrom}_${dateTo}.csv`,
      rows.map((r) => ({
        fecha: r.delivery_date,
        cliente: r.customer_name ?? "",
        ruta: r.route_name ?? "",
        repartidor: r.driver_name ?? "",
        estado: statusLabel[r.status]?.label ?? r.status,
        unidades: r.units,
        devueltas: r.return_units,
        total: r.total,
        pago_metodo: r.payment ? methodLabel[r.payment.method] : "",
        pago_estado: r.payment ? (r.payment.status === "paid" ? "Pagado" : "Pendiente") : "",
      })),
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Entregas</h1>
          <p className="text-muted-foreground">Seguimiento de visitas por ruta.</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={!rows?.length}>
          <Download className="h-4 w-4 mr-1" /> Exportar CSV
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6 grid gap-3 md:grid-cols-3 lg:grid-cols-5">
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
          <Field label="Estado">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="delivered">Entregada</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="failed">Fallida</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Stat label="Visitas" value={String(totals.count)} />
        <Stat label="Entregadas" value={String(totals.delivered)} />
        <Stat label="Pendientes" value={String(totals.pending)} />
        <Stat label="Fallidas" value={String(totals.failed)} accent={totals.failed > 0 ? "destructive" : undefined} />
        <Stat label="Ventas" value={fmtMoney(totals.amount)} />
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {!isLoading && (rows?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">Sin entregas para los filtros seleccionados.</p>
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
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Unidades</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Cobro</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rows ?? []).map((r) => {
                    const st = statusLabel[r.status];
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {new Date(r.created_at).toLocaleString(APP_LOCALE, { timeZone: APP_TZ, dateStyle: "short", timeStyle: "short" })}
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate">{r.customer_name ?? "—"}</TableCell>
                        <TableCell>{r.route_name ?? "—"}</TableCell>
                        <TableCell>{r.driver_name ?? "—"}</TableCell>
                        <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.units}{r.return_units > 0 && <span className="text-xs text-muted-foreground"> (−{r.return_units})</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmtMoney(r.total)}</TableCell>
                        <TableCell className="text-xs">
                          {r.payment ? (
                            <Badge variant={r.payment.status === "paid" ? "secondary" : "destructive"}>
                              {methodLabel[r.payment.method]} · {r.payment.status === "paid" ? "Pagado" : "Pendiente"}
                            </Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => setOpenId(r.id)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <DeliveryDetailDialog id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function DeliveryDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const fn = useServerFn(getDeliveryDetailAdmin);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "delivery", id],
    queryFn: () => fn({ data: { id: id! } }),
    enabled: !!id,
  });

  return (
    <Dialog open={!!id} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Detalle de entrega</DialogTitle></DialogHeader>
        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {data && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Cliente" value={data.customer_name ?? "—"} />
              <Info label="Repartidor" value={data.driver_name ?? "—"} />
              <Info label="Ruta" value={data.route_name ?? "—"} />
              <Info label="Estado" value={statusLabel[data.status]?.label ?? data.status} />
              {data.customer_address && <Info label="Dirección" value={data.customer_address} className="col-span-2" />}
            </div>

            <Section title={`Productos vendidos (${data.items.length})`}>
              {data.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin productos.</p>
              ) : (
                <div className="border rounded-md divide-y">
                  {data.items.map((i) => (
                    <div key={i.id} className="grid grid-cols-[1fr_auto_auto] gap-3 p-2 text-sm">
                      <span className="truncate">{i.product_name ?? "—"}</span>
                      <span className="text-muted-foreground tabular-nums">{i.quantity}{i.unit ? ` ${i.unit}` : ""} × {fmtMoney(i.unit_price)}</span>
                      <span className="font-medium tabular-nums">{fmtMoney(i.line_total)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between p-2 text-sm font-semibold bg-muted/40">
                    <span>Total</span>
                    <span className="tabular-nums">{fmtMoney(data.items.reduce((a, i) => a + i.line_total, 0))}</span>
                  </div>
                </div>
              )}
            </Section>

            {data.returns.length > 0 && (
              <Section title={`Devoluciones (${data.returns.length})`}>
                <div className="border rounded-md divide-y">
                  {data.returns.map((i) => (
                    <div key={i.id} className="flex justify-between p-2 text-sm">
                      <span className="truncate">{i.product_name ?? "—"}</span>
                      <span className="text-muted-foreground tabular-nums">{i.quantity}{i.unit ? ` ${i.unit}` : ""}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {data.payment && (
              <Section title="Cobro">
                <div className="flex flex-wrap gap-2 text-sm items-center">
                  <Badge variant={data.payment.status === "paid" ? "secondary" : "destructive"}>
                    {data.payment.status === "paid" ? "Pagado" : "Pendiente"}
                  </Badge>
                  <Badge variant="outline">{methodLabel[data.payment.method]}</Badge>
                  <span className="font-medium tabular-nums">{fmtMoney(data.payment.amount)}</span>
                  <span className="text-muted-foreground text-xs">
                    {new Date(data.payment.paid_at).toLocaleString(APP_LOCALE, { timeZone: APP_TZ })}
                  </span>
                </div>
              </Section>
            )}

            {data.comment && <Section title="Comentario"><p className="text-sm whitespace-pre-wrap">{data.comment}</p></Section>}
          </div>
        )}
      </DialogContent>
    </Dialog>
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

function Info({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</div>
      {children}
    </div>
  );
}
