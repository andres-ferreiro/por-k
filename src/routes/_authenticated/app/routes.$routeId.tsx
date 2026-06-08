import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  getRoute, updateRoute, setRouteCustomers, listBranchDrivers,
} from "@/lib/api/routes.functions";
import { listCustomers } from "@/lib/api/customers.functions";
import { getMyContext } from "@/lib/api/context.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowUp, ArrowDown, X, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/routes/$routeId")({
  component: RouteDetailPage,
});

function RouteDetailPage() {
  const { routeId } = Route.useParams();
  const qc = useQueryClient();
  const get = useServerFn(getRoute);
  const listC = useServerFn(listCustomers);
  const drivers = useServerFn(listBranchDrivers);
  const update = useServerFn(updateRoute);
  const setStops = useServerFn(setRouteCustomers);
  const ctxFn = useServerFn(getMyContext);

  const { data: ctx } = useQuery({ queryKey: ["myContext"], queryFn: () => ctxFn() });
  const { data: route, isLoading } = useQuery({
    queryKey: ["route", routeId],
    queryFn: () => get({ data: { id: routeId } }),
  });
  const { data: allCustomers } = useQuery({
    queryKey: ["customers"],
    queryFn: () => listC(),
  });
  const { data: driverList } = useQuery({
    queryKey: ["branch-drivers", route?.branch_id ?? null],
    queryFn: () => drivers({ data: { branch_id: route?.branch_id ?? null } }),
    enabled: !!route,
  });

  const [name, setName] = useState("");
  const [driverId, setDriverId] = useState<string>("");
  const [stopIds, setStopIds] = useState<string[]>([]);

  useEffect(() => {
    if (!route) return;
    setName(route.name);
    setDriverId(route.driver_id ?? "");
    setStopIds(route.stops.map((s: any) => s.id));
  }, [route]);

  const branchCustomers = useMemo(() => {
    if (!allCustomers || !route) return [];
    return allCustomers.filter((c) => c.branch_id === route.branch_id);
  }, [allCustomers, route]);

  const stopMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of branchCustomers) m.set(c.id, c);
    return m;
  }, [branchCustomers]);

  function toggleCustomer(id: string, checked: boolean) {
    setStopIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
  }

  function move(idx: number, dir: -1 | 1) {
    setStopIds((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  const saveHeader = useMutation({
    mutationFn: () => update({ data: { id: routeId, name, driver_id: driverId || null } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["route", routeId] });
      qc.invalidateQueries({ queryKey: ["routes"] });
      toast.success("Ruta actualizada");
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const saveStops = useMutation({
    mutationFn: () => setStops({ data: { route_id: routeId, customer_ids: stopIds } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["route", routeId] });
      qc.invalidateQueries({ queryKey: ["routes"] });
      toast.success("Clientes guardados");
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  if (isLoading) return <p className="text-muted-foreground">Cargando…</p>;
  if (!route) return <p className="text-muted-foreground">Ruta no encontrada.</p>;

  const isOwner = ctx?.primaryRole === "owner";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/app/routes"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{route.name}</h1>
          <p className="text-muted-foreground">
            {isOwner && route.branch_name ? `${route.branch_name} · ` : ""}
            {stopIds.length} {stopIds.length === 1 ? "cliente" : "clientes"}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Información</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Repartidor</Label>
              <Select value={driverId || "_none"} onValueChange={(v) => setDriverId(v === "_none" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Sin asignar</SelectItem>
                  {(driverList ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.full_name ?? d.id.slice(0, 8)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Button onClick={() => saveHeader.mutate()} disabled={saveHeader.isPending || !name}>
              <Save className="h-4 w-4 mr-1" />
              {saveHeader.isPending ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Orden de visitas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stopIds.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin clientes en esta ruta todavía.</p>
            )}
            {stopIds.map((id, i) => {
              const c = stopMap.get(id);
              return (
                <div key={id} className="flex items-center gap-2 rounded-md border p-2">
                  <div className="w-6 text-center text-sm text-muted-foreground">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{c?.name ?? id.slice(0, 8)}</div>
                    {c?.address && <div className="text-xs text-muted-foreground truncate">{c.address}</div>}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => move(i, -1)} disabled={i === 0}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => move(i, 1)} disabled={i === stopIds.length - 1}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => toggleCustomer(id, false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
            <div className="pt-2">
              <Button onClick={() => saveStops.mutate()} disabled={saveStops.isPending}>
                <Save className="h-4 w-4 mr-1" />
                {saveStops.isPending ? "Guardando…" : "Guardar clientes"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Clientes disponibles</CardTitle></CardHeader>
          <CardContent>
            {branchCustomers.length === 0 && (
              <p className="text-sm text-muted-foreground">No hay clientes en esta sucursal.</p>
            )}
            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {branchCustomers.map((c) => {
                const checked = stopIds.includes(c.id);
                return (
                  <label
                    key={c.id}
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer"
                  >
                    <Checkbox checked={checked} onCheckedChange={(v) => toggleCustomer(c.id, !!v)} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{c.name}</div>
                      {c.address && <div className="text-xs text-muted-foreground truncate">{c.address}</div>}
                    </div>
                  </label>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
