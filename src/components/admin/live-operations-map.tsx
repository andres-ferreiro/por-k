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

function LiveMapInner({ data, routeId }: { data: LiveData; routeId: string | null }) {
  const stopsWithCoords = useMemo(
    () =>
      data.stops.filter(
        (s) => s.lat != null && s.lng != null && (!routeId || s.route_id === routeId),
      ),
    [data.stops, routeId],
  );

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

  if (!API_KEY) {
    return (
      <div className="flex h-[50svh] min-h-[240px] max-h-[480px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        Configura VITE_GOOGLE_MAPS_API_KEY para ver el mapa.
      </div>
    );
  }

  if (withCoords.length === 0) {
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
      </div>
      <div className="h-[50svh] min-h-[240px] max-h-[480px] overflow-hidden rounded-xl border">
        <APIProvider apiKey={API_KEY} language="es" region="MX">
          <LiveMapInner data={data} routeId={routeId} />
        </APIProvider>
      </div>
    </div>
  );
}
