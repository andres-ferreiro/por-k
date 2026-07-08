import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import JSZip from "jszip";
import { Camera01Icon, Download01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTableCard } from "@/components/admin/data-table";
import { getDeliveryPhotos } from "@/lib/api/admin.functions";
import { getPhotoViewUrls } from "@/lib/api/driver.functions";

type Filters = {
  date_from: string;
  date_to: string;
  route_id: string | null;
  driver_id: string | null;
  branch_id: string | null;
};

type PhotoRow = {
  delivery_id: string;
  delivery_date: string;
  customer_id: string;
  customer_name: string;
  photo_url: string;
};

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function buildZipFilename(dateFrom: string, dateTo: string): string {
  if (dateFrom === dateTo) return `fotos-${dateFrom}.zip`;
  return `fotos-${dateFrom}-a-${dateTo}.zip`;
}

function buildPhotoFilename(
  date: string,
  customerName: string,
  counter: number,
  ext: string,
): string {
  const base = `${date}_${slugify(customerName)}`;
  return counter > 1 ? `${base}_${counter}.${ext}` : `${base}.${ext}`;
}

async function downloadAsZip(
  photos: PhotoRow[],
  signedUrls: Record<string, string>,
  dateFrom: string,
  dateTo: string,
  onProgress: (done: number, total: number) => void,
) {
  const zip = new JSZip();
  const total = photos.length;

  // Track duplicates: same date + customer → increment counter
  const seen = new Map<string, number>();

  const tasks = photos.map(async (p, idx) => {
    const url = signedUrls[p.photo_url];
    if (!url) return;

    const key = `${p.delivery_date}_${p.customer_id}`;
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);

    const ext = (p.photo_url.split(".").pop() ?? "jpg").toLowerCase();
    const filename = buildPhotoFilename(p.delivery_date, p.customer_name, count, ext);

    try {
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      zip.file(filename, buf);
    } catch {
      // skip failed downloads silently
    }
    onProgress(idx + 1, total);
  });

  // Fetch in parallel batches of 8 to avoid overwhelming the browser
  const BATCH = 8;
  for (let i = 0; i < tasks.length; i += BATCH) {
    await Promise.all(tasks.slice(i, i + BATCH));
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = buildZipFilename(dateFrom, dateTo);
  a.click();
  URL.revokeObjectURL(a.href);
}

function Lightbox({
  src,
  caption,
  onClose,
}: {
  src: string;
  caption: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 text-white/80 hover:text-white"
        onClick={onClose}
        aria-label="Cerrar"
      >
        <Icon icon={Cancel01Icon} className="h-6 w-6" />
      </button>
      <img
        src={src}
        alt={caption}
        className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      <p className="mt-3 text-sm text-white/70">{caption}</p>
    </div>
  );
}

export function DeliveryPhotosTab({ filters }: { filters: Filters }) {
  const [customerFilter, setCustomerFilter] = useState("all");
  const [lightbox, setLightbox] = useState<{ src: string; caption: string } | null>(null);
  const [zipProgress, setZipProgress] = useState<{ done: number; total: number } | null>(null);

  const getPhotos = useServerFn(getDeliveryPhotos);
  const getViewUrls = useServerFn(getPhotoViewUrls);

  const photosQ = useQuery({
    queryKey: ["rep", "photos", filters],
    queryFn: () =>
      getPhotos({
        data: {
          branch_id: filters.branch_id,
          date_from: filters.date_from,
          date_to: filters.date_to,
        },
      }),
  });

  const photos = photosQ.data ?? [];

  // Batch-fetch signed URLs whenever photo paths change
  const paths = useMemo(() => photos.map((p) => p.photo_url), [photos]);
  const urlsQ = useQuery({
    queryKey: ["rep", "photo-urls", paths],
    queryFn: () =>
      getViewUrls({ data: { bucket: "delivery-photos" as const, paths } }),
    enabled: paths.length > 0,
  });
  const signedUrls = urlsQ.data ?? {};

  // Unique customers for the filter dropdown
  const customers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of photos) seen.set(p.customer_id, p.customer_name);
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [photos]);

  // Reset customer filter when date range changes
  useEffect(() => {
    setCustomerFilter("all");
  }, [filters.date_from, filters.date_to]);

  const filtered = useMemo(() => {
    if (customerFilter === "all") return photos;
    return photos.filter((p) => p.customer_id === customerFilter);
  }, [photos, customerFilter]);

  const handleDownloadZip = useCallback(async () => {
    setZipProgress({ done: 0, total: filtered.length });
    try {
      await downloadAsZip(
        filtered,
        signedUrls,
        filters.date_from,
        filters.date_to,
        (done, total) => setZipProgress({ done, total }),
      );
    } finally {
      setZipProgress(null);
    }
  }, [filtered, signedUrls, filters.date_from, filters.date_to]);

  const isLoading = photosQ.isLoading || (paths.length > 0 && urlsQ.isLoading);

  return (
    <DataTableCard>
      {/* Header */}
      <div className="flex flex-row items-center justify-between gap-3 px-4 py-3 border-b flex-wrap">
        <div className="text-sm font-medium">
          Fotos de entrega
          {!isLoading && filtered.length > 0 && (
            <span className="ml-2 text-muted-foreground font-normal">
              ({filtered.length} foto{filtered.length !== 1 ? "s" : ""})
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {customers.length > 0 && (
            <Select value={customerFilter} onValueChange={setCustomerFilter}>
              <SelectTrigger className="h-8 text-sm w-48">
                <SelectValue placeholder="Todos los clientes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los clientes</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            size="sm"
            variant="outline"
            disabled={filtered.length === 0 || !!zipProgress || urlsQ.isLoading}
            onClick={handleDownloadZip}
          >
            <Icon icon={Download01Icon} className="h-4 w-4 mr-1" />
            {zipProgress
              ? `Descargando ${zipProgress.done} de ${zipProgress.total}…`
              : "Descargar ZIP"}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        {isLoading && (
          <p className="text-sm text-muted-foreground py-8 text-center">Cargando fotos…</p>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Icon icon={Camera01Icon} className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium">Sin fotos de entrega</p>
            <p className="text-xs text-muted-foreground">
              No hay fotos para este rango de fechas
              {customerFilter !== "all" ? " y cliente seleccionado" : ""}.
            </p>
          </div>
        )}

        {!isLoading && filtered.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {filtered.map((p) => {
              const url = signedUrls[p.photo_url];
              const caption = `${p.customer_name} · ${p.delivery_date}`;
              return (
                <button
                  key={p.delivery_id}
                  type="button"
                  className="group relative rounded-lg overflow-hidden border bg-muted aspect-square cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => url && setLightbox({ src: url, caption })}
                  disabled={!url}
                  title={caption}
                >
                  {url ? (
                    <img
                      src={url}
                      alt={caption}
                      className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Icon icon={Camera01Icon} className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 translate-y-full group-hover:translate-y-0 transition-transform duration-200">
                    <p className="text-white text-xs truncate">{p.customer_name}</p>
                    <p className="text-white/70 text-xs">{p.delivery_date}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <Lightbox
          src={lightbox.src}
          caption={lightbox.caption}
          onClose={() => setLightbox(null)}
        />
      )}
    </DataTableCard>
  );
}
