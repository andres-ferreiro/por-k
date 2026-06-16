import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyRouteToday } from "@/lib/api/driver.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Loading03Icon,
  MapPinIcon,
  PackageDelivered01Icon,
  CallIcon,
  Cancel01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { DeliverySheet } from "@/components/driver/delivery-sheet";
import { LocationDrawer } from "@/components/driver/location-drawer";

export const Route = createFileRoute("/_authenticated/driver/")({
  component: Page,
});

type Customer = NonNullable<ReturnType<typeof useMyRoute>["data"]>["customers"][number];

function useMyRoute() {
  const fetcher = useServerFn(getMyRouteToday);
  return useQuery({
    queryKey: ["driver", "myRouteToday"],
    queryFn: () => fetcher(),
  });
}

function statusMeta(status?: "pending" | "delivered" | "failed" | null) {
  if (status === "delivered") return { label: "Entregado", cls: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: CheckmarkCircle02Icon };
  if (status === "failed") return { label: "Fallido", cls: "bg-rose-100 text-rose-800 border-rose-200", icon: CancelCircleIcon };
  if (status === "pending") return { label: "Pendiente", cls: "bg-amber-100 text-amber-800 border-amber-200", icon: Clock01Icon };
  return { label: "Sin marcar", cls: "bg-muted text-muted-foreground border", icon: Clock01Icon };
}

function Page() {
  const { data, isLoading } = useMyRoute();
  const [deliveryFor, setDeliveryFor] = useState<Customer | null>(null);
  const [locationFor, setLocationFor] = useState<Customer | null>(null);
  const [search, setSearch] = useState("");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Icon icon={Loading03Icon} className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data?.route) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-2">
          <Icon icon={MapPinIcon} className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="font-medium">Sin ruta asignada</p>
          <p className="text-sm text-muted-foreground">Pide a tu supervisor que te asigne una ruta.</p>
        </CardContent>
      </Card>
    );
  }

  const total = data.customers.length;
  const done = data.customers.filter((c) => c.delivery && c.delivery.status !== "pending").length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const dateLabel = new Date(data.date + "T12:00:00Z").toLocaleDateString("es-MX", {
    weekday: "long", day: "numeric", month: "long", timeZone: "America/Ciudad_Juarez",
  });

  const canWrite = data.driver_location_enabled ?? false;

  const query = search.trim().toLowerCase();
  const filtered = query
    ? data.customers.filter((c) => c.name.toLowerCase().includes(query))
    : data.customers;

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{dateLabel}</div>
        <h1>{data.route.name}</h1>
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="py-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-muted-foreground">Visitados</span>
            <span>
              <span className="font-bold text-foreground tabular-nums">{done}</span>
              <span className="text-muted-foreground tabular-nums"> / {total}</span>
              <span className="text-muted-foreground tabular-nums ml-1">({pct}%)</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative">
        <Icon icon={Search01Icon} className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente…"
          className="pl-9 pr-9"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <Icon icon={Cancel01Icon} className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Customer list */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {query ? `Sin resultados para "${search}"` : "Esta ruta aún no tiene clientes."}
            </CardContent>
          </Card>
        )}
        {filtered.map((c, idx) => {
          const meta = statusMeta(c.delivery?.status);
          const hasCoords = c.lat != null && c.lng != null;
          const mapHref = hasCoords
            ? `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`
            : c.address
            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`
            : null;

          return (
            <Card key={c.id} className="overflow-hidden">
              <CardContent className="py-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                    {query ? c.position + 1 : idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold leading-tight">{c.name}</div>
                      <Badge variant="outline" className={`shrink-0 ${meta.cls}`}>
                        <Icon icon={meta.icon} className="h-3 w-3 mr-1" />
                        {meta.label}
                      </Badge>
                    </div>
                    {c.address && <div className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{c.address}</div>}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {/* Location button — opens drawer when canWrite, otherwise opens Maps directly */}
                  {(canWrite || mapHref) && (
                    canWrite ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 min-w-[120px]"
                        onClick={() => setLocationFor(c)}
                      >
                        <Icon icon={MapPinIcon} className="h-4 w-4" />
                        {hasCoords ? "Ubicación" : "Registrar ubicación"}
                      </Button>
                    ) : mapHref ? (
                      <Button asChild variant="outline" size="sm" className="flex-1 min-w-[120px]">
                        <a href={mapHref} target="_blank" rel="noreferrer">
                          <Icon icon={MapPinIcon} className="h-4 w-4" /> Ubicación
                        </a>
                      </Button>
                    ) : null
                  )}
                  {c.phone && (
                    <Button asChild variant="outline" size="sm" className="flex-1 min-w-[120px]">
                      <a href={`tel:${c.phone}`}>
                        <Icon icon={CallIcon} className="h-4 w-4" /> Llamar
                      </a>
                    </Button>
                  )}
                </div>

                <Button onClick={() => setDeliveryFor(c)} className="w-full h-11">
                  <Icon icon={PackageDelivered01Icon} className="h-4 w-4" /> Vender / Entregar
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <DeliverySheet
        open={!!deliveryFor}
        onOpenChange={(o) => !o && setDeliveryFor(null)}
        customer={deliveryFor ? { id: deliveryFor.id, name: deliveryFor.name } : null}
        autoLocationOnSell={canWrite}
      />

      <LocationDrawer
        open={!!locationFor}
        onOpenChange={(o) => !o && setLocationFor(null)}
        branchId={data.route.branch_id}
        customer={locationFor}
        canWrite={canWrite}
      />
    </div>
  );
}
