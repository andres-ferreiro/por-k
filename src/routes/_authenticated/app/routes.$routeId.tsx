import { ArrowLeft01Icon, SaveIcon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  getRoute, updateRoute, setRouteCustomers, listBranchDrivers,
} from "@/lib/api/routes.functions";
import { listCustomers, listCustomerImportBatches } from "@/lib/api/customers.functions";
import { getMyContext } from "@/lib/api/context.functions";
import { RouteStopsEditor } from "@/components/admin/route-stops-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/routes/$routeId")({
  component: RouteDetailPage,
});

function RouteDetailPage() {
  const { routeId } = Route.useParams();
  const qc = useQueryClient();
  const get = useServerFn(getRoute);
  const listC = useServerFn(listCustomers);
  const listBatches = useServerFn(listCustomerImportBatches);
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
  const { data: importBatches } = useQuery({
    queryKey: ["customer-import-batches", route?.branch_id ?? null],
    queryFn: () => listBatches({ data: { branch_id: route?.branch_id ?? null } }),
    enabled: !!route?.branch_id,
  });

  const [name, setName] = useState("");
  const [driverId, setDriverId] = useState<string>("");
  const [stopIds, setStopIds] = useState<string[]>([]);
  const [savedStopIds, setSavedStopIds] = useState<string[]>([]);
  const [savedName, setSavedName] = useState("");
  const [savedDriverId, setSavedDriverId] = useState("");

  useEffect(() => {
    if (!route) return;
    const ids = route.stops.map((s: { id: string }) => s.id);
    setName(route.name);
    setDriverId(route.driver_id ?? "");
    setStopIds(ids);
    setSavedStopIds(ids);
    setSavedName(route.name);
    setSavedDriverId(route.driver_id ?? "");
  }, [route]);

  const branchCustomers = useMemo(() => {
    if (!allCustomers || !route) return [];
    return allCustomers.filter((c) => c.branch_id === route.branch_id);
  }, [allCustomers, route]);

  const stopsDirty = useMemo(
    () => stopIds.length !== savedStopIds.length || stopIds.some((id, i) => id !== savedStopIds[i]),
    [stopIds, savedStopIds],
  );
  const headerDirty = name !== savedName || driverId !== savedDriverId;
  const isDirty = stopsDirty || headerDirty;

  const saveAll = useMutation({
    mutationFn: async () => {
      if (headerDirty) {
        await update({ data: { id: routeId, name, driver_id: driverId || null } });
      }
      if (stopsDirty) {
        await setStops({ data: { route_id: routeId, customer_ids: stopIds } });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["route", routeId] });
      qc.invalidateQueries({ queryKey: ["routes"] });
      setSavedStopIds([...stopIds]);
      setSavedName(name);
      setSavedDriverId(driverId);
      toast.success("Ruta guardada");
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  if (isLoading) return <p className="text-muted-foreground">Cargando…</p>;
  if (!route) return <p className="text-muted-foreground">Ruta no encontrada.</p>;

  const isOwner = ctx?.primaryRole === "owner";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/app/routes"><Icon icon={ArrowLeft01Icon} className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{route.name}</h1>
            <p className="text-muted-foreground">
              {isOwner && route.branch_name ? `${route.branch_name} · ` : ""}
              {stopIds.length} {stopIds.length === 1 ? "cliente" : "clientes"}
              {isDirty && <span className="text-amber-600"> · Cambios sin guardar</span>}
            </p>
          </div>
        </div>
        <Button
          onClick={() => saveAll.mutate()}
          disabled={!isDirty || saveAll.isPending || !name}
        >
          <Icon icon={SaveIcon} className="h-4 w-4 mr-1" />
          {saveAll.isPending ? "Guardando…" : "Guardar ruta"}
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Información</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        </CardContent>
      </Card>

      <RouteStopsEditor
        customers={branchCustomers}
        importBatches={importBatches ?? []}
        stopIds={stopIds}
        onStopIdsChange={setStopIds}
      />
    </div>
  );
}
