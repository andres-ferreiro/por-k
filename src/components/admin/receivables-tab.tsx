import { useMemo, useState } from "react";
import { Download01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getReceivables, type ReceivableRow } from "@/lib/api/accounts.functions";
import { getMyContext } from "@/lib/api/context.functions";
import { useBranchScope } from "@/lib/branch-scope";
import { useSorting } from "@/hooks/use-sorting";
import { usePagination } from "@/hooks/use-pagination";
import { filterBySearch } from "@/lib/table-utils";
import { downloadCSV } from "@/lib/csv";
import { fmtDateMedium, fmtMoney } from "@/lib/format";
import { over60, round2 } from "@/lib/account";
import {
  DataTableCard, FilterSelect, SortableTableHead, TablePagination, TableStatusRow, TableToolbar,
} from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { StatCardSimple, StatGrid } from "@/components/admin/stat-cards";
import { CustomerAccountSheet } from "@/components/admin/customer-account-sheet";

const CATEGORY_LABEL: Record<string, string> = { retail: "Tienda", hotel: "Hotel", restaurant: "Restaurante" };

function daysSince(ymd: string | null, today: string): number | null {
  if (!ymd) return null;
  const a = Date.parse(`${ymd}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export function ReceivablesTab() {
  const fetchFn = useServerFn(getReceivables);
  const ctxFn = useServerFn(getMyContext);
  const { branchId } = useBranchScope();
  const { sortKey, sortDir, toggle, sort } = useSorting()  // no default: the server already returns the biggest debts first;

  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [onlyOld, setOnlyOld] = useState(false);
  const [openFor, setOpenFor] = useState<string | null>(null);

  const { data: ctx } = useQuery({ queryKey: ["myContext"], queryFn: () => ctxFn() });
  const q = useQuery({ queryKey: ["receivables"], queryFn: () => fetchFn() });
  const canAdjust = ctx?.primaryRole === "owner" || ctx?.primaryRole === "supervisor";
  const today = q.data?.today ?? "";

  const scoped = useMemo(
    () => (q.data?.rows ?? []).filter((r) => !branchId || r.branch_id === branchId),
    [q.data, branchId],
  );

  const summary = useMemo(() => {
    const total = round2(scoped.reduce((s, r) => s + r.balance, 0));
    const old = round2(scoped.reduce((s, r) => s + over60(r.aging), 0));
    const aging = scoped.reduce(
      (a, r) => ({
        d0_30: a.d0_30 + r.aging.d0_30,
        d31_60: a.d31_60 + r.aging.d31_60,
        d61_90: a.d61_90 + r.aging.d61_90,
        d90_plus: a.d90_plus + r.aging.d90_plus,
      }),
      { d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 },
    );
    const byBranch = q.data?.abonos_month_by_branch ?? {};
    const abonosMonth = branchId
      ? (byBranch[branchId] ?? 0)
      : Object.values(byBranch).reduce((s, n) => s + n, 0);
    return { total, old, aging, abonosMonth: round2(abonosMonth), count: scoped.length };
  }, [scoped, q.data, branchId]);

  const rows = useMemo(() => {
    let list = scoped;
    if (type === "business") list = list.filter((r) => r.category !== "retail");
    if (type === "retail") list = list.filter((r) => r.category === "retail");
    if (onlyOld) list = list.filter((r) => over60(r.aging) > 0);
    list = filterBySearch(list, search, (r) => [r.name, r.phone, r.branch_name].filter(Boolean).join(" "));
    return sort(list, (r: ReceivableRow, key) => {
      if (key === "d0_30" || key === "d31_60" || key === "d61_90" || key === "d90_plus") return r.aging[key];
      if (key === "oldest") return r.oldest_sale ?? "";
      return (r as unknown as Record<string, unknown>)[key];
    });
  }, [scoped, type, onlyOld, search, sort]);

  const pagination = usePagination(rows, undefined, [search, type, onlyOld, sortKey, sortDir, branchId]);

  function exportCSV() {
    if (!rows.length) return;
    downloadCSV(
      `cuentas-por-cobrar_${today}.csv`,
      rows.map((r) => ({
        cliente: r.name,
        tipo: CATEGORY_LABEL[r.category] ?? r.category,
        sucursal: r.branch_name ?? "",
        debe: r.balance,
        "0-30": r.aging.d0_30,
        "31-60": r.aging.d31_60,
        "61-90": r.aging.d61_90,
        "+90": r.aging.d90_plus,
        venta_mas_antigua: r.oldest_sale ?? "",
        ultima_entrega: r.last_delivery_on ?? "",
        ultimo_abono: r.last_payment_on ?? "",
        telefono: r.phone ?? "",
      })),
    );
  }

  const barTotal = summary.aging.d0_30 + summary.aging.d31_60 + summary.aging.d61_90 + summary.aging.d90_plus;
  const segs = [
    { label: "0–30 días", value: summary.aging.d0_30, cls: "bg-emerald-500" },
    { label: "31–60", value: summary.aging.d31_60, cls: "bg-amber-400" },
    { label: "61–90", value: summary.aging.d61_90, cls: "bg-rose-400" },
    { label: "+90", value: summary.aging.d90_plus, cls: "bg-rose-700" },
  ];

  const colSpan = 10;

  return (
    <div className="space-y-4">
      <StatGrid columns={4}>
        <StatCardSimple label="Total por cobrar" value={summary.total} mode="money" highlight={summary.total > 0} />
        <StatCardSimple
          label="Más de 60 días"
          value={summary.old}
          mode="money"
          highlight={summary.old > 0}
          badge={summary.old > 0 ? "Atrasado" : undefined}
          badgeVariant="down"
        />
        <StatCardSimple label="Abonos del mes" value={summary.abonosMonth} mode="money" />
        <StatCardSimple label="Clientes con deuda" value={summary.count} mode="qty" />
      </StatGrid>

      {barTotal > 0 && (
        <div className="rounded-lg border p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium uppercase tracking-wide">Antigüedad (estimada)</span>
          </div>
          <div className="flex h-3 overflow-hidden rounded-full bg-muted">
            {segs.map((s) => (
              <div
                key={s.label}
                className={s.cls}
                style={{ width: `${(s.value / barTotal) * 100}%` }}
                title={`${s.label}: ${fmtMoney(s.value)}`}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {segs.map((s) => (
              <span key={s.label} className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${s.cls}`} />
                <span className="text-muted-foreground">{s.label}</span>
                <span className="font-medium tabular-nums">{fmtMoney(s.value)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <TableToolbar
        search
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar cliente…"
        filters={
          <>
            <FilterSelect value={type} onValueChange={setType} placeholder="Tipo">
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="business">Hoteles y comedores</SelectItem>
              <SelectItem value="retail">Tiendas</SelectItem>
            </FilterSelect>
            <Button
              type="button"
              variant={onlyOld ? "default" : "outline"}
              className="h-10 text-sm"
              onClick={() => setOnlyOld((v) => !v)}
            >
              Solo +60 días
            </Button>
          </>
        }
        actions={
          <Button variant="outline" className="h-10 text-sm" onClick={exportCSV} disabled={!rows.length}>
            <Icon icon={Download01Icon} className="mr-1 h-3.5 w-3.5" /> CSV
          </Button>
        }
      />

      <DataTableCard>
        <div className="border-b px-4 py-2 text-sm text-muted-foreground">{rows.length} clientes</div>
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead label="Cliente" sortKey="name" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <SortableTableHead label="Tipo" sortKey="category" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <SortableTableHead label="Debe" sortKey="balance" activeKey={sortKey} direction={sortDir} onSort={toggle} className="text-right" />
              <SortableTableHead label="0–30" sortKey="d0_30" activeKey={sortKey} direction={sortDir} onSort={toggle} className="text-right" />
              <SortableTableHead label="31–60" sortKey="d31_60" activeKey={sortKey} direction={sortDir} onSort={toggle} className="text-right" />
              <SortableTableHead label="61–90" sortKey="d61_90" activeKey={sortKey} direction={sortDir} onSort={toggle} className="text-right" />
              <SortableTableHead label="+90" sortKey="d90_plus" activeKey={sortKey} direction={sortDir} onSort={toggle} className="text-right" />
              <SortableTableHead label="Últ. entrega" sortKey="last_delivery_on" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <SortableTableHead label="Últ. abono" sortKey="last_payment_on" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableStatusRow colSpan={colSpan} loading={q.isLoading} />
            {!q.isLoading && rows.length === 0 && (
              <TableStatusRow colSpan={colSpan} empty emptyMessage="Sin cuentas por cobrar para los filtros seleccionados." />
            )}
            {pagination.paginatedItems.map((r) => {
              const lastDel = daysSince(r.last_delivery_on, today);
              const old = over60(r.aging) > 0;
              const mid = !old && r.aging.d31_60 > 0;
              return (
                <TableRow
                  key={r.customer_id}
                  className={`cursor-pointer ${old ? "bg-rose-50/60 dark:bg-rose-950/10" : mid ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}`}
                  onClick={() => setOpenFor(r.customer_id)}
                >
                  <TableCell className="max-w-[220px] truncate font-medium">{r.name}</TableCell>
                  <TableCell>
                    {r.category === "retail"
                      ? <span className="text-sm text-muted-foreground">Tienda</span>
                      : <StatusBadge tone="neutral" className="normal-case tracking-normal">{CATEGORY_LABEL[r.category] ?? r.category}</StatusBadge>}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{fmtMoney(r.balance)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{r.aging.d0_30 ? fmtMoney(r.aging.d0_30) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums text-amber-700">{r.aging.d31_60 ? fmtMoney(r.aging.d31_60) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums text-rose-600">{r.aging.d61_90 ? fmtMoney(r.aging.d61_90) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums text-rose-700">{r.aging.d90_plus ? fmtMoney(r.aging.d90_plus) : "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {r.last_delivery_on ? (
                      <>
                        {fmtDateMedium(r.last_delivery_on)}
                        {lastDel !== null && lastDel > 30 && (
                          <span className="ml-1 text-muted-foreground">({lastDel} d)</span>
                        )}
                      </>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {r.last_payment_on ? fmtDateMedium(r.last_payment_on) : <span className="text-muted-foreground">nunca</span>}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenFor(r.customer_id);
                      }}
                    >
                      Abonar
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <TablePagination {...pagination.controls} />
      </DataTableCard>

      <CustomerAccountSheet
        customerId={openFor}
        open={!!openFor}
        onOpenChange={(o) => !o && setOpenFor(null)}
        canAdjust={!!canAdjust}
      />
    </div>
  );
}
