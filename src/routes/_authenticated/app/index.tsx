import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDashboardSummary } from "@/lib/api/admin.functions";
import { todayInTZ } from "@/lib/tz";
import { useBranchScope } from "@/lib/branch-scope";
import { fmtMoney, fmtQty } from "@/lib/format";
import { FilterDatePicker, PageHeader } from "@/components/admin/data-table";
import {
  StatCardArea,
  StatCardBar,
  StatCardSimple,
  StatGrid,
} from "@/components/admin/stat-cards";


export const Route = createFileRoute("/_authenticated/app/")({
  component: Dashboard,
});

function padSeries(values: number[]) {
  if (values.length >= 2) return values;
  const v = values[0] ?? 0;
  return [Math.max(0, v * 0.85), v];
}

function Dashboard() {
  const [date, setDate] = useState(todayInTZ());
  const { branchId } = useBranchScope();
  const fn = useServerFn(getDashboardSummary);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", date, branchId],
    queryFn: () => fn({ data: { date, branch_id: branchId } }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inicio"
        description="Resumen del día."
        action={
          <FilterDatePicker
            value={date}
            onChange={(v) => setDate(v || todayInTZ())}
          />
        }
      />

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {data && (
        <>
          <StatGrid columns={4}>
            <StatCardSimple
              label="Despachos"
              value={data.dispatches.count}
              sub={`${fmtQty(data.dispatches.units)} u cargadas`}
            />
            <StatCardSimple
              label="Entregas"
              value={data.deliveries.delivered}
              displayValue={`${data.deliveries.delivered}/${data.deliveries.total}`}
              sub={`${data.deliveries.pending} pendientes · ${data.deliveries.failed} fallidas`}
            />
            <StatCardArea
              label="Ventas del día"
              value={data.deliveries.soldAmount}
              mode="money"
              series={padSeries(
                data.drivers.length
                  ? data.drivers.map((d) => d.sold)
                  : [data.deliveries.soldAmount],
              )}
              chartLabel="Ventas por repartidor"
            />
            <StatCardArea
              label="Cobrado"
              value={data.payments.collectedTotal}
              mode="money"
              series={padSeries(
                data.drivers.length
                  ? data.drivers.map((d) => d.collected)
                  : [data.payments.collectedTotal],
              )}
              chartLabel="Cobros por repartidor"
            />
          </StatGrid>

          <StatGrid columns={4}>
            <StatCardBar
              label="Cobros por método"
              value={data.payments.collectedTotal}
              mode="money"
              bars={[
                data.payments.byMethod.cash || 0,
                data.payments.byMethod.transfer || 0,
                data.payments.byMethod.credit || 0,
                data.payments.byMethod.other || 0,
              ]}
              barLabels={["Efe.", "Trans.", "Créd.", "Otro"]}
              chartLabel="Distribución de cobros por método"
            />
            <StatCardSimple
              label="Pendiente / crédito"
              value={data.payments.pendingAmount + (data.payments.byMethod.credit || 0)}
              mode="money"
              highlight={(data.payments.pendingAmount + (data.payments.byMethod.credit || 0)) > 0}
              sub="por cobrar"
              badge={
                (data.payments.pendingAmount + (data.payments.byMethod.credit || 0)) > 0
                  ? "Pendiente"
                  : undefined
              }
              badgeVariant="down"
            />
            <StatCardSimple
              label="Gastos"
              value={data.expenses.total}
              mode="money"
              sub={`${data.expenses.count} registros`}
            />
            <StatCardSimple
              label="Neto en caja"
              value={data.cashNet}
              mode="money"
              highlight={data.cashNet !== 0}
              sub="efectivo − gastos"
              badge={data.cashNet < 0 ? "↓ negativo" : data.cashNet > 0 ? "↑ positivo" : undefined}
              badgeVariant={data.cashNet < 0 ? "down" : data.cashNet > 0 ? "up" : "neutral"}
            />
          </StatGrid>

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
