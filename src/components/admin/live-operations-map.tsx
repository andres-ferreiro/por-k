import { useEffect, useMemo } from "react";
import { APIProvider, AdvancedMarker, Map as GoogleMap, useMap } from "@vis.gl/react-google-maps";
import type { getLiveOperations } from "@/lib/api/admin.functions";
import { cn } from "@/lib/utils";

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";
const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID ?? "DEMO_MAP_ID";

type LiveData = Awaited<ReturnType<typeof getLiveOperations>>;

const STATUS_COLOR: Record<string, string> = {
  unvisited: "bg-muted-foreground/60",
  pending: "bg-amber-500",
  delivered: "bg-emerald-500",
  failed: "bg-rose-500",
};

function MapBounds({ stops }: { stops: { lat: number; lng: number }[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map || stops.length === 0) return;
    if (stops.length === 1) {
      map.setCenter(stops[0]);
      map.setZoom(16);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    for (const s of stops) bounds.extend(s);
    map.fitBounds(bounds, 48);
  }, [map, stops]);
  return null;
}

function DriverMarker({ lat, lng, name }: { lat: number; lng: number; name: string | null }) {
  return (
    <AdvancedMarker position={{ lat, lng }}>
      <div className="flex flex-col items-center">
        <div
          className="h-5 w-5 rounded-full bg-blue-600 border-2 border-white shadow-lg flex items-center justify-center"
          title={name ?? "Repartidor"}
        >
          <svg viewBox="0 0 24 24" className="h-3 w-3 fill-white" xmlns="http://www.w3.org/2000/svg">
            <path d="M17 8C17 5.24 14.76 3 12 3S7 5.24 7 8c0 3.75 5 10 5 10s5-6.25 5-10zm-7 0c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2z"/>
          </svg>
        </div>
        {name && (
          <span className="mt-0.5 text-[10px] font-semibold text-blue-700 bg-white/90 px-1 rounded shadow whitespace-nowrap">
            {name}
          </span>
        )}
      </div>
    </AdvancedMarker>
  );
}

function LiveMapInner({ data, routeId }: { data: LiveData; routeId: string | null }) {
  const stopsWithCoords = useMemo(
    () =>
      data.stops.filter(
        (s) => s.lat != null && s.lng != null && (!routeId || s.route_id === routeId),
      ),
    [data.stops, routeId],
  );

  // Build driver name map from routes
  const driverNameByDriverId = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const r of data.routes) {
      if (r.driver_id) map.set(r.driver_id, r.driver_name);
    }
    return map;
  }, [data.routes]);

  // Filter driver locations by active routeId filter
  const driverLocs = useMemo(() => {
    const locs = data.driver_locations ?? [];
    if (!routeId) return locs;
    const driverForRoute = data.routes.find((r) => r.id === routeId)?.driver_id;
    return driverForRoute ? locs.filter((l) => l.driver_id === driverForRoute) : locs;
  }, [data.driver_locations, data.routes, routeId]);

  const center = stopsWithCoords[0]
    ? { lat: stopsWithCoords[0].lat!, lng: stopsWithCoords[0].lng! }
    : { lat: 31.6904, lng: -106.4245 };

  return (
    <GoogleMap
      defaultCenter={center}
      defaultZoom={13}
      mapId={MAP_ID}
      gestureHandling="cooperative"
      disableDefaultUI
      className="h-full w-full"
    >
      <MapBounds stops={stopsWithCoords.map((s) => ({ lat: s.lat!, lng: s.lng! }))} />
      {stopsWithCoords.map((s) => (
        <AdvancedMarker key={`${s.route_id}-${s.customer_id}`} position={{ lat: s.lat!, lng: s.lng! }}>
          <div
            className={cn(
              "h-3.5 w-3.5 rounded-full border-2 border-white shadow-md",
              STATUS_COLOR[s.status] ?? STATUS_COLOR.unvisited,
            )}
          />
        </AdvancedMarker>
      ))}
      {driverLocs.map((loc) => (
        <DriverMarker
          key={loc.driver_id}
          lat={loc.lat}
          lng={loc.lng}
          name={driverNameByDriverId.get(loc.driver_id) ?? null}
        />
      ))}
    </GoogleMap>
  );
}

export function LiveOperationsMap({
  data,
  routeId,
}: {
  data: LiveData;
  routeId: string | null;
}) {
  const withCoords = data.stops.filter((s) => s.lat != null && s.lng != null);
  const hasDriverLocs = (data.driver_locations ?? []).length > 0;

  if (!API_KEY) {
    return (
      <div className="flex h-[50svh] min-h-[240px] max-h-[480px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        Configura VITE_GOOGLE_MAPS_API_KEY para ver el mapa.
      </div>
    );
  }

  if (withCoords.length === 0 && !hasDriverLocs) {
    return (
      <div className="flex h-[50svh] min-h-[240px] max-h-[480px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        No hay clientes con ubicación guardada.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/60" /> Sin visitar</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Pendiente</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Entregado</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Fallido</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> Repartidor</span>
      </div>
      <div className="h-[50svh] min-h-[240px] max-h-[480px] overflow-hidden rounded-xl border">
        <APIProvider apiKey={API_KEY} language="es" region="MX">
          <LiveMapInner data={data} routeId={routeId} />
        </APIProvider>
      </div>
    </div>
  );
}
