import {
  Add01Icon,
  Delete02Icon,
  SentIcon,
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
  getTruckReturnForDispatch,
  registerTruckReturn,
} from "@/lib/api/dispatches.functions";
import { listBranchDrivers } from "@/lib/api/routes.functions";
import { getBranchDispatchGate, setBranchRequireDispatch, getBranchLocationGate, setBranchLocationEnabled } from "@/lib/api/branches.functions";
import { clearDayMovements } from "@/lib/api/admin.functions";
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
import { StatCardSimple, StatGrid } from "@/components/admin/stat-cards";
import { FilterDatePicker, PageHeader } from "@/components/admin/data-table";

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
    <div className="space-y-4 pb-6">
      <PageHeader
        title="Despacho"
        description="Carga, devolución y reconciliación del camión."
        action={
          <FilterDatePicker
            value={date}
            onChange={(v) => setDate(v || todayStr())}
          />
        }
      />

      {(role === "owner" || role === "supervisor") && (
        <div className="space-y-2">
          <DispatchGateSettings role={role} />
          <LocationGateSettings role={role} />
        </div>
      )}

      <DispatchDayStats date={date} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5 xl:items-start">
        <div className="xl:col-span-2">
          <NewDispatchCard />
        </div>
        <div className="xl:col-span-3 space-y-4">
          <DailySummaryCard date={date} />
          <Card>
            <CardContent className="pt-4">
              <Tabs defaultValue="return" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="return">Devolución de camión</TabsTrigger>
                  <TabsTrigger value="reconciliation">Reconciliación</TabsTrigger>
                </TabsList>
                <TabsContent value="return" className="mt-3">
                  <TruckReturnCard date={date} />
                </TabsContent>
                <TabsContent value="reconciliation" className="mt-3">
                  <ReconciliationCard date={date} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      {role === "owner" && <ClearDayMovementsCard date={date} />}
    </div>
  );
}

function DispatchDayStats({ date }: { date: string }) {
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
        label="Dev. camión"
        value={hasReconciliation ? truckStats.actual_returned : 0}
        highlight={hasReconciliation && truckStats.difference !== 0}
        sub={
          !hasReconciliation
            ? undefined
            : truckStats.difference !== 0
              ? `${fmtQty(Math.abs(truckStats.difference))} vs calculado`
              : "Coincide con calculado"
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
        <div className="font-medium text-sm">Permitir registro de ubicación a repartidores</div>
        <p className="text-xs text-muted-foreground max-w-xl">
          {isLoading
            ? "Cargando configuración…"
            : data?.driver_location_enabled
              ? `Activo en ${data.branch_name}: los repartidores pueden registrar y actualizar coordenadas GPS de los clientes.`
              : `Desactivado en ${data?.branch_name}: los repartidores solo pueden ver ubicaciones guardadas, no editarlas.`}
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

function ClearDayMovementsCard({ date: pageDate }: { date: string }) {
  const qc = useQueryClient();
  const { branchId } = useBranchScope();
  const clearFn = useServerFn(clearDayMovements);
  const [date, setDate] = useState<string>(pageDate);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    setDate(pageDate);
  }, [pageDate]);

  const mut = useMutation({
    mutationFn: () => clearFn({ data: { date, branch_id: branchId! } }),
    onSuccess: (result) => {
      const { payments, deliveries, expenses, dispatches } = result.deleted;
      toast.success(
        `Movimientos eliminados: ${dispatches} despachos, ${deliveries} entregas, ${payments} pagos, ${expenses} gastos.`,
      );
      setConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ["dispatches"] });
      qc.invalidateQueries({ queryKey: ["truck-reconciliation"] });
      qc.invalidateQueries({ queryKey: ["truck-return"] });
      qc.invalidateQueries({ queryKey: ["driver"] });
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo limpiar."),
  });

  if (!branchId) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-4 text-sm text-muted-foreground">
          Selecciona una sucursal en el menú superior para limpiar movimientos de prueba.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-destructive/30">
        <CardHeader className="py-3">
          <CardTitle className="text-base text-destructive">Zona de pruebas</CardTitle>
          <CardDescription className="text-xs">
            Elimina movimientos de una fecha sin borrar rutas, clientes ni productos.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-0">
          <p className="text-sm text-muted-foreground">
            Fecha seleccionada: <span className="font-medium text-foreground">{date}</span>
          </p>
          <Button
            variant="destructive"
            onClick={() => setConfirmOpen(true)}
            disabled={mut.isPending}
          >
            <Icon icon={Delete02Icon} className="h-4 w-4 mr-1" />
            Limpiar movimientos del día
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Limpiar movimientos del {date}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Se eliminarán permanentemente todos los <strong>despachos</strong>,{" "}
                  <strong>devoluciones de camión</strong>, <strong>entregas</strong>,{" "}
                  <strong>pagos</strong> y <strong>gastos</strong> de esta sucursal en esa fecha.
                </p>
                <p>
                  No se eliminarán rutas, clientes, productos, usuarios ni configuración de la sucursal.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={mut.isPending}
              onClick={(e) => {
                e.preventDefault();
                mut.mutate();
              }}
            >
              {mut.isPending ? "Eliminando…" : "Sí, limpiar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function NewDispatchCard() {
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
    <Card className="relative overflow-visible">
      <CardHeader className="py-3">
        <div className="flex items-center gap-2">
          <Icon icon={TruckDeliveryIcon} className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Nuevo despacho</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
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
            <div className="space-y-1 max-h-[320px] overflow-y-auto rounded-lg border p-1.5">
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
      </CardContent>
    </Card>
  );
}

