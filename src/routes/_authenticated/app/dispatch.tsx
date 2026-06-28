import {
  Add01Icon,
  ArrowDown01Icon,
  Delete02Icon,
  SentIcon,
  Settings02Icon,
  TruckDeliveryIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  listRoutesForDispatch,
  listProductsActive,
  createDispatch,
  listDispatchesToday,
  getDispatch,
  getTruckReconciliation,
  getTruckReturnForRouteDay,
  registerTruckReturnForRouteDay,
  createCrossBranchLoad,
  listCrossBranchLoadsToday,
  listExternalDrivers,
} from "@/lib/api/dispatches.functions";
import { listBranchDrivers } from "@/lib/api/routes.functions";
import { getBranchDispatchGate, setBranchRequireDispatch, getBranchLocationGate, setBranchLocationEnabled } from "@/lib/api/branches.functions";
import { getMyContext } from "@/lib/api/context.functions";
import { APP_LOCALE, APP_TZ, todayInTZ } from "@/lib/tz";
import { useBranchScope } from "@/lib/branch-scope";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { toast } from "sonner";
import { fmtQty } from "@/lib/format";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { StatCardSimple, StatGrid } from "@/components/admin/stat-cards";
import { FilterDatePicker, PageHeader } from "@/components/admin/data-table";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/dispatch")({
  component: DispatchPage,
});

interface ItemRow {
  product_id: string;
  quantity: string;
}

interface ReturnRow {
  product_id: string;
  product_name: string | null;
  unit: string | null;
  dispatched: number;
  quantity: string;
}

interface RouteGroup {
  key: string;
  route_id: string;
  driver_id: string;
  route_name: string | null;
  driver_name: string | null;
  dispatch_count: number;
  total_units: number;
}

interface DispatchSummaryItem {
  id: string;
  dispatched_at: string;
  line_count: number;
  total_units: number;
}

interface RouteGroupWithDispatches extends RouteGroup {
  total_lines: number;
  dispatches: DispatchSummaryItem[];
}

function buildRouteGroups(
  dispatches: {
    route_id: string;
    driver_id: string;
    route_name: string | null;
    driver_name: string | null;
    total_units: number;
  }[],
): RouteGroup[] {
  const map = new Map<string, RouteGroup>();
  for (const d of dispatches) {
    const key = `${d.route_id}::${d.driver_id}`;
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        route_id: d.route_id,
        driver_id: d.driver_id,
        route_name: d.route_name,
        driver_name: d.driver_name,
        dispatch_count: 0,
        total_units: 0,
      };
      map.set(key, group);
    }
    group.dispatch_count += 1;
    group.total_units += d.total_units;
    if (!group.route_name && d.route_name) group.route_name = d.route_name;
    if (!group.driver_name && d.driver_name) group.driver_name = d.driver_name;
  }
  return Array.from(map.values()).sort((a, b) =>
    (a.route_name ?? "").localeCompare(b.route_name ?? ""),
  );
}

function buildRouteGroupsWithDispatches(
  dispatches: {
    id: string;
    dispatched_at: string;
    route_id: string;
    driver_id: string;
    route_name: string | null;
    driver_name: string | null;
    line_count: number;
    total_units: number;
  }[],
): RouteGroupWithDispatches[] {
  const map = new Map<string, RouteGroupWithDispatches>();
  for (const d of dispatches) {
    const key = `${d.route_id}::${d.driver_id}`;
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        route_id: d.route_id,
        driver_id: d.driver_id,
        route_name: d.route_name,
        driver_name: d.driver_name,
        dispatch_count: 0,
        total_units: 0,
        total_lines: 0,
        dispatches: [],
      };
      map.set(key, group);
    }
    group.dispatch_count += 1;
    group.total_units += d.total_units;
    group.total_lines += d.line_count;
    if (!group.route_name && d.route_name) group.route_name = d.route_name;
    if (!group.driver_name && d.driver_name) group.driver_name = d.driver_name;
    group.dispatches.push({
      id: d.id,
      dispatched_at: d.dispatched_at,
      line_count: d.line_count,
      total_units: d.total_units,
    });
  }
  for (const group of map.values()) {
    group.dispatches.sort((a, b) => b.dispatched_at.localeCompare(a.dispatched_at));
  }
  return Array.from(map.values()).sort((a, b) =>
    (a.route_name ?? "").localeCompare(b.route_name ?? ""),
  );
}

function formatDispatchTimeRange(first: string | null, last: string | null) {
  if (!first || !last) return "";
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString(APP_LOCALE, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: APP_TZ,
    });
  const start = fmt(first);
  const end = fmt(last);
  return start === end ? start : `${start} – ${end}`;
}

function routeGroupLabel(group: RouteGroup) {
  return `${group.route_name ?? "Ruta"} · ${group.driver_name ?? "—"}`;
}

function todayStr() {
  return todayInTZ();
}

