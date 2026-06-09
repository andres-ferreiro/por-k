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
} from "@/lib/api/dispatches.functions";
import { listBranchDrivers } from "@/lib/api/routes.functions";
import { getMyContext } from "@/lib/api/context.functions";
import { APP_LOCALE, APP_TZ, todayInTZ } from "@/lib/tz";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2, Send, Eye } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/dispatch")({
  component: DispatchPage,
});

interface ItemRow {
  product_id: string;
  quantity: string; // keep as string while typing
}

function DispatchPage() {
  const ctxFn = useServerFn(getMyContext);
  const { data: ctx } = useQuery({ queryKey: ["myContext"], queryFn: () => ctxFn() });

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Despacho</h1>
        <p className="text-muted-foreground">Registra el producto que sale con cada repartidor.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NewDispatchCard />
        <DailySummaryCard />
      </div>
    </div>
  );
}

function NewDispatchCard() {
  const qc = useQueryClient();
  const routesFn = useServerFn(listRoutesForDispatch);
  const productsFn = useServerFn(listProductsActive);
  const driversFn = useServerFn(listBranchDrivers);
  const createFn = useServerFn(createDispatch);

  const { data: routes } = useQuery({ queryKey: ["dispatch", "routes"], queryFn: () => routesFn() });
  const { data: products } = useQuery({ queryKey: ["dispatch", "products"], queryFn: () => productsFn() });
  const { data: drivers } = useQuery({
    queryKey: ["dispatch", "drivers"],
    queryFn: () => driversFn({ data: { branch_id: null } }),
  });

  const [routeId, setRouteId] = useState<string>("");
  const [driverId, setDriverId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [items, setItems] = useState<ItemRow[]>([{ product_id: "", quantity: "" }]);

  // Auto-fill driver when route changes
  useEffect(() => {
    if (!routeId || !routes) return;
    const r = routes.find((x) => x.id === routeId);
    if (r?.driver_id) setDriverId(r.driver_id);
  }, [routeId, routes]);

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
      const parsedItems = items
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
      setItems([{ product_id: "", quantity: "" }]);
      qc.invalidateQueries({ queryKey: ["dispatches", "today"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al registrar"),
  });

  const canSubmit =
    !!routeId && !!driverId && items.some((i) => i.product_id && Number(i.quantity) > 0) && !mut.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nuevo despacho</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
            <Select value={driverId} onValueChange={setDriverId}>
              <SelectTrigger><SelectValue placeholder="Selecciona repartidor" /></SelectTrigger>
              <SelectContent>
                {(drivers ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.full_name ?? d.id.slice(0, 8)}</SelectItem>
                ))}
                {(drivers?.length ?? 0) === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">No hay repartidores.</div>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Productos</Label>
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus className="h-4 w-4 mr-1" /> Agregar
            </Button>
          </div>
          {items.map((row, idx) => {
            const product = products?.find((p) => p.id === row.product_id);
            return (
              <div key={idx} className="flex items-end gap-2">
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
                <div className="w-28">
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
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
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
          <Send className="h-4 w-4 mr-1" />
          {mut.isPending ? "Registrando…" : "Registrar despacho"}
        </Button>
      </CardContent>
    </Card>
  );
}

function todayStr() {
  return todayInTZ();
}

function DailySummaryCard() {
  const listFn = useServerFn(listDispatchesToday);
  const [date, setDate] = useState<string>(todayStr());
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: list, isLoading } = useQuery({
    queryKey: ["dispatches", "today", date],
    queryFn: () => listFn({ data: { date } }),
  });

  const totals = useMemo(() => {
    const rows = list ?? [];
    const routes = new Set(rows.map((r) => r.route_id));
    const units = rows.reduce((acc, r) => acc + Number(r.total_units || 0), 0);
    return { count: rows.length, routes: routes.size, units };
  }, [list]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Resumen del día</CardTitle>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value || todayStr())}
          className="w-40"
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Despachos" value={totals.count} />
          <Stat label="Rutas" value={totals.routes} />
          <Stat label="Unidades" value={totals.units} />
        </div>

        <div className="space-y-2 max-h-[420px] overflow-y-auto">
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
                className="flex items-center gap-3 rounded-md border p-3"
              >
                <div className="w-14 text-sm font-medium tabular-nums">{time}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{r.route_name ?? "Ruta"}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.driver_name ?? "—"} · {r.line_count} {r.line_count === 1 ? "línea" : "líneas"} · {r.total_units} u
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setOpenId(r.id)}>
                  <Eye className="h-4 w-4" />
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
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
            <div className="grid grid-cols-2 gap-3 text-sm">
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
                      {it.quantity} {it.unit ?? ""}
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
