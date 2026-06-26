import { Download01Icon, ViewIcon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { SelectItem } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { listDeliveriesAdmin, getDeliveryDetailAdmin } from "@/lib/api/admin.functions";
import { listRoutesForDispatch } from "@/lib/api/dispatches.functions";
import { listBranchDrivers } from "@/lib/api/routes.functions";
import { getMyContext } from "@/lib/api/context.functions";
import { APP_LOCALE, APP_TZ, todayInTZ } from "@/lib/tz";
import { useBranchScope } from "@/lib/branch-scope";
import { useSorting } from "@/hooks/use-sorting";
import { filterBySearch } from "@/lib/table-utils";
import { downloadCSV } from "@/lib/csv";

import {
  PageHeader, TableToolbar, DataTableCard, SortableTableHead, TableStatusRow,
  FilterSelect, FilterDateRangePicker,
} from "@/components/admin/data-table";
import { DeliveryStatusBadge, PaymentStatusBadge, StatusBadge, TagBadge } from "@/components/admin/status-badge";
import { StatCardBar, StatCardSimple, StatGrid } from "@/components/admin/stat-cards";
import { fmtMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/deliveries")({
  loader: async ({ context }) => {
    const ctx = await context.queryClient.fetchQuery({
      queryKey: ["myContext"],
      queryFn: () => getMyContext(),
    });
    const allowed = ctx.roles.some((r) => r === "owner" || r === "supervisor");
    if (!allowed) throw redirect({ to: "/app" });
    return ctx;
  },
  component: DeliveriesPage,
});