function DispatchPage() {
  const ctxFn = useServerFn(getMyContext);
  const { data: ctx } = useQuery({ queryKey: ["myContext"], queryFn: () => ctxFn() });
  const [date, setDate] = useState<string>(todayStr());

  const role = ctx?.primaryRole;
  const canAccess = role === "cashier" || role === "supervisor" || role === "owner";

  if (ctx && !canAccess) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Despacho</h1>
        <p className="text-muted-foreground">No tienes acceso a esta sección.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6 xl:pb-0 xl:-m-6 xl:flex xl:flex-col xl:gap-3 xl:p-4 xl:h-[calc(100svh-3.5rem)] xl:overflow-hidden">
      <div className="hidden xl:flex shrink-0 items-center gap-3 min-w-0">
        <DispatchDayStats date={date} compact className="flex-1 min-w-0" />
        <div className="flex items-center gap-2 shrink-0">
          {(role === "owner" || role === "supervisor") && (
            <BranchSettingsPopover role={role} />
          )}
          <FilterDatePicker
            value={date}
            onChange={(v) => setDate(v || todayStr())}
          />
        </div>
      </div>

      <div className="shrink-0 space-y-4 xl:hidden">
        <PageHeader
          title="Despacho"
          description="Carga, regreso y reconciliación del camión."
          action={
            <FilterDatePicker
              value={date}
              onChange={(v) => setDate(v || todayStr())}
            />
          }
        />

        {(role === "owner" || role === "supervisor") && (
          <BranchSettingsCollapsible role={role} />
        )}

        <DispatchDayStats date={date} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5 xl:flex-1 xl:min-h-0 xl:gap-3">
        <div className="xl:col-span-2 xl:min-h-0 xl:flex xl:flex-col">
          <DispatchFormsCard className="xl:flex-1 xl:min-h-0" />
        </div>
        <div className="xl:col-span-3 xl:min-h-0 xl:flex xl:flex-col xl:gap-3">
          <DailySummaryCard date={date} className="xl:max-h-[160px] xl:shrink-0" />
          <Card className="xl:flex-1 xl:min-h-0 xl:flex xl:flex-col">
            <CardContent className="pt-3 xl:flex-1 xl:min-h-0 xl:flex xl:flex-col">
              <Tabs defaultValue="return" className="w-full xl:flex xl:flex-1 xl:flex-col xl:min-h-0">
                <TabsList className="grid w-full grid-cols-2 shrink-0 h-9">
                  <TabsTrigger value="return">Regreso</TabsTrigger>
                  <TabsTrigger value="reconciliation">Reconciliación</TabsTrigger>
                </TabsList>
                <TabsContent value="return" className="mt-2 xl:flex-1 xl:min-h-0 xl:overflow-y-auto">
                  <RouteReturnCard date={date} />
                </TabsContent>
                <TabsContent value="reconciliation" className="mt-2 xl:flex-1 xl:min-h-0 xl:overflow-y-auto">
                  <ReconciliationCard date={date} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DispatchDayStats({
  date,
  compact,
  className,
}: {
  date: string;
  compact?: boolean;
  className?: string;
}) {
  const { branchId } = useBranchScope();
  const listFn = useServerFn(listDispatchesToday);
  const recFn = useServerFn(getTruckReconciliation);

  const { data: list } = useQuery({
    queryKey: ["dispatches", "today", date, branchId],
    queryFn: () => listFn({ data: { date, branch_id: branchId } }),
  });

  const { data: reconciliation } = useQuery({
    queryKey: ["truck-reconciliation", date, branchId],
    queryFn: () => recFn({ data: { date, branch_id: branchId } }),
  });

  const dispatchStats = useMemo(() => {
    const rows = list ?? [];
    return { count: rows.length };
  }, [list]);

  const truckStats = useMemo(() => {
    return (reconciliation ?? []).reduce(
      (acc, g) => ({
        dispatched: acc.dispatched + g.totals.dispatched,
        sold: acc.sold + g.totals.sold,
        customer_returns: acc.customer_returns + g.totals.customer_returns,
        actual_returned: acc.actual_returned + g.totals.actual_returned,
        on_truck: acc.on_truck + g.totals.on_truck,
        difference: acc.difference + g.totals.difference,
      }),
      { dispatched: 0, sold: 0, customer_returns: 0, actual_returned: 0, on_truck: 0, difference: 0 },
    );
  }, [reconciliation]);

  const hasReconciliation = (reconciliation?.length ?? 0) > 0;

  if (compact) {
    const items = [
      { label: "Despachos", value: String(dispatchStats.count) },
      {
        label: "Cargado",
        value: hasReconciliation ? fmtQty(truckStats.dispatched) : "—",
      },
      {
        label: "Vendido",
        value: hasReconciliation ? fmtQty(truckStats.sold) : "—",
      },
      {
        label: "Regreso",
        value: hasReconciliation ? fmtQty(truckStats.actual_returned) : "—",
        warn: hasReconciliation && truckStats.difference !== 0,
        hint:
          hasReconciliation && truckStats.difference !== 0
            ? `${fmtQty(Math.abs(truckStats.difference))} vs calc.`
            : undefined,
      },
    ];

    return (
      <div
        className={cn(
          "flex items-stretch divide-x rounded-lg border bg-card overflow-hidden",
          className,
        )}
      >
        {items.map((item) => (
          <div key={item.label} className="flex-1 min-w-0 px-5 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground truncate">
              {item.label}
            </div>
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span
                className={cn(
                  "text-lg font-semibold tabular-nums truncate",
                  item.warn && "text-destructive",
                )}
              >
                {item.value}
              </span>
              {item.hint && (
                <span className="text-xs text-destructive tabular-nums truncate">{item.hint}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <StatGrid columns={4}>
      <StatCardSimple label="Despachos" value={dispatchStats.count} />
      <StatCardSimple
        label="Cargado"
        value={hasReconciliation ? truckStats.dispatched : 0}
        sub={hasReconciliation ? undefined : "Sin movimientos"}
      />
      <StatCardSimple label="Vendido" value={hasReconciliation ? truckStats.sold : 0} />
      <StatCardSimple
        label="Regreso"
        value={hasReconciliation ? truckStats.actual_returned : 0}
        highlight={hasReconciliation && truckStats.difference !== 0}
        sub={
          !hasReconciliation
            ? undefined
            : truckStats.difference !== 0
              ? `${fmtQty(Math.abs(truckStats.difference))} vs calculado`
              : "Cuadra con calculado"
        }
        badge={
          hasReconciliation && truckStats.difference !== 0
            ? truckStats.difference > 0
              ? `↑ +${fmtQty(truckStats.difference)}`
              : `↓ ${fmtQty(truckStats.difference)}`
            : undefined
        }
        badgeVariant={
          truckStats.difference > 0 ? "up" : truckStats.difference < 0 ? "down" : "neutral"
        }
      />
    </StatGrid>
  );
}

function DispatchGateSettings({ role }: { role: string | undefined }) {
  const qc = useQueryClient();
  const { branchId } = useBranchScope();
  const getFn = useServerFn(getBranchDispatchGate);
  const setFn = useServerFn(setBranchRequireDispatch);

  const canLoad = role === "supervisor" || (role === "owner" && !!branchId);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["branch-dispatch-gate", branchId],
    queryFn: () => getFn({ data: { branch_id: branchId } }),
    enabled: canLoad,
  });

  const mut = useMutation({
    mutationFn: (require_dispatch_before_route: boolean) =>
      setFn({ data: { branch_id: branchId, require_dispatch_before_route } }),
    onSuccess: (result) => {
      qc.setQueryData(["branch-dispatch-gate", branchId], result);
      qc.invalidateQueries({ queryKey: ["driver", "myRouteToday"] });
      toast.success(
        result.require_dispatch_before_route
          ? "Los repartidores necesitarán despacho para iniciar."
          : "Los repartidores pueden iniciar sin despacho.",
      );
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo guardar."),
  });

  if (role === "owner" && !branchId) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
        Selecciona una sucursal en el menú superior para configurar el bloqueo de repartidores.
      </div>
    );
  }

  if (!canLoad) return null;

  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-0.5 min-w-0">
        <div className="font-medium text-sm">Bloquear repartidor sin despacho</div>
        <p className="text-xs text-muted-foreground max-w-xl">
          {isLoading
            ? "Cargando configuración…"
            : data?.require_dispatch_before_route
              ? `Activo en ${data.branch_name}: el panel del repartidor se habilita al registrar el despacho del día.`
              : `Desactivado en ${data.branch_name}: los repartidores pueden trabajar antes del despacho (útil si llegan muy temprano).`}
        </p>
        {isError && (
          <p className="text-xs text-destructive">{(error as Error)?.message ?? "Error al cargar."}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Switch
          id="require-dispatch-gate"
          checked={data?.require_dispatch_before_route ?? true}
          disabled={isLoading || mut.isPending || isError}
          onCheckedChange={(v) => mut.mutate(v)}
        />
        <Label htmlFor="require-dispatch-gate" className="text-sm font-normal cursor-pointer">
          {data?.require_dispatch_before_route ?? true ? "Activado" : "Desactivado"}
        </Label>
      </div>
    </div>
  );
}

function LocationGateSettings({ role }: { role: string | undefined }) {
  const qc = useQueryClient();
  const { branchId } = useBranchScope();
  const getFn = useServerFn(getBranchLocationGate);
  const setFn = useServerFn(setBranchLocationEnabled);

  const canLoad = role === "supervisor" || (role === "owner" && !!branchId);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["branch-location-gate", branchId],
    queryFn: () => getFn({ data: { branch_id: branchId } }),
    enabled: canLoad,
  });

  const mut = useMutation({
    mutationFn: (driver_location_enabled: boolean) =>
      setFn({ data: { branch_id: branchId, driver_location_enabled } }),
    onSuccess: (result) => {
      qc.setQueryData(["branch-location-gate", branchId], result);
      qc.invalidateQueries({ queryKey: ["driver", "myRouteToday"] });
      qc.invalidateQueries({ queryKey: ["admin", "live"] });
      toast.success(
        result.driver_location_enabled
          ? "Los repartidores pueden registrar ubicación de clientes."
          : "Registro de ubicación desactivado para repartidores.",
      );
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo guardar."),
  });

  if (role === "owner" && !branchId) return null;
  if (!canLoad) return null;

  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-0.5 min-w-0">
        <div className="font-medium text-sm">Ubicación GPS al vender</div>
        <p className="text-xs text-muted-foreground max-w-xl">
          {isLoading
            ? "Cargando configuración…"
            : data?.driver_location_enabled
              ? `Activo en ${data.branch_name}: al vender se guarda la ubicación GPS del repartidor en el cliente.`
              : `Desactivado en ${data?.branch_name}: el mapa muestra ubicaciones guardadas; no se actualizan al vender.`}
        </p>
        {isError && (
          <p className="text-xs text-destructive">{(error as Error)?.message ?? "Error al cargar."}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Switch
          id="location-gate"
          checked={data?.driver_location_enabled ?? false}
          disabled={isLoading || mut.isPending || isError}
          onCheckedChange={(v) => mut.mutate(v)}
        />
        <Label htmlFor="location-gate" className="text-sm font-normal cursor-pointer">
          {data?.driver_location_enabled ? "Activado" : "Desactivado"}
        </Label>
      </div>
    </div>
  );
}


function BranchSettingsPanel({ role }: { role: string | undefined }) {
  return (
    <div className="space-y-2">
      <DispatchGateSettings role={role} />
      <LocationGateSettings role={role} />
    </div>
  );
}

function BranchSettingsPopover({ role }: { role: string | undefined }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" aria-label="Configuración de sucursal">
          <Icon icon={Settings02Icon} className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(24rem,calc(100vw-2rem))] p-3" align="end">
        <p className="text-sm font-medium mb-2">Configuración de sucursal</p>
        <BranchSettingsPanel role={role} />
      </PopoverContent>
    </Popover>
  );
}

function BranchSettingsCollapsible({ role }: { role: string | undefined }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-lg border bg-muted/30 px-4 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          Configuración de sucursal
          <Icon
            icon={ArrowDown01Icon}
            className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pt-2">
        <BranchSettingsPanel role={role} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function DispatchFormsCard({ className }: { className?: string }) {
  return (
    <Card className={cn("relative overflow-visible xl:overflow-hidden xl:flex xl:flex-col xl:min-h-0", className)}>
      <CardHeader className="py-3 pb-0 shrink-0 xl:py-2">
        <div className="flex items-center gap-2">
          <Icon icon={TruckDeliveryIcon} className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Registrar carga</CardTitle>
        </div>
        <CardDescription className="text-xs xl:hidden">
          Despacho de ruta o entrega a repartidor de otra sucursal.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-3 xl:flex-1 xl:min-h-0 xl:flex xl:flex-col xl:overflow-hidden">
        <Tabs defaultValue="route" className="xl:flex xl:flex-1 xl:flex-col xl:min-h-0">
          <TabsList className="grid w-full grid-cols-2 shrink-0">
            <TabsTrigger value="route">Despacho de ruta</TabsTrigger>
            <TabsTrigger value="external">Carga externa</TabsTrigger>
          </TabsList>
          <TabsContent value="route" className="mt-3 xl:flex-1 xl:min-h-0 xl:overflow-y-auto">
            <NewDispatchForm />
          </TabsContent>
          <TabsContent value="external" className="mt-3 xl:flex-1 xl:min-h-0 xl:overflow-y-auto">
            <CrossBranchLoadForm />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

type ExternalDriverOption = {
  id: string;
  full_name: string | null;
  branch_id: string;
  branch_name: string | null;
};

function ExternalDriverCombobox({
  value,
  onChange,
  drivers,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  drivers: ExternalDriverOption[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = drivers.find((d) => d.id === value);

  const grouped = useMemo(() => {
    const map = new Map<string, ExternalDriverOption[]>();
    for (const d of drivers) {
      const key = d.branch_name ?? "Sin sucursal";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, "es"));
  }, [drivers]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal h-10 px-3"
        >
          {selected ? (
            <span className="truncate text-left">
              <span className="font-medium">{selected.full_name ?? "Sin nombre"}</span>
              <span className="text-muted-foreground"> · {selected.branch_name ?? "—"}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Selecciona repartidor externo</span>
          )}
          <Icon icon={ArrowDown01Icon} className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar por nombre o sucursal…" />
          <CommandList>
            <CommandEmpty>No hay repartidores de otras sucursales.</CommandEmpty>
            {grouped.map(([branchName, branchDrivers]) => (
              <CommandGroup key={branchName} heading={branchName}>
                {branchDrivers.map((d) => (
                  <CommandItem
                    key={d.id}
                    value={`${d.full_name ?? ""} ${branchName}`}
                    onSelect={() => {
                      onChange(d.id);
                      setOpen(false);
                    }}
                  >
                    <span className="truncate">{d.full_name ?? d.id.slice(0, 8)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function NewDispatchForm() {
  const qc = useQueryClient();
  const { branchId } = useBranchScope();
  const routesFn = useServerFn(listRoutesForDispatch);
  const productsFn = useServerFn(listProductsActive);
  const driversFn = useServerFn(listBranchDrivers);
  const createFn = useServerFn(createDispatch);

  const { data: routes } = useQuery({
    queryKey: ["dispatch", "routes", branchId],
    queryFn: () => routesFn({ data: { branch_id: branchId } }),
  });
  const { data: products } = useQuery({ queryKey: ["dispatch", "products"], queryFn: () => productsFn() });

  const [routeId, setRouteId] = useState<string>("");
  const [driverId, setDriverId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [showAllProducts, setShowAllProducts] = useState(true);
  const [qtyByProduct, setQtyByProduct] = useState<Record<string, string>>({});
  const [items, setItems] = useState<ItemRow[]>([{ product_id: "", quantity: "" }]);

  const selectedRoute = useMemo(
    () => routes?.find((r) => r.id === routeId),
    [routes, routeId],
  );
  const effectiveBranchId = branchId ?? selectedRoute?.branch_id ?? null;

  const { data: drivers } = useQuery({
    queryKey: ["dispatch", "drivers", effectiveBranchId],
    queryFn: () => driversFn({ data: { branch_id: effectiveBranchId } }),
    enabled: !!effectiveBranchId,
  });

  const driverOptions = useMemo(() => {
    const list = [...(drivers ?? [])];
    if (selectedRoute?.driver_id && !list.some((d) => d.id === selectedRoute.driver_id)) {
      list.unshift({
        id: selectedRoute.driver_id,
        full_name: selectedRoute.driver_name,
      });
    }
    return list;
  }, [drivers, selectedRoute]);

  useEffect(() => {
    if (!routeId || !routes) return;
    const r = routes.find((x) => x.id === routeId);
    if (r?.driver_id) setDriverId(r.driver_id);
  }, [routeId, routes]);

  useEffect(() => {
    if (!products?.length) return;
    setQtyByProduct((prev) => {
      const next = { ...prev };
      for (const p of products) {
        if (!(p.id in next)) next[p.id] = "";
      }
      return next;
    });
  }, [products]);

  const usedIds = useMemo(() => new Set(items.map((i) => i.product_id).filter(Boolean)), [items]);

  function updateItem(idx: number, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }
  function addItem() {
    setItems((prev) => [...prev, { product_id: "", quantity: "" }]);
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  const mut = useMutation({
    mutationFn: async () => {
      const parsedItems = showAllProducts
        ? (products ?? [])
            .filter((p) => qtyByProduct[p.id] && Number(qtyByProduct[p.id]) > 0)
            .map((p) => ({ product_id: p.id, quantity: Number(qtyByProduct[p.id]) }))
        : items
            .filter((i) => i.product_id && i.quantity)
            .map((i) => ({ product_id: i.product_id, quantity: Number(i.quantity) }));
      if (parsedItems.length === 0) throw new Error("Agrega al menos una línea de producto.");
      for (const it of parsedItems) {
        if (!Number.isFinite(it.quantity) || it.quantity <= 0) {
          throw new Error("Las cantidades deben ser mayores a cero.");
        }
      }
      return createFn({
        data: {
          route_id: routeId,
          driver_id: driverId,
          notes: notes.trim() || null,
          items: parsedItems,
        },
      });
    },
    onSuccess: () => {
      toast.success("Despacho registrado");
      setRouteId("");
      setDriverId("");
      setNotes("");
      setQtyByProduct(Object.fromEntries((products ?? []).map((p) => [p.id, ""])));
      setItems([{ product_id: "", quantity: "" }]);
      qc.invalidateQueries({ queryKey: ["dispatches", "today"] });
      qc.invalidateQueries({ queryKey: ["truck-reconciliation"] });
      qc.invalidateQueries({ queryKey: ["driver", "myRouteToday"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al registrar"),
  });

  const hasProductLines = showAllProducts
    ? (products ?? []).some((p) => Number(qtyByProduct[p.id]) > 0)
    : items.some((i) => i.product_id && Number(i.quantity) > 0);

  const canSubmit = !!routeId && !!driverId && hasProductLines && !mut.isPending;

  return (
    <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Ruta</Label>
            <Select value={routeId} onValueChange={setRouteId}>
              <SelectTrigger><SelectValue placeholder="Selecciona una ruta" /></SelectTrigger>
              <SelectContent>
                {(routes ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
                {(routes?.length ?? 0) === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">No hay rutas activas.</div>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Repartidor</Label>
            <Select value={driverId} onValueChange={setDriverId} disabled={!routeId}>
              <SelectTrigger><SelectValue placeholder="Selecciona repartidor" /></SelectTrigger>
              <SelectContent>
                {driverOptions.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.full_name ?? d.id.slice(0, 8)}</SelectItem>
                ))}
                {driverOptions.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    {routeId ? "No hay repartidores en esta sucursal." : "Selecciona una ruta primero."}
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>Productos cargados</Label>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="show-all-products"
                  checked={showAllProducts}
                  onCheckedChange={setShowAllProducts}
                />
                <Label htmlFor="show-all-products" className="text-sm font-normal cursor-pointer">
                  Todos los productos
                </Label>
              </div>
              {!showAllProducts && (
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Icon icon={Add01Icon} className="h-4 w-4 mr-1" /> Agregar
                </Button>
              )}
            </div>
          </div>

          {showAllProducts ? (
            <div className="space-y-1 max-h-[320px] overflow-y-auto rounded-lg border p-1.5 xl:max-h-none xl:min-h-[120px]">
              {(products ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">No hay productos activos.</p>
              )}
              {(products ?? []).map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-2 rounded-lg border p-2 ${
                    Number(qtyByProduct[p.id]) > 0 ? "bg-accent/40 border-primary/40" : ""
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.unit}</div>
                  </div>
                  <div className="relative w-24 shrink-0">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      placeholder="0"
                      value={qtyByProduct[p.id] ?? ""}
                      onChange={(e) =>
                        setQtyByProduct((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                      className="text-right tabular-nums pr-8"
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
          <div className="space-y-2">
            {items.map((row, idx) => {
              const product = products?.find((p) => p.id === row.product_id);
              return (
                <div key={idx} className="flex flex-col gap-2 rounded-lg border p-2 sm:flex-row sm:items-end">
                  <div className="flex-1 min-w-0">
                    <Select
                      value={row.product_id}
                      onValueChange={(v) => updateItem(idx, { product_id: v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Producto" /></SelectTrigger>
                      <SelectContent>
                        {(products ?? [])
                          .filter((p) => p.id === row.product_id || !usedIds.has(p.id))
                          .map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="w-full sm:w-28">
                      <div className="relative">
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          placeholder="Cant."
                          value={row.quantity}
                          onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                        />
                        {product?.unit && (
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                            {product.unit}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeItem(idx)}
                      disabled={items.length === 1}
                    >
                      <Icon icon={Delete02Icon} className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Notas (opcional)</Label>
          <Textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            placeholder="Observaciones del despacho"
          />
        </div>

        <Button onClick={() => mut.mutate()} disabled={!canSubmit} className="w-full">
          <Icon icon={SentIcon} className="h-4 w-4 mr-1" />
          {mut.isPending ? "Registrando…" : "Registrar despacho"}
        </Button>
    </div>
  );
}

function DailySummaryCard({ date, className }: { date: string; className?: string }) {
  const { branchId } = useBranchScope();
  const listFn = useServerFn(listDispatchesToday);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: list, isLoading } = useQuery({
    queryKey: ["dispatches", "today", date, branchId],
    queryFn: () => listFn({ data: { date, branch_id: branchId } }),
  });

  const routeGroups = useMemo(() => buildRouteGroupsWithDispatches(list ?? []), [list]);
  const singleGroup = routeGroups.length === 1;

  const branchTotals = useMemo(
    () =>
      routeGroups.reduce(
        (acc, g) => ({
          dispatches: acc.dispatches + g.dispatch_count,
          lines: acc.lines + g.total_lines,
          units: acc.units + g.total_units,
        }),
        { dispatches: 0, lines: 0, units: 0 },
      ),
    [routeGroups],
  );

  return (
    <Card className={cn("relative overflow-visible xl:flex xl:flex-col xl:min-h-0", className)}>
      <CardHeader className="py-3 shrink-0 xl:py-2 xl:pb-1">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">Despachos del día</CardTitle>
          {!isLoading && routeGroups.length > 0 && (
            <div className="text-xs tabular-nums text-muted-foreground text-right shrink-0">
              {routeGroups.length} {routeGroups.length === 1 ? "ruta" : "rutas"} ·{" "}
              {fmtQty(branchTotals.units)} u
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0 xl:flex-1 xl:min-h-0 xl:flex xl:flex-col xl:overflow-hidden">
        <div className="space-y-2 max-h-[360px] overflow-y-auto xl:max-h-none xl:flex-1 xl:min-h-0">
          {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {!isLoading && routeGroups.length === 0 && (
            <p className="text-sm text-muted-foreground">Sin despachos en esta fecha.</p>
          )}
          {routeGroups.map((group) => (
            <Collapsible key={group.key} defaultOpen={singleGroup}>
              <div className="rounded-xl border overflow-hidden">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-start gap-2 px-3 py-2.5 text-left bg-muted/30 hover:bg-muted/45 transition-colors"
                  >
                    <Icon
                      icon={ArrowDown01Icon}
                      className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">
                        {group.route_name ?? "Ruta"}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {group.driver_name ?? "—"}
                      </div>
                      <div className="mt-1 text-xs tabular-nums text-muted-foreground">
                        {group.dispatch_count}{" "}
                        {group.dispatch_count === 1 ? "despacho" : "despachos"} ·{" "}
                        {group.total_lines} {group.total_lines === 1 ? "línea" : "líneas"} ·{" "}
                        <span className="font-medium text-foreground">{fmtQty(group.total_units)} u</span>
                      </div>
                    </div>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="divide-y border-t">
                    {group.dispatches.map((d) => {
                      const time = new Date(d.dispatched_at).toLocaleTimeString(APP_LOCALE, {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: APP_TZ,
                      });
                      return (
                        <div
                          key={d.id}
                          className="flex items-center gap-2 px-3 py-2 bg-background hover:bg-muted/20"
                        >
                          <div className="w-12 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                            {time}
                          </div>
                          <div className="flex-1 min-w-0 text-xs text-muted-foreground">
                            {d.line_count} {d.line_count === 1 ? "línea" : "líneas"} ·{" "}
                            <span className="font-medium text-foreground tabular-nums">
                              {fmtQty(d.total_units)} u
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => setOpenId(d.id)}
                          >
                            <Icon icon={ViewIcon} className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          ))}
        </div>
      </CardContent>

      <DispatchDetailDialog id={openId} onClose={() => setOpenId(null)} />
    </Card>
  );
}

function RouteReturnCard({ date }: { date: string }) {
  const qc = useQueryClient();
  const { branchId } = useBranchScope();
  const listFn = useServerFn(listDispatchesToday);
  const getReturnFn = useServerFn(getTruckReturnForRouteDay);
  const saveFn = useServerFn(registerTruckReturnForRouteDay);

  const [groupKey, setGroupKey] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [rows, setRows] = useState<ReturnRow[]>([]);

  const { data: dispatches, isLoading: loadingList } = useQuery({
    queryKey: ["dispatches", "today", date, branchId],
    queryFn: () => listFn({ data: { date, branch_id: branchId } }),
  });

  const routeGroups = useMemo(() => buildRouteGroups(dispatches ?? []), [dispatches]);

  useEffect(() => {
    if (routeGroups.length === 0) {
      setGroupKey("");
      return;
    }
    setGroupKey((prev) => {
      if (prev && routeGroups.some((g) => g.key === prev)) return prev;
      return routeGroups.length === 1 ? routeGroups[0].key : "";
    });
  }, [routeGroups, date]);

  const selectedGroup = routeGroups.find((g) => g.key === groupKey);

  const { data: routeReturn, isLoading: loadingReturn } = useQuery({
    queryKey: ["truck-return-route", date, groupKey, branchId],
    queryFn: () =>
      getReturnFn({
        data: {
          date,
          route_id: selectedGroup!.route_id,
          driver_id: selectedGroup!.driver_id,
          branch_id: branchId,
        },
      }),
    enabled: !!selectedGroup,
  });

  useEffect(() => {
    if (!routeReturn) {
      setRows([]);
      return;
    }
    setRows(
      routeReturn.products.map((p) => ({
        product_id: p.product_id,
        product_name: p.product_name,
        unit: p.unit,
        dispatched: p.total_dispatched,
        quantity: p.total_returned > 0 ? String(p.total_returned) : "",
      })),
    );
    setNotes(routeReturn.notes ?? "");
  }, [routeReturn]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!selectedGroup) throw new Error("Selecciona una ruta.");
      const items = rows.map((r) => ({
        product_id: r.product_id,
        quantity: r.quantity === "" ? 0 : Number(r.quantity),
      }));
      for (const it of items) {
        if (!Number.isFinite(it.quantity) || it.quantity < 0) {
          throw new Error("Las cantidades deben ser cero o mayores.");
        }
        const row = rows.find((r) => r.product_id === it.product_id);
        if (row && it.quantity > row.dispatched) {
          throw new Error("La cantidad que quedó no puede ser mayor a lo cargado.");
        }
      }
      return saveFn({
        data: {
          date,
          route_id: selectedGroup.route_id,
          driver_id: selectedGroup.driver_id,
          branch_id: branchId,
          notes: notes.trim() || null,
          items,
        },
      });
    },
    onSuccess: () => {
      toast.success("Regreso registrado");
      qc.invalidateQueries({ queryKey: ["truck-return-route"] });
      qc.invalidateQueries({ queryKey: ["truck-reconciliation"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al registrar"),
  });

  const loading = loadingList || (!!selectedGroup && loadingReturn);
  const hasAnyReturn = rows.some((r) => r.quantity !== "" && Number(r.quantity) > 0);
  const hasSavedReturn = (routeReturn?.products.some((p) => p.total_returned > 0) ?? false) || hasAnyReturn;

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        const left = row.quantity === "" ? 0 : Number(row.quantity);
        const leftNum = Number.isFinite(left) ? left : 0;
        const sold = Math.max(0, row.dispatched - leftNum);
        return {
          dispatched: acc.dispatched + row.dispatched,
          returned: acc.returned + leftNum,
          sold: acc.sold + sold,
        };
      },
      { dispatched: 0, returned: 0, sold: 0 },
    );
  }, [rows]);

  if (loadingList) {
    return <p className="text-sm text-muted-foreground">Cargando rutas…</p>;
  }

  if (routeGroups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center">
        Sin despachos en esta fecha. Registra un despacho antes de anotar el regreso.
      </p>
    );
  }

  return (
    <Card className="relative overflow-visible border-0 shadow-none bg-transparent p-0">
      <CardContent className="space-y-4 p-0">
        <p className="text-xs text-muted-foreground">
          Al final del día, anota lo que regresó sin vender en el camión. Se consolidan todos los despachos de la ruta.
        </p>

        {routeGroups.length > 1 && (
          <div className="space-y-1.5">
            <Label>Selecciona la ruta</Label>
            <Select value={groupKey} onValueChange={setGroupKey}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Elige ruta y repartidor" />
              </SelectTrigger>
              <SelectContent>
                {routeGroups.map((g) => (
                  <SelectItem key={g.key} value={g.key}>
                    {routeGroupLabel(g)} ({g.dispatch_count} {g.dispatch_count === 1 ? "despacho" : "despachos"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {selectedGroup && (
          <>
            <div className="rounded-xl border bg-muted/30 px-4 py-3 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-sm">{routeGroupLabel(selectedGroup)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {selectedGroup.dispatch_count}{" "}
                    {selectedGroup.dispatch_count === 1 ? "despacho" : "despachos"} ·{" "}
                    {fmtQty(selectedGroup.total_units)} u cargadas
                    {routeReturn?.dispatched_at_first && routeReturn?.dispatched_at_last
                      ? ` · ${formatDispatchTimeRange(routeReturn.dispatched_at_first, routeReturn.dispatched_at_last)}`
                      : null}
                  </div>
                </div>
                <Badge variant={hasSavedReturn ? "success" : "warning"}>
                  {hasSavedReturn ? "Regreso registrado" : "Regreso pendiente"}
                </Badge>
              </div>
            </div>

            {loading && <p className="text-sm text-muted-foreground">Cargando productos…</p>}

            {!loading && rows.length > 0 && (
              <div className="rounded-xl border overflow-hidden">
                <div className="hidden sm:grid sm:grid-cols-[1fr_5.5rem_6rem_5.5rem] gap-2 px-4 py-2.5 bg-muted/40 text-xs font-medium text-muted-foreground border-b">
                  <span>Producto</span>
                  <span className="text-right">Cargado</span>
                  <span className="text-right">Quedó</span>
                  <span className="text-right">Vendido est.</span>
                </div>
                <div className="divide-y max-h-[360px] overflow-y-auto xl:max-h-none">
                  {rows.map((row, idx) => {
                    const left = row.quantity === "" ? null : Number(row.quantity);
                    const sold =
                      left != null && Number.isFinite(left)
                        ? Math.max(0, row.dispatched - left)
                        : null;
                    return (
                      <div
                        key={row.product_id}
                        className="px-4 py-3 space-y-2 sm:grid sm:grid-cols-[1fr_5.5rem_6rem_5.5rem] sm:items-center sm:gap-2 sm:space-y-0"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">
                            {row.product_name ?? row.product_id.slice(0, 8)}
                          </div>
                          {row.unit && <div className="text-xs text-muted-foreground">{row.unit}</div>}
                        </div>
                        <div className="flex items-center justify-between sm:block sm:text-right">
                          <span className="text-xs text-muted-foreground sm:hidden">Cargado</span>
                          <span className="tabular-nums text-sm font-medium">{fmtQty(row.dispatched)}</span>
                        </div>
                        <div className="flex items-center gap-2 sm:justify-end">
                          <span className="text-xs text-muted-foreground sm:hidden shrink-0">Quedó</span>
                          <Input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            placeholder="0"
                            value={row.quantity}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)),
                              )
                            }
                            className="h-10 w-full sm:w-24 text-right tabular-nums text-base"
                          />
                        </div>
                        <div className="flex items-center justify-between sm:justify-end">
                          <span className="text-xs text-muted-foreground sm:hidden">Vendido est.</span>
                          <span className="tabular-nums text-sm font-semibold">
                            {sold != null ? fmtQty(sold) : "—"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-[1fr_5.5rem_6rem_5.5rem] gap-2 px-4 py-3 bg-muted/20 border-t text-sm font-medium">
                  <span className="col-span-2 sm:col-span-1">Total</span>
                  <span className="text-right tabular-nums hidden sm:block">{fmtQty(totals.dispatched)}</span>
                  <span className="text-right tabular-nums hidden sm:block">{fmtQty(totals.returned)}</span>
                  <span className="text-right tabular-nums hidden sm:block">{fmtQty(totals.sold)}</span>
                  <div className="col-span-2 sm:hidden flex justify-between text-xs text-muted-foreground">
                    <span>Cargado {fmtQty(totals.dispatched)}</span>
                    <span>Quedó {fmtQty(totals.returned)}</span>
                    <span>Vendido {fmtQty(totals.sold)}</span>
                  </div>
                </div>
                <p className="px-4 pb-3 text-xs text-muted-foreground">
                  Vendido estimado = cargado − quedó. No incluye intercambios de clientes en ruta.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Notas (opcional)</Label>
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
                placeholder="Observaciones del regreso"
              />
            </div>

            <Button
              onClick={() => mut.mutate()}
              disabled={!selectedGroup || mut.isPending || rows.length === 0}
              className="w-full sm:w-auto h-11"
            >
              {mut.isPending
                ? "Guardando…"
                : hasSavedReturn
                  ? "Actualizar regreso"
                  : hasAnyReturn
                    ? "Registrar regreso"
                    : "Limpiar regreso"}
            </Button>
          </>
        )}

        {routeGroups.length > 1 && !groupKey && (
          <p className="text-sm text-muted-foreground rounded-lg border border-dashed px-4 py-5 text-center">
            Elige la ruta para ver los productos cargados y registrar el regreso.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function DispatchDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const getFn = useServerFn(getDispatch);
  const { data, isLoading } = useQuery({
    queryKey: ["dispatch", id],
    queryFn: () => getFn({ data: { id: id! } }),
    enabled: !!id,
  });

  return (
    <Dialog open={!!id} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Detalle del despacho</DialogTitle>
        </DialogHeader>
        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {data && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <div className="text-xs text-muted-foreground">Ruta</div>
                <div className="font-medium">{data.route_name ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Repartidor</div>
                <div className="font-medium">{data.driver_name ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Registrado por</div>
                <div className="font-medium">{data.dispatched_by_name ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Hora</div>
                <div className="font-medium">
                  {new Date(data.dispatched_at).toLocaleString(APP_LOCALE, { timeZone: APP_TZ, dateStyle: "medium", timeStyle: "short" })}
                </div>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Productos</div>
              <div className="border rounded-md divide-y">
                {data.items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between p-2 text-sm">
                    <span className="truncate">{it.product_name ?? it.product_id.slice(0, 8)}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {fmtQty(it.quantity)} {it.unit ?? ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {data.notes && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Notas</div>
                <p className="text-sm whitespace-pre-wrap">{data.notes}</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReconciliationCard({ date }: { date: string }) {
  const recFn = useServerFn(getTruckReconciliation);
  const { branchId } = useBranchScope();
  const { data, isLoading } = useQuery({
    queryKey: ["truck-reconciliation", date, branchId],
    queryFn: () => recFn({ data: { date, branch_id: branchId } }),
  });

  const branchTotals = useMemo(() => {
    return (data ?? []).reduce(
      (acc, g) => ({
        dispatched: acc.dispatched + g.totals.dispatched,
        sold: acc.sold + g.totals.sold,
        customer_returns: acc.customer_returns + g.totals.customer_returns,
        actual_returned: acc.actual_returned + g.totals.actual_returned,
        on_truck: acc.on_truck + g.totals.on_truck,
        difference: acc.difference + g.totals.difference,
      }),
      { dispatched: 0, sold: 0, customer_returns: 0, actual_returned: 0, on_truck: 0, difference: 0 },
    );
  }, [data]);

  const singleGroup = (data?.length ?? 0) === 1;

  return (
    <Card className="relative overflow-visible border-0 shadow-none bg-transparent p-0">
      <CardContent className="space-y-4 p-0">
        <p className="text-xs text-muted-foreground">
          Compara lo calculado (cargado − vendido − dev. clientes) con lo registrado en el regreso.
        </p>

        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {!isLoading && (data?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center">
            Sin movimientos en esta fecha.
          </p>
        )}

        <div className="space-y-3">
          {(data ?? []).map((g) => {
            const balanced = g.totals.difference === 0;
            return (
              <Collapsible key={g.key} defaultOpen={singleGroup}>
                <div className="rounded-xl border overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full flex-col gap-3 border-b bg-muted/40 px-4 py-3 text-left hover:bg-muted/55 transition-colors sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-sm">{g.route_name ?? "Ruta"}</div>
                        <div className="text-xs text-muted-foreground">{g.driver_name ?? "—"}</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums text-muted-foreground">
                          <span>
                            Cargado <b className="text-foreground">{fmtQty(g.totals.dispatched)}</b>
                          </span>
                          <span>
                            Vendido <b className="text-foreground">{fmtQty(g.totals.sold)}</b>
                          </span>
                          <span>
                            Regreso <b className="text-foreground">{fmtQty(g.totals.actual_returned)}</b>
                          </span>
                        </div>
                        <Badge variant={balanced ? "success" : "destructive"}>
                          {balanced
                            ? "✓ Cuadra"
                            : g.totals.difference > 0
                              ? `+${fmtQty(g.totals.difference)}`
                              : fmtQty(g.totals.difference)}
                        </Badge>
                        <Icon
                          icon={ArrowDown01Icon}
                          className="h-4 w-4 text-muted-foreground shrink-0"
                        />
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[680px] text-sm">
                        <thead className="sticky top-0 z-10 bg-background text-xs text-muted-foreground">
                          <tr className="border-b">
                            <th className="text-left font-medium px-4 py-2.5">Producto</th>
                            <th className="text-right font-medium px-3 py-2.5">Cargado</th>
                            <th className="text-right font-medium px-3 py-2.5">Vendido</th>
                            <th className="text-right font-medium px-3 py-2.5">Dev. clientes</th>
                            <th className="text-right font-medium px-3 py-2.5">Calculado</th>
                            <th className="text-right font-medium px-3 py-2.5">Regreso</th>
                            <th className="text-right font-medium px-4 py-2.5">Diferencia</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.products.map((p) => {
                            const hasDiff = p.difference !== 0;
                            return (
                              <tr key={p.product_id} className="border-b last:border-0 hover:bg-muted/20">
                                <td className="px-4 py-2.5 truncate">
                                  {p.product_name ?? p.product_id.slice(0, 8)}
                                  {p.unit ? (
                                    <span className="text-xs text-muted-foreground ml-1">({p.unit})</span>
                                  ) : null}
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{fmtQty(p.dispatched)}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{fmtQty(p.sold)}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{fmtQty(p.customer_returns)}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{fmtQty(p.on_truck)}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{fmtQty(p.actual_returned)}</td>
                                <td
                                  className={cn(
                                    "px-4 py-2.5 text-right tabular-nums font-medium",
                                    hasDiff ? "text-destructive" : "text-emerald-600 dark:text-emerald-400",
                                  )}
                                >
                                  {hasDiff ? fmtQty(p.difference) : "0"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-muted/20 font-medium">
                            <td className="px-4 py-2.5">Total ruta</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{fmtQty(g.totals.dispatched)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{fmtQty(g.totals.sold)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{fmtQty(g.totals.customer_returns)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{fmtQty(g.totals.on_truck)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{fmtQty(g.totals.actual_returned)}</td>
                            <td
                              className={cn(
                                "px-4 py-2.5 text-right tabular-nums",
                                g.totals.difference !== 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400",
                              )}
                            >
                              {fmtQty(g.totals.difference)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>

        {(data?.length ?? 0) > 1 && (
          <div className="rounded-xl border bg-muted/30 px-4 py-3">
            <div className="text-xs font-medium text-muted-foreground mb-2">Total del día</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
              <span>
                Cargado <b>{fmtQty(branchTotals.dispatched)}</b>
              </span>
              <span>
                Vendido <b>{fmtQty(branchTotals.sold)}</b>
              </span>
              <span>
                Regreso <b>{fmtQty(branchTotals.actual_returned)}</b>
              </span>
              <span className={branchTotals.difference !== 0 ? "text-destructive font-semibold" : "text-emerald-600 dark:text-emerald-400 font-semibold"}>
                Diferencia {fmtQty(branchTotals.difference)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CrossBranchLoadForm() {
  const qc = useQueryClient();
  const { branchId } = useBranchScope();
  const productsFn = useServerFn(listProductsActive);
  const createFn = useServerFn(createCrossBranchLoad);
  const listFn = useServerFn(listCrossBranchLoadsToday);
  const externalDriversFn = useServerFn(listExternalDrivers);
  const ctxFn = useServerFn(getMyContext);
  const { data: ctx } = useQuery({ queryKey: ["myContext"], queryFn: () => ctxFn() });

  const { data: products } = useQuery({ queryKey: ["dispatch", "products"], queryFn: () => productsFn() });
  const { data: externalDrivers, isLoading: driversLoading } = useQuery({
    queryKey: ["dispatch", "external-drivers", branchId],
    queryFn: () => externalDriversFn({ data: { branch_id: branchId } }),
  });
  const { data: todayLoads } = useQuery({
    queryKey: ["cross-branch-loads", "today", branchId],
    queryFn: () => listFn({ data: { branch_id: branchId } }),
  });

  const [driverId, setDriverId] = useState("");
  const [notes, setNotes] = useState("");
  const [qtyByProduct, setQtyByProduct] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!products?.length) return;
    setQtyByProduct((prev) => {
      const next = { ...prev };
      for (const p of products) {
        if (!(p.id in next)) next[p.id] = "";
      }
      return next;
    });
  }, [products]);

  const hasLines = (products ?? []).some((p) => Number(qtyByProduct[p.id]) > 0);

  const mut = useMutation({
    mutationFn: async () => {
      if (!driverId) throw new Error("Selecciona un repartidor externo.");
      const items = (products ?? [])
        .filter((p) => qtyByProduct[p.id] && Number(qtyByProduct[p.id]) > 0)
        .map((p) => ({ product_id: p.id, quantity: Number(qtyByProduct[p.id]) }));
      if (items.length === 0) throw new Error("Agrega al menos un producto.");
      return createFn({ data: { driver_id: driverId, notes: notes.trim() || null, items } });
    },
    onSuccess: () => {
      toast.success("Carga externa registrada");
      setDriverId("");
      setNotes("");
      setQtyByProduct(Object.fromEntries((products ?? []).map((p) => [p.id, ""])));
      qc.invalidateQueries({ queryKey: ["cross-branch-loads"] });
      qc.invalidateQueries({ queryKey: ["driver", "dispatchStock"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al registrar"),
  });

  const role = ctx?.primaryRole;
  if (!role || !(role === "cashier" || role === "supervisor" || role === "owner")) return null;

  const driverOptions = externalDrivers ?? [];

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Productos entregados a un repartidor de otra sucursal. No incluye sus ventas ni sus tiendas.
      </p>

      <div className="space-y-1.5">
        <Label>Repartidor externo</Label>
        <ExternalDriverCombobox
          value={driverId}
          onChange={setDriverId}
          drivers={driverOptions}
          disabled={driversLoading}
        />
        <p className="text-xs text-muted-foreground">
          El repartidor deberá registrar el costo como gasto con foto del ticket.
        </p>
      </div>

        <div className="space-y-2">
          <Label>Artículos entregados</Label>
          <div className="space-y-1 max-h-[240px] overflow-y-auto rounded-lg border p-1.5 xl:max-h-none xl:min-h-[120px]">
            {(products ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">No hay productos activos.</p>
            )}
            {(products ?? []).map((p) => (
              <div
                key={p.id}
                className={`flex items-center gap-2 rounded-lg border p-2 ${Number(qtyByProduct[p.id]) > 0 ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.unit}</div>
                </div>
                <div className="relative w-24 shrink-0">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={qtyByProduct[p.id] ?? ""}
                    onChange={(e) => setQtyByProduct((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    className="text-right tabular-nums pr-8"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Notas (opcional)</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Ej: cobrado en efectivo" />
        </div>

        <Button onClick={() => mut.mutate()} disabled={!driverId || !hasLines || mut.isPending} className="w-full bg-amber-600 hover:bg-amber-700">
          <Icon icon={SentIcon} className="h-4 w-4 mr-1" />
          {mut.isPending ? "Registrando…" : "Registrar carga externa"}
        </Button>

        {(todayLoads ?? []).length > 0 && (
          <div className="space-y-1.5 pt-1">
            <Label className="text-xs text-muted-foreground">Cargas externas registradas hoy</Label>
            {todayLoads!.map((l) => (
              <div key={l.id} className="flex items-center gap-2 rounded-md border px-2.5 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{l.driver_name ?? l.driver_id.slice(0, 8)}</div>
                  <div className="text-xs text-muted-foreground">{fmtQty(l.total_units)} unidades</div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(l.created_at).toLocaleTimeString(APP_LOCALE, { hour: "2-digit", minute: "2-digit", timeZone: APP_TZ })}
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