function DailySummaryCard({ date }: { date: string }) {
  const { branchId } = useBranchScope();
  const listFn = useServerFn(listDispatchesToday);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: list, isLoading } = useQuery({
    queryKey: ["dispatches", "today", date, branchId],
    queryFn: () => listFn({ data: { date, branch_id: branchId } }),
  });

  return (
    <Card className="relative overflow-visible">
      <CardHeader className="py-3">
        <CardTitle className="text-base">Despachos del día</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
          {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {!isLoading && (list?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">Sin despachos en esta fecha.</p>
          )}
          {(list ?? []).map((r) => {
            const time = new Date(r.dispatched_at).toLocaleTimeString(APP_LOCALE, {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: APP_TZ,
            });
            return (
              <div
                key={r.id}
                className="flex items-center gap-2 rounded-md border px-2.5 py-2"
              >
                <div className="w-12 shrink-0 text-xs font-medium tabular-nums">{time}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{r.route_name ?? "Ruta"}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.driver_name ?? "—"} · {r.line_count} {r.line_count === 1 ? "línea" : "líneas"} · {fmtQty(r.total_units)} u
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setOpenId(r.id)}>
                  <Icon icon={ViewIcon} className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>

      <DispatchDetailDialog id={openId} onClose={() => setOpenId(null)} />
    </Card>
  );
}

function TruckReturnCard({ date }: { date: string }) {
  const qc = useQueryClient();
  const { branchId } = useBranchScope();
  const listFn = useServerFn(listDispatchesToday);
  const getDispatchFn = useServerFn(getDispatch);
  const getReturnFn = useServerFn(getTruckReturnForDispatch);
  const saveFn = useServerFn(registerTruckReturn);

  const [dispatchId, setDispatchId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [rows, setRows] = useState<ReturnRow[]>([]);

  useEffect(() => {
    setDispatchId("");
  }, [date]);

  const { data: dispatches, isLoading: loadingList } = useQuery({
    queryKey: ["dispatches", "today", date, branchId],
    queryFn: () => listFn({ data: { date, branch_id: branchId } }),
  });

  const { data: dispatchDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ["dispatch", dispatchId],
    queryFn: () => getDispatchFn({ data: { id: dispatchId } }),
    enabled: !!dispatchId,
  });

  const { data: existingReturns, isLoading: loadingReturns } = useQuery({
    queryKey: ["truck-return", dispatchId],
    queryFn: () => getReturnFn({ data: { dispatch_id: dispatchId } }),
    enabled: !!dispatchId,
  });

  useEffect(() => {
    if (!dispatchDetail) {
      setRows([]);
      return;
    }
    const returnMap = new Map((existingReturns ?? []).map((r) => [r.product_id, r.quantity]));
    setRows(
      dispatchDetail.items.map((it) => ({
        product_id: it.product_id,
        product_name: it.product_name,
        unit: it.unit,
        dispatched: it.quantity,
        quantity: returnMap.has(it.product_id) ? String(returnMap.get(it.product_id)) : "",
      })),
    );
    const firstNote = existingReturns?.find((r) => r.notes)?.notes;
    setNotes(firstNote ?? "");
  }, [dispatchDetail, existingReturns]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!dispatchId) throw new Error("Selecciona un despacho.");
      const items = rows.map((r) => ({
        product_id: r.product_id,
        quantity: r.quantity === "" ? 0 : Number(r.quantity),
      }));
      for (const it of items) {
        if (!Number.isFinite(it.quantity) || it.quantity < 0) {
          throw new Error("Las cantidades deben ser cero o mayores.");
        }
      }
      return saveFn({
        data: {
          dispatch_id: dispatchId,
          notes: notes.trim() || null,
          items,
        },
      });
    },
    onSuccess: () => {
      toast.success("Devolución de camión registrada");
      qc.invalidateQueries({ queryKey: ["truck-return", dispatchId] });
      qc.invalidateQueries({ queryKey: ["truck-reconciliation"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al registrar"),
  });

  const selectedDispatch = dispatches?.find((d) => d.id === dispatchId);
  const loading = loadingList || (!!dispatchId && (loadingDetail || loadingReturns));
  const hasAnyReturn = rows.some((r) => r.quantity !== "" && Number(r.quantity) > 0);

  return (
    <Card className="relative overflow-visible border-0 shadow-none bg-transparent p-0">
      <CardContent className="space-y-3 p-0">
        <p className="text-xs text-muted-foreground">
          Producto que regresa sin vender. Distinto a devoluciones de clientes en ruta.
        </p>
        <div className="space-y-1.5">
          <Label>Despacho</Label>
          <Select
            value={dispatchId}
            onValueChange={setDispatchId}
          >
            <SelectTrigger><SelectValue placeholder="Selecciona despacho" /></SelectTrigger>
            <SelectContent>
              {(dispatches ?? []).map((d) => {
                const time = new Date(d.dispatched_at).toLocaleTimeString(APP_LOCALE, {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: APP_TZ,
                });
                return (
                  <SelectItem key={d.id} value={d.id}>
                    {time} · {d.route_name ?? "Ruta"} · {d.driver_name ?? "—"}
                  </SelectItem>
                );
              })}
              {(dispatches?.length ?? 0) === 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground">Sin despachos en esta fecha.</div>
              )}
            </SelectContent>
          </Select>
        </div>

        {dispatchId && (
          <>
            {selectedDispatch && (
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                <span className="font-medium">{selectedDispatch.route_name ?? "Ruta"}</span>
                <span className="text-muted-foreground"> · {selectedDispatch.driver_name ?? "—"}</span>
              </div>
            )}

            {loading && <p className="text-sm text-muted-foreground">Cargando productos…</p>}

            {!loading && rows.length > 0 && (
              <div className="space-y-2">
                <div className="hidden sm:grid sm:grid-cols-[1fr_5rem_5rem_5rem] gap-2 px-1 text-xs font-medium text-muted-foreground">
                  <span>Producto</span>
                  <span className="text-right">Cargado</span>
                  <span className="text-right">Quedó</span>
                  <span className="text-right">Vendido*</span>
                </div>
                {rows.map((row, idx) => {
                  const left = row.quantity === "" ? null : Number(row.quantity);
                  const sold =
                    left != null && Number.isFinite(left)
                      ? Math.max(0, row.dispatched - left)
                      : null;
                  return (
                    <div
                      key={row.product_id}
                      className="rounded-lg border p-3 space-y-2 sm:grid sm:grid-cols-[1fr_5rem_5rem_5rem] sm:items-center sm:gap-2 sm:space-y-0"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{row.product_name ?? row.product_id.slice(0, 8)}</div>
                        {row.unit && <div className="text-xs text-muted-foreground">{row.unit}</div>}
                      </div>
                      <div className="flex items-center justify-between sm:block sm:text-right">
                        <span className="text-xs text-muted-foreground sm:hidden">Cargado</span>
                        <span className="tabular-nums text-sm">{fmtQty(row.dispatched)}</span>
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
                          className="w-full sm:w-20 text-right tabular-nums"
                        />
                      </div>
                      <div className="flex items-center justify-between sm:justify-end">
                        <span className="text-xs text-muted-foreground sm:hidden">Vendido</span>
                        <span className="tabular-nums text-sm font-medium">
                          {sold != null ? fmtQty(sold) : "—"}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground">
                  * Vendido estimado = cargado − quedó. No incluye intercambios de clientes en ruta.
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
                placeholder="Observaciones de la devolución"
              />
            </div>

            <Button
              onClick={() => mut.mutate()}
              disabled={!dispatchId || mut.isPending}
              className="w-full sm:w-auto"
            >
              {mut.isPending ? "Guardando…" : hasAnyReturn ? "Registrar devolución" : "Limpiar devolución"}
            </Button>
          </>
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

  return (
    <Card className="relative overflow-visible border-0 shadow-none bg-transparent p-0">
      <CardContent className="space-y-3 p-0">
        <p className="text-xs text-muted-foreground">
          Cargado − vendido + devuelto clientes = calculado. Compara con lo registrado al regreso.
        </p>

        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {!isLoading && (data?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">Sin movimientos en esta fecha.</p>
        )}

        <div className="space-y-3">
          {(data ?? []).map((g) => (
            <div key={g.key} className="rounded-lg border overflow-hidden">
              <div className="flex flex-col gap-2 border-b bg-muted/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium">{g.route_name ?? "Ruta"}</div>
                  <div className="text-xs text-muted-foreground">{g.driver_name ?? "—"}</div>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums text-muted-foreground">
                  <span>Cargado <b className="text-foreground">{fmtQty(g.totals.dispatched)}</b></span>
                  <span>Vendido <b className="text-foreground">{fmtQty(g.totals.sold)}</b></span>
                  <span>Dev. camión <b className="text-foreground">{fmtQty(g.totals.actual_returned)}</b></span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="text-left font-medium px-3 py-2">Producto</th>
                      <th className="text-right font-medium px-3 py-2">Cargado</th>
                      <th className="text-right font-medium px-3 py-2">Vendido</th>
                      <th className="text-right font-medium px-3 py-2">Dev. clientes</th>
                      <th className="text-right font-medium px-3 py-2">Calculado</th>
                      <th className="text-right font-medium px-3 py-2">Dev. camión</th>
                      <th className="text-right font-medium px-3 py-2">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.products.map((p) => {
                      const negativeDiff = p.difference !== 0;
                      return (
                        <tr key={p.product_id} className="border-b last:border-0">
                          <td className="px-3 py-2 truncate">
                            {p.product_name ?? p.product_id.slice(0, 8)}
                            {p.unit ? <span className="text-xs text-muted-foreground ml-1">({p.unit})</span> : null}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtQty(p.dispatched)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtQty(p.sold)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtQty(p.customer_returns)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtQty(p.on_truck)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtQty(p.actual_returned)}</td>
                          <td className={`px-3 py-2 text-right tabular-nums font-medium ${negativeDiff ? "text-destructive" : ""}`}>
                            {fmtQty(p.difference)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
