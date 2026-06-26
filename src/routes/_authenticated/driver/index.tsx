import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyRouteToday } from "@/lib/api/driver.functions";
import { getMyDispatchStock } from "@/lib/api/dispatches.functions";
import { Card, CardContent } from "@/components/ui/card";
import { deliveryStatusTone } from "@/lib/badge-tones";
import { StatusBadge } from "@/components/admin/status-badge";
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
import { PreorderRoutePage, PreorderRouteLoading } from "@/components/driver/preorder-route-page";

export const Route = createFileRoute("/_authenticated/driver/")({
  component: Page,
});

const fmt = (n: number) => n.toLocaleString("es", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });

type Customer = NonNullable<ReturnType<typeof useMyRoute>["data"]>["customers"][number];

function useMyRoute() {
  const fetcher = useServerFn(getMyRouteToday);
  return useQuery({
    queryKey: ["driver", "myRouteToday"],
    queryFn: () => fetcher(),
  });
}

function statusMeta(status?: "pending" | "delivered" | "failed" | null) {
  if (status === "delivered") return { label: "Entregado", tone: deliveryStatusTone("delivered") as const, icon: CheckmarkCircle02Icon };
  if (status === "failed") return { label: "Fallido", tone: deliveryStatusTone("failed") as const, icon: CancelCircleIcon };
  if (status === "pending") return { label: "Pendiente", tone: deliveryStatusTone("pending") as const, icon: Clock01Icon };
  return { label: "Sin marcar", tone: deliveryStatusTone(null) as const, icon: Clock01Icon };
}

function hasPreorderWork(
  customers: Array<{ order?: unknown; delivery?: unknown }> | undefined,
) {
  return (customers ?? []).some((c) => c.order || c.delivery);
}

function Page() {
  const { data, isLoading } = useMyRoute();
  const [mode, setMode] = useState<"dispatch" | "preorder">("dispatch");

  const showDispatch = !!data?.dispatch?.route && !!data.dispatch.can_work;
  const preorderCustomers = data?.preorder?.customers ?? [];
  const showPreorder = !!data?.preorder?.route && hasPreorderWork(preorderCustomers);
  const preorderPending = preorderCustomers.some(
    (c) => c.order && c.delivery?.status !== "delivered" && c.delivery?.status !== "failed",
  );

  useEffect(() => {
    if (!showDispatch && showPreorder) setMode("preorder");
    else if (showDispatch && !showPreorder) setMode("dispatch");
  }, [showDispatch, showPreorder]);

  if (isLoading) return <PreorderRouteLoading />;

  if (!showDispatch && !showPreorder) {
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

  const showToggle = showDispatch && showPreorder;

  return (
    <div className="space-y-4">
      {showToggle && (
        <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-lg">
          <Button
            type="button"
            variant={mode === "dispatch" ? "default" : "ghost"}
            size="sm"
            className="h-9"
            onClick={() => setMode("dispatch")}
          >
            Despacho
          </Button>
          <Button
            type="button"
            variant={mode === "preorder" ? "default" : "ghost"}
            size="sm"
            className="h-9 relative"
            onClick={() => setMode("preorder")}
          >
            Pedidos
            {preorderPending && mode !== "preorder" && (
              <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-blue-500" />
            )}
          </Button>
        </div>
      )}

      {mode === "preorder" && showPreorder ? (
        <PreorderRoutePage data={{ date: data!.date, route: data!.preorder!.route, customers: data!.preorder!.customers }} />
      ) : showDispatch ? (
        <DispatchRoutePage
          data={{
            date: data!.date,
            route: data!.dispatch!.route,
            customers: data!.dispatch!.customers,
            driver_location_enabled: data!.dispatch!.driver_location_enabled,
            can_work: data!.dispatch!.can_work,
            require_dispatch: data!.dispatch!.require_dispatch,
          }}
        />
      ) : showPreorder ? (
        <PreorderRoutePage data={{ date: data!.date, route: data!.preorder!.route, customers: data!.preorder!.customers }} />
      ) : null}
    </div>
  );
}

function DispatchRoutePage({ data }: {
  data: {
    date: string;
    route: NonNullable<NonNullable<ReturnType<typeof useMyRoute>["data"]>["dispatch"]>["route"];
    customers: NonNullable<NonNullable<ReturnType<typeof useMyRoute>["data"]>["dispatch"]>["customers"];
    driver_location_enabled: boolean;
    can_work: boolean;
    require_dispatch: boolean;
  };
}) {
  const getStock = useServerFn(getMyDispatchStock);
  const stockQ = useQuery({
    queryKey: ["driver", "dispatchStock"],
    queryFn: () => getStock({ data: {} }),
    staleTime: 30_000,
  });
  const outOfStock =
    (stockQ.data?.has_loaded_stock ?? false) && (stockQ.data?.total_units ?? 1) === 0;
  const [deliveryFor, setDeliveryFor] = useState<Customer | null>(null);
  const [locationFor, setLocationFor] = useState<Customer | null>(null);
  const [search, setSearch] = useState("");

  if (!data?.route) return null;
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

      {/* Out-of-stock banner */}
      {outOfStock && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-800 px-4 py-3 text-sm font-medium text-rose-700 dark:text-rose-400 text-center">
          Ya vendiste todo el producto cargado hoy. Regresa a cargar para poder seguir vendiendo.
        </div>
      )}

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
                      <div className="flex items-center gap-1.5 shrink-0">
                        {c.pending_balance > 0 && (
                          <StatusBadge tone="danger" className="shrink-0 text-[10px] px-1.5 normal-case tracking-normal">
                            {fmt(c.pending_balance)} pend.
                          </StatusBadge>
                        )}
                        <StatusBadge tone={meta.tone} className="shrink-0 normal-case tracking-normal">
                          <Icon icon={meta.icon} className="h-3 w-3 mr-1" />
                          {meta.label}
                        </StatusBadge>
                      </div>
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
        customer={deliveryFor ? { id: deliveryFor.id, name: deliveryFor.name, pending_balance: deliveryFor.pending_balance } : null}
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
