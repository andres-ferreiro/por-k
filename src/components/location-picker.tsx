import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Crosshair } from "lucide-react";

// Fix default marker icons (Leaflet expects them at relative paths)
const iconUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png";
const iconRetinaUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png";
const shadowUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png";
const DefaultIcon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export interface LatLng {
  lat: number | null;
  lng: number | null;
}

export function LocationPicker({
  value,
  onChange,
}: {
  value: LatLng;
  onChange: (v: LatLng) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const initLat = value.lat ?? 14.6349;
    const initLng = value.lng ?? -90.5069; // Guatemala City default
    const map = L.map(containerRef.current).setView([initLat, initLng], value.lat ? 15 : 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);
    mapRef.current = map;
    if (value.lat != null && value.lng != null) {
      const m = L.marker([value.lat, value.lng], { icon: DefaultIcon, draggable: true }).addTo(map);
      m.on("dragend", () => {
        const ll = m.getLatLng();
        onChange({ lat: ll.lat, lng: ll.lng });
      });
      markerRef.current = m;
    }
    map.on("click", (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        const m = L.marker([lat, lng], { icon: DefaultIcon, draggable: true }).addTo(map);
        m.on("dragend", () => {
          const ll = m.getLatLng();
          onChange({ lat: ll.lat, lng: ll.lng });
        });
        markerRef.current = m;
      }
      onChange({ lat, lng });
    });
    // Ensure tiles render after dialog open
    setTimeout(() => map.invalidateSize(), 100);
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync marker if external value changes (e.g. "Use my location")
  useEffect(() => {
    if (!mapRef.current) return;
    if (value.lat != null && value.lng != null) {
      if (markerRef.current) {
        markerRef.current.setLatLng([value.lat, value.lng]);
      } else {
        const m = L.marker([value.lat, value.lng], { icon: DefaultIcon, draggable: true }).addTo(mapRef.current);
        m.on("dragend", () => {
          const ll = m.getLatLng();
          onChange({ lat: ll.lat, lng: ll.lng });
        });
        markerRef.current = m;
      }
      mapRef.current.setView([value.lat, value.lng], Math.max(mapRef.current.getZoom(), 15));
    } else if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
  }, [value.lat, value.lng, onChange]);

  function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="h-64 w-full rounded-md border overflow-hidden" />
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Latitud</Label>
          <Input
            type="number"
            step="any"
            value={value.lat ?? ""}
            onChange={(e) => onChange({ lat: e.target.value === "" ? null : Number(e.target.value), lng: value.lng })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Longitud</Label>
          <Input
            type="number"
            step="any"
            value={value.lng ?? ""}
            onChange={(e) => onChange({ lat: value.lat, lng: e.target.value === "" ? null : Number(e.target.value) })}
          />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={useMyLocation}>
          <Crosshair className="h-4 w-4 mr-1" /> Mi ubicación
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Haz clic en el mapa o arrastra el marcador para fijar la ubicación.</p>
    </div>
  );
}
