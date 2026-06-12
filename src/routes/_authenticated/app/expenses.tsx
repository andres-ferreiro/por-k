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
import { listExpensesAdmin } from "@/lib/api/admin.functions";
import { listRoutesForDispatch } from "@/lib/api/dispatches.functions";
import { listBranchDrivers } from "@/lib/api/routes.functions";
import { APP_LOCALE, APP_TZ, todayInTZ } from "@/lib/tz";
import { useBranchScope } from "@/lib/branch-scope";
import { useSorting } from "@/hooks/use-sorting";
import { filterBySearch } from "@/lib/table-utils";
import { downloadCSV } from "@/lib/csv";

import {
  PageHeader, TableToolbar, DataTableCard, SortableTableHead, TableStatusRow,
  FilterSelect, FilterDateRangePicker,
} from "@/components/admin/data-table";
import { StatCardSimple, StatGrid } from "@/components/admin/stat-cards";
import { fmtMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/expenses")({
  component: ExpensesPage,
});

function ExpensesPage() {
  const today = todayInTZ();
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [routeId, setRouteId] = useState("all");
  const [driverId, setDriverId] = useState("all");
  const [search, setSearch] = useState("");
  const { sortKey, sortDir, toggle, sort } = useSorting("expense_date");

  const listFn = useServerFn(listExpensesAdmin);
  const routesFn = useServerFn(listRoutesForDispatch);
  const driversFn = useServerFn(listBranchDrivers);

  const { data: routes } = useQuery({ queryKey: ["admin", "routes"], queryFn: () => routesFn() });
  const { data: drivers } = useQuery({
    queryKey: ["admin", "drivers"],
    queryFn: () => driversFn({ data: { branch_id: null } }),
  });

  const { branchId } = useBranchScope();
  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin", "expenses", dateFrom, dateTo, routeId, driverId, branchId],
    queryFn: () =>
      listFn({
        data: {
          date_from: dateFrom,
          date_to: dateTo,
          route_id: routeId === "all" ? null : routeId,
          driver_id: driverId === "all" ? null : driverId,
          branch_id: branchId,
        },
      }),
  });

  const tableRows = useMemo(() => {
    const filtered = filterBySearch(rows ?? [], search, (r) =>
      [r.driver_name, r.route_name, r.description].filter(Boolean).join(" "),
    );
    return sort(filtered, (r, key) => {
      if (key === "amount") return r.amount;
      if (key === "created_at") return new Date(r.created_at).getTime();
      return (r as Record<string, unknown>)[key];
    });
  }, [rows, search, sort]);

  const total = useMemo(() => tableRows.reduce((a, r) => a + r.amount, 0), [tableRows]);

  function exportCSV() {
    if (!tableRows.length) return;
    downloadCSV(
      `gastos_${dateFrom}_${dateTo}.csv`,
      tableRows.map((r) => ({
        fecha: r.expense_date,
        repartidor: r.driver_name ?? "",
        ruta: r.route_name ?? "",
        descripcion: r.description,
        monto: r.amount,
      })),
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Gastos" description="Gastos registrados por repartidores." />

      <TableToolbar
        search
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar gastos…"
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
          </>
        }
        actions={
          <Button variant="outline" className="h-10 text-sm" onClick={exportCSV} disabled={!tableRows.length}>
            <Icon icon={Download01Icon} className="h-3.5 w-3.5 mr-1" /> CSV
          </Button>
        }
      />

      <StatGrid className="max-w-sm">
        <StatCardSimple
          label="Total del periodo"
          value={total}
          mode="money"
          sub={`${tableRows.length} registros`}
        />
      </StatGrid>

      <DataTableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead label="Fecha" sortKey="created_at" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <SortableTableHead label="Repartidor" sortKey="driver_name" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <SortableTableHead label="Ruta" sortKey="route_name" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <SortableTableHead label="Descripción" sortKey="description" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <TableHead>Foto</TableHead>
              <SortableTableHead label="Monto" sortKey="amount" activeKey={sortKey} direction={sortDir} onSort={toggle} className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableStatusRow colSpan={6} loading={isLoading} />
            {!isLoading && tableRows.length === 0 && (
              <TableStatusRow colSpan={6} empty emptyMessage="Sin gastos para los filtros seleccionados." />
            )}
            {tableRows.map((r) => (
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
      </DataTableCard>
    </div>
  );
}
