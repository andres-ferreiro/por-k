import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getDashboardSummary } from "@/lib/api/admin.functions";
import { todayInTZ } from "@/lib/tz";
import { Truck, PackageCheck, Wallet, Receipt, AlertCircle, Banknote } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/")({
  component: Dashboard,
});

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(n || 0);
const fmtNum = (n: number) =>
  Number.isInteger(n) ? n.toString() : n.toFixed(2).replace(/\.?0+$/, "");

function Dashboard() {
  const [date, setDate] = useState(todayInTZ());
  const fn = useServerFn(getDashboardSummary);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", date],
    queryFn: () => fn({ data: { date } }),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inicio</h1>
          <p className="text-muted-foreground">Resumen del día.</p>
        </div>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value || todayInTZ())}
          className="w-44"
        />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KPI
              icon={<Truck className="h-4 w-4" />}
              title="Despachos"
              value={String(data.dispatches.count)}
              hint={`${fmtNum(data.dispatches.units)} u cargadas`}
            />
            <KPI
              icon={<PackageCheck className="h-4 w-4" />}
              title="Entregas"
              value={`${data.deliveries.delivered}/${data.deliveries.total}`}
              hint={`${data.deliveries.pending} pendientes · ${data.deliveries.failed} fallidas`}
            />
            <KPI
              icon={<Wallet className="h-4 w-4" />}
              title="Ventas del día"
              value={fmtMoney(data.deliveries.soldAmount)}
              hint={`${fmtNum(data.deliveries.soldUnits)} u vendidas`}
            />
            <KPI
              icon={<Banknote className="h-4 w-4" />}
              title="Cobrado"
              value={fmtMoney(data.payments.collectedTotal)}
              hint={`${data.payments.count} cobros`}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KPI
              title="Efectivo"
              value={fmtMoney(data.payments.byMethod.cash || 0)}
              hint="cobrado en efectivo"
            />
            <KPI
              title="Transferencia"
              value={fmtMoney(data.payments.byMethod.transfer || 0)}
              hint="cobrado por transferencia"
            />
            <KPI
              icon={<AlertCircle className="h-4 w-4" />}
              title="Pendiente / crédito"
              value={fmtMoney(data.payments.pendingAmount + (data.payments.byMethod.credit || 0))}
              hint="por cobrar"
            />
            <KPI
              icon={<Receipt className="h-4 w-4" />}
              title="Gastos"
              value={fmtMoney(data.expenses.total)}
              hint={`${data.expenses.count} registros`}
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Neto en caja (efectivo − gastos)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`text-3xl font-semibold tabular-nums ${
                  data.cashNet < 0 ? "text-destructive" : ""
                }`}
              >
                {fmtMoney(data.cashNet)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Repartidores activos hoy</CardTitle>
            </CardHeader>
            <CardContent>
              {data.drivers.length === 0 && (
                <p className="text-sm text-muted-foreground">Sin actividad hoy.</p>
              )}
              <div className="space-y-2">
                {data.drivers.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                    <div className="font-medium truncate">{d.name ?? d.id.slice(0, 8)}</div>
                    <div className="flex gap-2 flex-wrap text-xs">
                      <Badge variant="secondary">Vendido {fmtMoney(d.sold)}</Badge>
                      <Badge variant="secondary">Cobrado {fmtMoney(d.collected)}</Badge>
                      <Badge variant={d.pending > 0 ? "destructive" : "outline"}>
                        Pendiente {fmtMoney(d.pending)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-3 text-sm">
                <Link to="/app/deliveries" className="text-primary hover:underline">Ver entregas →</Link>
                <Link to="/app/payments" className="text-primary hover:underline">Ver pagos →</Link>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function KPI({
  icon, title, value, hint,
}: { icon?: React.ReactNode; title: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}
