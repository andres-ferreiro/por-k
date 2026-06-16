import {
  ArrowRight01Icon, Cancel01Icon, GripVerticalIcon, Search01Icon, Upload01Icon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export interface RouteCustomer {
  id: string;
  name: string;
  address: string | null;
  phone?: string | null;
  created_at?: string;
  import_batch_id?: string | null;
  import_position?: number | null;
}

export interface ImportBatch {
  id: string;
  label: string | null;
  created_at: string;
  customer_count: number;
}

type CustomerSort = "alpha" | "csv" | "recent";

function sortCustomerIds(
  ids: string[],
  customers: Map<string, RouteCustomer>,
  sort: CustomerSort,
): string[] {
  return [...ids].sort((a, b) => {
    const ca = customers.get(a);
    const cb = customers.get(b);
    if (sort === "alpha") return (ca?.name ?? "").localeCompare(cb?.name ?? "", "es");
    if (sort === "csv") return (ca?.import_position ?? 999999) - (cb?.import_position ?? 999999);
    const ta = ca?.created_at ? new Date(ca.created_at).getTime() : 0;
    const tb = cb?.created_at ? new Date(cb.created_at).getTime() : 0;
    return tb - ta;
  });
}

function sortCustomerList(customers: RouteCustomer[], sort: CustomerSort): RouteCustomer[] {
  return [...customers].sort((a, b) => {
    if (sort === "alpha") return a.name.localeCompare(b.name, "es");
    if (sort === "csv") return (a.import_position ?? 999999) - (b.import_position ?? 999999);
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });
}

export function RouteStopsEditor({
  customers,
  importBatches,
  stopIds,
  onStopIdsChange,
}: {
  customers: RouteCustomer[];
  importBatches: ImportBatch[];
  stopIds: string[];
  onStopIdsChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [addSort, setAddSort] = useState<CustomerSort>("alpha");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const customerMap = useMemo(() => {
    const m = new Map<string, RouteCustomer>();
    for (const c of customers) m.set(c.id, c);
    return m;
  }, [customers]);

  const batchCustomers = useMemo(() => {
    if (batchFilter === "all") return customers;
    return customers.filter((c) => c.import_batch_id === batchFilter);
  }, [customers, batchFilter]);

  const availableCustomers = useMemo(() => {
    let list = batchCustomers.filter((c) => !stopIds.includes(c.id));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        [c.name, c.phone, c.address].filter(Boolean).join(" ").toLowerCase().includes(q),
      );
    }
    return sortCustomerList(list, addSort);
  }, [batchCustomers, stopIds, search, addSort]);

  const visibleInRoute = useMemo(
    () => batchCustomers.filter((c) => stopIds.includes(c.id)),
    [batchCustomers, stopIds],
  );

  const allVisibleSelected = availableCustomers.length > 0
    && availableCustomers.every((c) => stopIds.includes(c.id));
  const someVisibleSelected = availableCustomers.some((c) => stopIds.includes(c.id));

  function addCustomers(ids: string[]) {
    const existing = new Set(stopIds);
    const toAdd = ids.filter((id) => !existing.has(id));
    if (!toAdd.length) return;
    const ordered = sortCustomerIds(toAdd, customerMap, addSort);
    onStopIdsChange([...stopIds, ...ordered]);
  }

  function removeCustomer(id: string) {
    onStopIdsChange(stopIds.filter((x) => x !== id));
  }

  function toggleCustomer(id: string, checked: boolean) {
    if (checked) addCustomers([id]);
    else removeCustomer(id);
  }

  function toggleSelectAllVisible(checked: boolean) {
    if (checked) addCustomers(availableCustomers.map((c) => c.id));
    else onStopIdsChange(stopIds.filter((id) => !availableCustomers.some((c) => c.id === id)));
  }

  function addBatchToRoute(batchId: string) {
    const ids = customers.filter((c) => c.import_batch_id === batchId).map((c) => c.id);
    addCustomers(ids);
  }

  function sortStops(sort: CustomerSort) {
    onStopIdsChange(sortCustomerIds(stopIds, customerMap, sort));
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex == null || dragIndex === targetIndex) {
      setDragIndex(null);
      setDropIndex(null);
      return;
    }
    const next = [...stopIds];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    onStopIdsChange(next);
    setDragIndex(null);
    setDropIndex(null);
  }

  return (
    <div className="space-y-4">
      {importBatches.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Icon icon={Upload01Icon} className="h-4 w-4" />
              Importaciones recientes
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {importBatches.map((batch) => {
              const inRoute = customers.filter(
                (c) => c.import_batch_id === batch.id && stopIds.includes(c.id),
              ).length;
              const pending = batch.customer_count - inRoute;
              return (
                <div
                  key={batch.id}
                  className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate max-w-[200px]">
                      {batch.label ?? "Importación CSV"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {batch.customer_count} clientes · {formatDistanceToNow(new Date(batch.created_at), { addSuffix: true, locale: es })}
                      {inRoute > 0 && ` · ${inRoute} en ruta`}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending <= 0}
                    onClick={() => {
                      setBatchFilter(batch.id);
                      setAddSort("csv");
                      addBatchToRoute(batch.id);
                    }}
                  >
                    Agregar todos ({pending})
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Orden de visitas ({stopIds.length})</CardTitle>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => sortStops("alpha")}>
                  A-Z
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => sortStops("csv")}>
                  Orden CSV
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Arrastra para reordenar las paradas.</p>
          </CardHeader>
          <CardContent className="flex-1 space-y-1.5 min-h-[320px]">
            {stopIds.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Agrega clientes desde el panel derecho o una importación CSV.
              </p>
            )}
            {stopIds.map((id, i) => {
              const c = customerMap.get(id);
              const isDragging = dragIndex === i;
              const isDropTarget = dropIndex === i && dragIndex !== i;
              return (
                <div
                  key={id}
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragEnd={() => { setDragIndex(null); setDropIndex(null); }}
                  onDragOver={(e) => { e.preventDefault(); setDropIndex(i); }}
                  onDrop={(e) => { e.preventDefault(); handleDrop(i); }}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border bg-background p-2 transition-shadow",
                    isDragging && "opacity-50",
                    isDropTarget && "border-primary ring-1 ring-primary/30",
                  )}
                >
                  <button
                    type="button"
                    className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
                    aria-label="Arrastrar"
                  >
                    <Icon icon={GripVerticalIcon} className="h-4 w-4" />
                  </button>
                  <div className="w-6 shrink-0 text-center text-xs font-medium text-muted-foreground">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-sm">{c?.name ?? id.slice(0, 8)}</div>
                    {c?.address && (
                      <div className="text-xs text-muted-foreground truncate">{c.address}</div>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeCustomer(id)}>
                    <Icon icon={Cancel01Icon} className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="pb-3 space-y-3">
            <CardTitle className="text-base">Clientes disponibles</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[140px]">
                <Icon icon={Search01Icon} className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="h-8 pl-8 text-sm"
                  placeholder="Buscar…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={batchFilter} onValueChange={setBatchFilter}>
                <SelectTrigger className="h-8 w-[150px] text-xs">
                  <SelectValue placeholder="Importación" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {importBatches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.label ?? "CSV"} ({b.customer_count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={addSort} onValueChange={(v) => setAddSort(v as CustomerSort)}>
                <SelectTrigger className="h-8 w-[130px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alpha">Alfabético</SelectItem>
                  <SelectItem value="csv">Orden CSV</SelectItem>
                  <SelectItem value="recent">Más recientes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                  onCheckedChange={(v) => toggleSelectAllVisible(!!v)}
                />
                <span>Seleccionar todos ({availableCustomers.length})</span>
              </label>
              {visibleInRoute.length > 0 && batchFilter !== "all" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => onStopIdsChange(stopIds.filter((id) => !visibleInRoute.some((c) => c.id === id)))}
                >
                  Quitar filtro ({visibleInRoute.length})
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 min-h-[320px] max-h-[480px] overflow-y-auto space-y-0.5">
            {availableCustomers.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">
                {search || batchFilter !== "all"
                  ? "No hay clientes que coincidan con el filtro."
                  : "Todos los clientes ya están en la ruta."}
              </p>
            )}
            {availableCustomers.map((c) => (
              <div
                key={c.id}
                className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60"
              >
                <Checkbox
                  checked={stopIds.includes(c.id)}
                  onCheckedChange={(v) => toggleCustomer(c.id, !!v)}
                />
                <button
                  type="button"
                  className="flex-1 min-w-0 text-left"
                  onClick={() => addCustomers([c.id])}
                >
                  <div className="font-medium truncate text-sm">{c.name}</div>
                  {c.address && (
                    <div className="text-xs text-muted-foreground truncate">{c.address}</div>
                  )}
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100"
                  onClick={() => addCustomers([c.id])}
                  aria-label={`Agregar ${c.name}`}
                >
                  <Icon icon={ArrowRight01Icon} className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
