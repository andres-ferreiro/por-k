import { CrosshairIcon } from "@hugeicons/core-free-icons";
import {
  APIProvider,
  AdvancedMarker,
  Map,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/ui/icon";

// Ciudad Juárez, Chihuahua
const DEFAULT_CENTER = { lat: 31.6904, lng: -106.4245 };
const DEFAULT_ZOOM = 12;
const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";
const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID ?? "DEMO_MAP_ID";

export interface LatLng {
  lat: number | null;
  lng: number | null;
}

function readCoord(value: google.maps.LatLng | google.maps.LatLngLiteral): number {
  if (typeof (value as google.maps.LatLng).lat === "function") {
    return (value as google.maps.LatLng).lat();
  }
  return (value as google.maps.LatLngLiteral).lat;
}

function readLng(value: google.maps.LatLng | google.maps.LatLngLiteral): number {
  if (typeof (value as google.maps.LatLng).lng === "function") {
    return (value as google.maps.LatLng).lng();
  }
  return (value as google.maps.LatLngLiteral).lng;
}

function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const listener = map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (e.latLng) onClick(e.latLng.lat(), e.latLng.lng());
    });
    return () => listener.remove();
  }, [map, onClick]);
  return null;
}

function MapViewport({ lat, lng }: { lat: number | null; lng: number | null }) {
  const map = useMap();
  useEffect(() => {
    if (!map || lat == null || lng == null) return;
    map.panTo({ lat, lng });
    if ((map.getZoom() ?? 0) < 15) map.setZoom(15);
  }, [map, lat, lng]);
  return null;
}

function AddressSearch({
  onSelect,
  onError,
}: {
  onSelect: (lat: number, lng: number, address?: string) => void;
  onError: (message: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const places = useMapsLibrary("places");

  useEffect(() => {
    if (!places || !containerRef.current) return;

    const autocomplete = new places.PlaceAutocompleteElement({
      includedRegionCodes: ["mx"],
      locationBias: {
        center: DEFAULT_CENTER,
        radius: 80_000,
      },
      requestedLanguage: "es",
      requestedRegion: "mx",
    });
    autocomplete.placeholder = "Escribe una dirección…";

    const handleSelect = async (event: Event) => {
      try {
        const selectEvent = event as google.maps.places.PlacePredictionSelectEvent;
        const place = selectEvent.placePrediction.toPlace();
        await place.fetchFields({ fields: ["location", "formattedAddress"] });
        const loc = place.location;
        if (loc) {
          onSelect(readCoord(loc), readLng(loc), place.formattedAddress ?? undefined);
        }
      } catch {
        onError("No se pudo obtener la ubicación de la dirección seleccionada.");
      }
    };

    const handleError = () => {
      onError(
        "Error en la búsqueda. Verifica que Places API (New) esté habilitada y que la facturación esté activa en Google Cloud.",
      );
    };

    autocomplete.addEventListener("gmp-select", handleSelect);
    autocomplete.addEventListener("gmp-error", handleError);
    containerRef.current.replaceChildren(autocomplete);

    return () => {
      autocomplete.removeEventListener("gmp-select", handleSelect);
      autocomplete.removeEventListener("gmp-error", handleError);
      autocomplete.remove();
    };
  }, [places, onSelect, onError]);

  return (
    <div className="space-y-1">
      <Label className="text-xs">Buscar dirección</Label>
      <div ref={containerRef} className="gmp-autocomplete-host" />
    </div>
  );
}

function LocationPickerInner({
  value,
  onChange,
  onAddressSelect,
}: {
  value: LatLng;
  onChange: (v: LatLng) => void;
  onAddressSelect?: (address: string) => void;
}) {
  const [searchError, setSearchError] = useState<string | null>(null);

  const center =
    value.lat != null && value.lng != null
      ? { lat: value.lat, lng: value.lng }
      : DEFAULT_CENTER;
  const zoom = value.lat != null && value.lng != null ? 15 : DEFAULT_ZOOM;

  const handlePlaceSelect = useCallback(
    (lat: number, lng: number, address?: string) => {
      setSearchError(null);
      onChange({ lat, lng });
      if (address && onAddressSelect) onAddressSelect(address);
    },
    [onChange, onAddressSelect],
  );

  const handleMapClick = useCallback(
    (lat: number, lng: number) => onChange({ lat, lng }),
    [onChange],
  );

  function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  return (
    <div className="space-y-3">
      <AddressSearch onSelect={handlePlaceSelect} onError={setSearchError} />
      {searchError && (
        <p className="text-xs text-destructive">{searchError}</p>
      )}

      <div className="h-64 w-full overflow-hidden rounded-md border">
        <Map
          defaultCenter={center}
          defaultZoom={zoom}
          mapId={MAP_ID}
          gestureHandling="greedy"
          disableDefaultUI
          zoomControl
          className="h-full w-full"
        >
          <MapClickHandler onClick={handleMapClick} />
          <MapViewport lat={value.lat} lng={value.lng} />
          {value.lat != null && value.lng != null && (
            <AdvancedMarker
              position={{ lat: value.lat, lng: value.lng }}
              draggable
              onDragEnd={(e) => {
                const latLng = e.latLng;
                if (latLng) onChange({ lat: latLng.lat(), lng: latLng.lng() });
              }}
            />
          )}
        </Map>
      </div>

      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Latitud</Label>
          <Input
            type="number"
            step="any"
            value={value.lat ?? ""}
            onChange={(e) =>
              onChange({
                lat: e.target.value === "" ? null : Number(e.target.value),
                lng: value.lng,
              })
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Longitud</Label>
          <Input
            type="number"
            step="any"
            value={value.lng ?? ""}
            onChange={(e) =>
              onChange({
                lat: value.lat,
                lng: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={useMyLocation}>
          <Icon icon={CrosshairIcon} className="mr-1 h-4 w-4" /> Mi ubicación
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Busca una dirección, haz clic en el mapa, arrastra el marcador o ingresa coordenadas.
      </p>
    </div>
  );
}

export function LocationPicker({
  value,
  onChange,
  onAddressSelect,
}: {
  value: LatLng;
  onChange: (v: LatLng) => void;
  onAddressSelect?: (address: string) => void;
}) {
  const [apiError, setApiError] = useState<string | null>(null);

  if (!API_KEY) {
    return (
      <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        Configura <code className="text-xs">VITE_GOOGLE_MAPS_API_KEY</code> en tu archivo{" "}
        <code className="text-xs">.env</code> para usar Google Maps.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {apiError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {apiError}
        </p>
      )}
      <APIProvider
        apiKey={API_KEY}
        libraries={["places"]}
        region="MX"
        language="es"
        onError={() =>
          setApiError(
            "Google Maps no pudo cargar. Habilita Maps JavaScript API y Places API (New), activa la facturación, y revisa las restricciones de tu API key.",
          )
        }
      >
        <LocationPickerInner
          value={value}
          onChange={onChange}
          onAddressSelect={onAddressSelect}
        />
      </APIProvider>
    </div>
  );
}