const statusLabel: Record<string, string> = {
  delivered: "Entregada",
  pending: "Pendiente",
  failed: "Fallida",
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
  const [search, setSearch] = useState("");
  const { sortKey, sortDir, toggle, sort } = useSorting("created_at");

  const listFn = useServerFn(listDeliveriesAdmin);
  const routesFn = useServerFn(listRoutesForDispatch);
  const driversFn = useServerFn(listBranchDrivers);

  const { data: routes } = useQuery({ queryKey: ["admin", "routes"], queryFn: () => routesFn() });
  const { data: drivers } = useQuery({
    queryKey: ["admin", "drivers"],
    queryFn: () => driversFn({ data: { branch_id: null } }),
  });

  const { branchId } = useBranchScope();
  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin", "deliveries", dateFrom, dateTo, routeId, driverId, status, branchId],
    queryFn: () =>
      listFn({
        data: {
          date_from: dateFrom,
          date_to: dateTo,
          route_id: routeId === "all" ? null : routeId,
          driver_id: driverId === "all" ? null : driverId,
          status: status === "all" ? null : (status as any),
          branch_id: branchId,
        },
      }),
  });

  const tableRows = useMemo(() => {
    const filtered = filterBySearch(rows ?? [], search, (r) =>
      [r.customer_name, r.route_name, r.driver_name, statusLabel[r.status]].filter(Boolean).join(" "),
    );
    return sort(filtered, (r, key) => {
      if (key === "total") return r.total;
      if (key === "units") return r.units;
      if (key === "created_at") return new Date(r.created_at).getTime();
      return (r as Record<string, unknown>)[key];
    });
  }, [rows, search, sort]);

  const totals = useMemo(() => {
    const all = tableRows;
    const delivered = all.filter((r) => r.status === "delivered");
    return {
      count: all.length,
      delivered: delivered.length,
      pending: all.filter((r) => r.status === "pending").length,
      failed: all.filter((r) => r.status === "failed").length,
      amount: delivered.reduce((a, r) => a + r.total, 0),
      units: delivered.reduce((a, r) => a + r.units, 0),
    };
  }, [tableRows]);

  function exportCSV() {
    if (!tableRows.length) return;
    downloadCSV(
      `entregas_${dateFrom}_${dateTo}.csv`,
      tableRows.map((r) => ({
        fecha: r.delivery_date,
        cliente: r.customer_name ?? "",
        ruta: r.route_name ?? "",
        repartidor: r.driver_name ?? "",
        estado: statusLabel[r.status] ?? r.status,
        unidades: r.units,
        devueltas: r.return_units,
        total: r.total,
        pago_metodo: r.payment ? methodLabel[r.payment.method] : "",
        pago_estado: r.payment ? (r.payment.status === "paid" ? "Pagado" : "Pendiente") : "",
      })),
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Entregas" description="Seguimiento de visitas por ruta." />

      <TableToolbar
        search
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar entregas…"
        filters={
          <>
            <FilterDateRangePicker
              from={dateFrom}
              to={dateTo}
              onFromChange={(v) => setDateFrom(v || today)}
              onToChange={(v) => setDateTo(v || today)}
            />
            <FilterSelect value={routeId} onValueChange={setRouteId} placeholder="Ruta">
              <SelectItem value="all">Todas las rutas</SelectItem>
              {(routes ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
            </FilterSelect>
            <FilterSelect value={driverId} onValueChange={setDriverId} placeholder="Repartidor">
              <SelectItem value="all">Todos</SelectItem>
              {(drivers ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.full_name ?? d.id.slice(0,8)}</SelectItem>)}
            </FilterSelect>
            <FilterSelect value={status} onValueChange={setStatus} placeholder="Estado">
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="delivered">Entregada</SelectItem>
              <SelectItem value="pending">Pendiente</SelectItem>
              <SelectItem value="failed">Fallida</SelectItem>
            </FilterSelect>
          </>
        }
        actions={
          <Button variant="outline" className="h-10 text-sm" onClick={exportCSV} disabled={!tableRows.length}>
            <Icon icon={Download01Icon} className="h-3.5 w-3.5 mr-1" /> CSV
          </Button>
        }
      />

      <StatGrid columns={3}>
        <StatCardSimple label="Visitas" value={totals.count} />
        <StatCardSimple label="Entregadas" value={totals.delivered} />
        <StatCardSimple
          label="Pendientes"
          value={totals.pending}
          highlight={totals.pending > 0}
          badge={totals.pending > 0 ? `${totals.pending} abiertas` : undefined}
          badgeVariant="neutral"
        />
        <StatCardSimple
          label="Fallidas"
          value={totals.failed}
          highlight={totals.failed > 0}
          badge={totals.failed > 0 ? "Revisar" : undefined}
          badgeVariant="down"
        />
        <StatCardBar
          label="Estado de visitas"
          value={totals.count}
          bars={[totals.delivered, totals.pending, totals.failed]}
          barLabels={["Ent.", "Pend.", "Fall."]}
          chartLabel="Entregadas, pendientes y fallidas"
        />
        <StatCardSimple label="Ventas" value={totals.amount} mode="money" />
      </StatGrid>

      <DataTableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead label="Fecha" sortKey="created_at" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <SortableTableHead label="Cliente" sortKey="customer_name" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <SortableTableHead label="Ruta" sortKey="route_name" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <SortableTableHead label="Repartidor" sortKey="driver_name" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <SortableTableHead label="Estado" sortKey="status" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <SortableTableHead label="Unidades" sortKey="units" activeKey={sortKey} direction={sortDir} onSort={toggle} className="text-right" />
              <SortableTableHead label="Total" sortKey="total" activeKey={sortKey} direction={sortDir} onSort={toggle} className="text-right" />
              <TableHead>Cobro</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableStatusRow colSpan={9} loading={isLoading} />
            {!isLoading && tableRows.length === 0 && (
              <TableStatusRow colSpan={9} empty emptyMessage="Sin entregas para los filtros seleccionados." />
            )}
            {tableRows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-xs">
                  {new Date(r.created_at).toLocaleString(APP_LOCALE, { timeZone: APP_TZ, dateStyle: "short", timeStyle: "short" })}
                </TableCell>
                <TableCell className="max-w-[180px] truncate">{r.customer_name ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <span>{r.route_name ?? "—"}</span>
                    {(r as any).route_mode === "preorder" && (
                      <TagBadge className="text-[10px] px-1">Pedido</TagBadge>
                    )}
                  </div>
                </TableCell>
                <TableCell>{r.driver_name ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <DeliveryStatusBadge status={r.status} />
                    {r.status === "failed" && r.failure_reason === "closed" && (
                      <span className="text-xs text-rose-600 font-medium">Cerrada</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.units}{r.return_units > 0 && <span className="text-xs text-muted-foreground"> (−{r.return_units})</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">{fmtMoney(r.total)}</TableCell>
                <TableCell className="text-xs">
                  {r.payment ? (
                    <span className="inline-flex flex-col gap-0.5">
                      <PaymentStatusBadge status={r.payment.status} />
                      <StatusBadge tone="neutral">{methodLabel[r.payment.method]}</StatusBadge>
                    </span>
                  ) : "—"}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => setOpenId(r.id)}>
                    <Icon icon={ViewIcon} className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableCard>

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
              <Info label="Estado" value={statusLabel[data.status] ?? data.status} />
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
                    <span>Subtotal</span>
                    <span className="tabular-nums">{fmtMoney(data.totals.grossAmount)}</span>
                  </div>
                </div>
              )}
            </Section>

            {data.returns.length > 0 && (
              <Section title={`Devoluciones (${data.returns.length})`}>
                <div className="border rounded-md divide-y">
                  {data.returns.map((i) => {
                    const unitPrice = data.items.find((it) => it.product_id === i.product_id)?.unit_price ?? 0;
                    const lineTotal = i.quantity * unitPrice;
                    return (
                    <div key={i.id} className="grid grid-cols-[1fr_auto_auto] gap-3 p-2 text-sm">
                      <span className="truncate">{i.product_name ?? "—"}</span>
                      <span className="text-muted-foreground tabular-nums">{i.quantity}{i.unit ? ` ${i.unit}` : ""} × {fmtMoney(unitPrice)}</span>
                      <span className="font-medium tabular-nums text-destructive">−{fmtMoney(lineTotal)}</span>
                    </div>
                    );
                  })}
                  <div className="flex justify-between p-2 text-sm font-semibold bg-muted/40">
                    <span>Total neto</span>
                    <span className="tabular-nums">{fmtMoney(data.totals.netAmount)}</span>
                  </div>
                </div>
              </Section>
            )}

            {data.returns.length === 0 && data.items.length > 0 && (
              <div className="flex justify-between text-sm font-semibold px-1">
                <span>Total neto</span>
                <span className="tabular-nums">{fmtMoney(data.totals.netAmount)}</span>
              </div>
            )}

            {data.payment && (
              <Section title="Cobro">
                <div className="flex flex-wrap gap-2 text-sm items-center">
                  <PaymentStatusBadge status={data.payment.status} />
                  <StatusBadge tone="neutral">{methodLabel[data.payment.method]}</StatusBadge>
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
