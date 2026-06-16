import { APIProvider, AdvancedMarker, Map } from "@vis.gl/react-google-maps";

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";
const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID ?? "DEMO_MAP_ID";

interface Props {
  lat: number;
  lng: number;
  className?: string;
}

export function LocationMap({ lat, lng, className }: Props) {
  if (!API_KEY) {
    return (
      <div className={`flex items-center justify-center rounded-lg border border-dashed bg-muted/30 text-sm text-muted-foreground ${className ?? "h-52"}`}>
        Mapa no disponible
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-lg border ${className ?? "h-52"}`}>
      <APIProvider apiKey={API_KEY} language="es" region="MX">
        <Map
          key={`${lat},${lng}`}
          defaultCenter={{ lat, lng }}
          defaultZoom={17}
          mapId={MAP_ID}
          gestureHandling="cooperative"
          disableDefaultUI
          className="h-full w-full"
        >
          <AdvancedMarker position={{ lat, lng }} />
        </Map>
      </APIProvider>
    </div>
  );
}
