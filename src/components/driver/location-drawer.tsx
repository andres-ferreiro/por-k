import {
  CrosshairIcon,
  Loading03Icon,
  Location01Icon,
  MapPinIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { useEffect, useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useServerFn } from "@tanstack/react-start";
import { updateCustomerLocation } from "@/lib/api/driver.functions";
import { getCustomerPhotoViewUrls } from "@/lib/api/customers.functions";
import { PhotoCapture } from "@/components/driver/photo-capture";
import { LocationMap } from "@/components/driver/location-map";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { captureCurrentLocation, reverseGeocode } from "@/lib/geocode";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: string | null;
  customer: {
    id: string;
    name: string;
    lat: number | null;
    lng: number | null;
    address: string | null;
    photo_url: string | null;
  } | null;
  canWrite: boolean;
}

type PendingLocation = { lat: number; lng: number; address: string | null };

const tabTriggerClass =
  "gap-1.5 rounded-none border-b-2 border-transparent bg-transparent py-2.5 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none";

export function LocationDrawer({ open, onOpenChange, branchId, customer, canWrite }: Props) {
  const [locating, setLocating] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [pending, setPending] = useState<PendingLocation | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);
  const qc = useQueryClient();
  const saveFn = useServerFn(updateCustomerLocation);
  const viewUrls = useServerFn(getCustomerPhotoViewUrls);

  useEffect(() => {
    if (!open || !customer) {
      setPending(null);
      setGeocoding(false);
      setPhotoPath(null);
      setExistingPhotoUrl(null);
      return;
    }
    setPending(null);
    setGeocoding(false);
    setPhotoPath(customer.photo_url);
    setExistingPhotoUrl(null);
    if (customer.photo_url) {
      viewUrls({ data: { paths: [customer.photo_url] } })
        .then((m) => setExistingPhotoUrl(m[customer.photo_url!] ?? null))
        .catch(() => {});
    }
  }, [open, customer, viewUrls]);

  const mut = useMutation({
    mutationFn: (args: PendingLocation & { photo_path: string | null }) =>
      saveFn({
        data: {
          customer_id: customer!.id,
          lat: args.lat,
          lng: args.lng,
          address: args.address,
          photo_path: args.photo_path,
        },
      }),
    onSuccess: () => {
      toast.success("Ubicación guardada.");
      qc.invalidateQueries({ queryKey: ["driver", "myRouteToday"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo guardar la ubicación."),
  });

  async function handleCapture() {
    if (!navigator.geolocation) {
      toast.error("Tu dispositivo no soporta geolocalización.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setLocating(false);
        setGeocoding(true);
        setPending({ lat, lng, address: null });
        const address = await reverseGeocode(lat, lng);
        setPending({ lat, lng, address });
        setGeocoding(false);
      },
      (err) => {
        setLocating(false);
        const msg =
          err.code === 1
            ? "Permiso de ubicación denegado. Habilítalo en tu navegador."
            : err.code === 2
              ? "No se pudo obtener la ubicación. Verifica tu señal GPS."
              : "Tiempo de espera agotado. Intenta de nuevo.";
        toast.error(msg);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }

  function handleSave() {
    if (!customer) return;
    const coords =
      pending ??
      (customer.lat != null && customer.lng != null
        ? { lat: customer.lat, lng: customer.lng, address: customer.address }
        : null);
    if (!coords) {
      toast.error("Primero captura tu ubicación GPS.");
      return;
    }
    mut.mutate({ ...coords, photo_path: photoPath });
  }

  if (!customer) return null;

  const hasLocation = customer.lat != null && customer.lng != null;
  const activeCoords = pending ?? (hasLocation ? { lat: customer.lat!, lng: customer.lng!, address: customer.address } : null);
  const displayAddress = pending
    ? geocoding
      ? null
      : pending.address
    : customer.address;
  const mapsHref = activeCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${activeCoords.lat},${activeCoords.lng}`
    : customer.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customer.address)}`
      : null;

  const photoChanged = photoPath !== (customer.photo_url ?? null);
  const hasPhoto = !!photoPath;
  const canSave =
    canWrite &&
    !locating &&
    !geocoding &&
    !mut.isPending &&
    (pending !== null || (hasLocation && photoChanged));
  const isBusy = locating || geocoding || mut.isPending;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="flex h-[96dvh] max-h-[96dvh] flex-col overflow-hidden">
        <DrawerHeader className="shrink-0 pb-0">
          <DrawerTitle className="flex items-center gap-2">
            <Icon icon={MapPinIcon} className="h-5 w-5 text-primary" />
            Ubicación
          </DrawerTitle>
          <DrawerDescription>{customer.name}</DrawerDescription>
        </DrawerHeader>

        <Tabs defaultValue="map" className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b bg-background px-4">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-0 rounded-none bg-transparent p-0">
              <TabsTrigger value="map" className={tabTriggerClass}>
                Mapa
              </TabsTrigger>
              <TabsTrigger value="photo" className={tabTriggerClass}>
                Foto referencia
                {hasPhoto && (
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    1
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pt-3 pb-2">
            <TabsContent value="map" className="mt-0 space-y-3">
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {pending ? "Ubicación capturada" : hasLocation ? "Dirección" : "Sin ubicación"}
                </div>
                {locating ? (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Icon icon={Loading03Icon} className="h-4 w-4 animate-spin" />
                    Obteniendo ubicación…
                  </p>
                ) : geocoding ? (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Icon icon={Loading03Icon} className="h-4 w-4 animate-spin" />
                    Obteniendo dirección…
                  </p>
                ) : displayAddress ? (
                  <p className="text-sm font-medium leading-snug">{displayAddress}</p>
                ) : activeCoords ? (
                  <p className="text-sm text-muted-foreground">
                    Ubicación registrada. Abre el mapa para ver el punto exacto.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    {canWrite ? "Captura tu ubicación GPS para registrar la dirección." : "Sin ubicación registrada."}
                  </p>
                )}
                {pending && hasLocation && (
                  <p className="text-xs text-muted-foreground">Reemplazará la ubicación anterior al guardar.</p>
                )}
              </div>

              {activeCoords && (
                <LocationMap lat={activeCoords.lat} lng={activeCoords.lng} className="h-56" />
              )}

              {mapsHref && (
                <Button asChild variant="outline" className="w-full h-11">
                  <a href={mapsHref} target="_blank" rel="noreferrer">
                    <Icon icon={Location01Icon} className="h-4 w-4 mr-2" />
                    Abrir en Google Maps
                  </a>
                </Button>
              )}

              {canWrite && (
                <div className="space-y-2 pt-1">
                  <Button
                    variant={hasLocation || pending ? "outline" : "default"}
                    className="w-full h-12"
                    onClick={handleCapture}
                    disabled={isBusy}
                  >
                    {locating ? (
                      <>
                        <Icon icon={Loading03Icon} className="h-4 w-4 mr-2 animate-spin" />
                        Obteniendo ubicación…
                      </>
                    ) : (
                      <>
                        <Icon icon={CrosshairIcon} className="h-4 w-4 mr-2" />
                        {hasLocation || pending ? "Actualizar mi ubicación" : "Capturar mi ubicación"}
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">
                    Usa tu GPS actual; la dirección se obtiene automáticamente.
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="photo" className="mt-0 space-y-3">
              {canWrite ? (
                <PhotoCapture
                  bucket="customer-photos"
                  branchId={branchId}
                  value={photoPath}
                  onChange={setPhotoPath}
                  previewUrl={existingPhotoUrl}
                  previewFit="contain"
                  label="Foto de la fachada o punto de referencia"
                />
              ) : existingPhotoUrl ? (
                <img
                  src={existingPhotoUrl}
                  alt="Referencia del cliente"
                  className="block w-full h-auto rounded-lg border"
                />
              ) : (
                <p className="text-sm text-center text-muted-foreground py-8">
                  Sin foto de referencia registrada.
                </p>
              )}
            </TabsContent>
          </div>
        </Tabs>

        {canWrite && (
          <div className="shrink-0 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom,1rem))]">
            <Button className="w-full h-12" onClick={handleSave} disabled={!canSave}>
              {mut.isPending ? "Guardando…" : "Guardar ubicación"}
            </Button>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
