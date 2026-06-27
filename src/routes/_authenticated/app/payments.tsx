import { Download01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { SelectItem } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { listPaymentsAdmin } from "@/lib/api/admin.functions";
import { listRoutesForDispatch } from "@/lib/api/dispatches.functions";
import { listBranchDrivers } from "@/lib/api/routes.functions";
import { APP_LOCALE, APP_TZ, todayInTZ } from "@/lib/tz";
import { useBranchScope } from "@/lib/branch-scope";
import { useSorting } from "@/hooks/use-sorting";
import { usePagination } from "@/hooks/use-pagination";
import { filterBySearch } from "@/lib/table-utils";
import { downloadCSV } from "@/lib/csv";

import {
  PageHeader, TableToolbar, DataTableCard, SortableTableHead, TableStatusRow,
  FilterSelect, FilterDateRangePicker, TablePagination,
} from "@/components/admin/data-table";
import { PaymentStatusBadge, StatusBadge } from "@/components/admin/status-badge";
import { StatCardBar, StatCardSimple, StatGrid } from "@/components/admin/stat-cards";
import { fmtMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/payments")({
  component: PaymentsPage,
});

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
  const [search, setSearch] = useState("");
  const { sortKey, sortDir, toggle, sort } = useSorting("paid_at");

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

  const tableRows = useMemo(() => {
    const filtered = filterBySearch(rows ?? [], search, (r) =>
      [r.customer_name, r.route_name, r.driver_name, methodLabel[r.method], r.note]
        .filter(Boolean).join(" "),
    );
    return sort(filtered, (r, key) => {
      if (key === "amount") return r.amount;
      if (key === "paid_at") return new Date(r.paid_at).getTime();
      return (r as Record<string, unknown>)[key];
    });
  }, [rows, search, sort]);

  const pagination = usePagination(tableRows, undefined, [search, sortKey, sortDir, dateFrom, dateTo, routeId, driverId, method, status, origin]);

  const totals = useMemo(() => {
    const paid = tableRows.filter((p) => p.status === "paid");
    const byMethod: Record<string, number> = { cash: 0, transfer: 0, credit: 0, other: 0 };
    for (const p of paid) byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;
    return {
      total: paid.reduce((a, p) => a + p.amount, 0),
      pending: tableRows.filter((p) => p.status === "pending").reduce((a, p) => a + p.amount, 0),
      byMethod,
      count: tableRows.length,
    };
  }, [tableRows]);

  function exportCSV() {
    if (!tableRows.length) return;
    downloadCSV(
      `pagos_${dateFrom}_${dateTo}.csv`,
      tableRows.map((r) => ({
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
    <div className="space-y-4">
      <PageHeader title="Pagos" description="Cobros del día y pendientes." />

      <TableToolbar
        search
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar pagos…"
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
            <FilterSelect value={method} onValueChange={setMethod} placeholder="Método">
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="cash">Efectivo</SelectItem>
              <SelectItem value="transfer">Transferencia</SelectItem>
              <SelectItem value="credit">Crédito</SelectItem>
              <SelectItem value="other">Otro</SelectItem>
            </FilterSelect>
            <FilterSelect value={status} onValueChange={setStatus} placeholder="Estado">
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="paid">Pagado</SelectItem>
              <SelectItem value="pending">Pendiente</SelectItem>
            </FilterSelect>
            <FilterSelect value={origin} onValueChange={setOrigin} placeholder="Origen">
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="delivery">Venta entrega</SelectItem>
              <SelectItem value="manual">Abono manual</SelectItem>
            </FilterSelect>
          </>
        }
        actions={
          <Button variant="outline" className="h-10 text-sm" onClick={exportCSV} disabled={!tableRows.length}>
            <Icon icon={Download01Icon} className="h-3.5 w-3.5 mr-1" /> CSV
          </Button>
        }
      />

      <StatGrid columns={4}>
        <StatCardSimple label="Total cobrado" value={totals.total} mode="money" />
        <StatCardBar
          label="Por método"
          value={totals.total}
          mode="money"
          bars={[
            totals.byMethod.cash,
            totals.byMethod.transfer,
            totals.byMethod.credit,
            totals.byMethod.other,
          ]}
          barLabels={["Efe.", "Trans.", "Créd.", "Otro"]}
          chartLabel="Cobros por método de pago"
        />
        <StatCardSimple
          label="Efectivo"
          value={totals.byMethod.cash}
          mode="money"
          sub="cobrado en efectivo"
        />
        <StatCardSimple
          label="Pendiente"
          value={totals.pending}
          mode="money"
          highlight={totals.pending > 0}
          badge={totals.pending > 0 ? "Por cobrar" : undefined}
          badgeVariant="down"
        />
      </StatGrid>

      <DataTableCard>
        <div className="px-4 py-2 border-b text-sm text-muted-foreground">{totals.count} pagos</div>
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead label="Fecha" sortKey="paid_at" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <SortableTableHead label="Cliente" sortKey="customer_name" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <SortableTableHead label="Ruta" sortKey="route_name" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <SortableTableHead label="Repartidor" sortKey="driver_name" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <SortableTableHead label="Método" sortKey="method" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <SortableTableHead label="Estado" sortKey="status" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <TableHead>Origen</TableHead>
              <SortableTableHead label="Monto" sortKey="amount" activeKey={sortKey} direction={sortDir} onSort={toggle} className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableStatusRow colSpan={8} loading={isLoading} />
            {!isLoading && tableRows.length === 0 && (
              <TableStatusRow colSpan={8} empty emptyMessage="Sin pagos para los filtros seleccionados." />
            )}
            {pagination.paginatedItems.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-xs">
                  {new Date(r.paid_at).toLocaleString(APP_LOCALE, { timeZone: APP_TZ, dateStyle: "short", timeStyle: "short" })}
                </TableCell>
                <TableCell className="max-w-[200px] truncate">{r.customer_name ?? "—"}</TableCell>
                <TableCell>{r.route_name ?? "—"}</TableCell>
                <TableCell>{r.driver_name ?? "—"}</TableCell>
                <TableCell>{methodLabel[r.method] ?? r.method}</TableCell>
                <TableCell><PaymentStatusBadge status={r.status} /></TableCell>
                <TableCell>
                  <StatusBadge tone={r.from_delivery ? "info" : "neutral"}>
                    {r.from_delivery ? "Venta entrega" : "Abono manual"}
                  </StatusBadge>
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">{fmtMoney(r.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination {...pagination.controls} />
      </DataTableCard>
    </div>
  );
}
