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
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { deliveryStatusTone } from "@/lib/badge-tones";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PreorderDeliverySheet } from "@/components/driver/preorder-delivery-sheet";

const fmt = (n: number) => n.toLocaleString("es", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });

const CATEGORY_LABELS: Record<string, string> = {
  hotel: "Hotel",
  restaurant: "Restaurante",
};

type RouteData = {
  date: string;
  route: { id: string; name: string; branch_id: string; branch_name: string | null; route_mode: string };
  customers: Array<{
    position: number;
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
    category: string;
    order: { id: string; status: string; total: number; item_count: number } | null;
    delivery: { id: string; status: "pending" | "delivered" | "failed" } | null;
  }>;
};

function statusMeta(status?: "pending" | "delivered" | "failed" | null, hasOrder?: boolean) {
  if (status === "delivered") return { label: "Entregado", tone: deliveryStatusTone("delivered"), icon: CheckmarkCircle02Icon };
  if (status === "failed") return { label: "Fallido", tone: deliveryStatusTone("failed"), icon: CancelCircleIcon };
  if (status === "pending") return { label: "Pendiente", tone: deliveryStatusTone("pending"), icon: Clock01Icon };
  if (!hasOrder) return { label: "Sin pedido", tone: deliveryStatusTone(null), icon: Clock01Icon };
  return { label: "Por entregar", tone: "info" as const, icon: Clock01Icon };
}

export function PreorderRoutePage({ data }: { data: RouteData }) {
  const [deliveryFor, setDeliveryFor] = useState<RouteData["customers"][number] | null>(null);
  const [search, setSearch] = useState("");

  const total = data.customers.length;
  const done = data.customers.filter((c) => c.delivery && c.delivery.status !== "pending").length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const dateLabel = new Date(data.date + "T12:00:00Z").toLocaleDateString("es-MX", {
    weekday: "long", day: "numeric", month: "long", timeZone: "America/Ciudad_Juarez",
  });

  const query = search.trim().toLowerCase();
  const filtered = query
    ? data.customers.filter((c) => c.name.toLowerCase().includes(query))
    : data.customers;

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{dateLabel}</div>
        <h1>{data.route.name}</h1>
        <p className="text-sm text-muted-foreground">Ruta de pedidos · Hoteles y restaurantes</p>
      </div>

      <Card>
        <CardContent className="py-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-muted-foreground">Entregados</span>
            <span>
              <span className="font-bold tabular-nums">{done}</span>
              <span className="text-muted-foreground tabular-nums"> / {total}</span>
              <span className="text-muted-foreground tabular-nums ml-1">({pct}%)</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </CardContent>
      </Card>

      <div className="relative">
        <Icon icon={Search01Icon} className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente…"
          className="pl-9 pr-9"
        />
        {search && (
          <button type="button" onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <Icon icon={Cancel01Icon} className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="space-y-3">
        {filtered.map((c, idx) => {
          const meta = statusMeta(c.delivery?.status, !!c.order);
          const mapHref = c.lat != null && c.lng != null
            ? `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`
            : c.address
            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`
            : null;

          return (
            <Card key={c.id} className="overflow-hidden">
              <CardContent className="py-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold leading-tight">{c.name}</div>
                        <StatusBadge tone="neutral" className="text-[10px] mt-1 normal-case tracking-normal">
                          {CATEGORY_LABELS[c.category] ?? c.category}
                        </StatusBadge>
                      </div>
                      <StatusBadge tone={meta.tone} className="shrink-0 normal-case tracking-normal">
                        <Icon icon={meta.icon} className="h-3 w-3 mr-1" />
                        {meta.label}
                      </StatusBadge>
                    </div>
                    {c.address && <div className="text-sm text-muted-foreground mt-1 line-clamp-1">{c.address}</div>}
                    {c.order && (
                      <div className="text-sm mt-2">
                        <span className="font-medium tabular-nums">{fmt(c.order.total)}</span>
                        <span className="text-muted-foreground"> · {c.order.item_count} productos</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {mapHref && (
                    <Button asChild variant="outline" size="sm" className="flex-1 min-w-[120px]">
                      <a href={mapHref} target="_blank" rel="noreferrer">
                        <Icon icon={MapPinIcon} className="h-4 w-4" /> Mapa
                      </a>
                    </Button>
                  )}
                  {c.phone && (
                    <Button asChild variant="outline" size="sm" className="flex-1 min-w-[120px]">
                      <a href={`tel:${c.phone}`}>
                        <Icon icon={CallIcon} className="h-4 w-4" /> Llamar
                      </a>
                    </Button>
                  )}
                </div>

                <Button
                  onClick={() => setDeliveryFor(c)}
                  className="w-full h-11"
                  disabled={!c.order}
                  variant={c.delivery?.status === "delivered" ? "outline" : "default"}
                >
                  <Icon icon={PackageDelivered01Icon} className="h-4 w-4" />
                  {!c.order ? "Sin pedido" : c.delivery?.status === "delivered" ? "Ver entrega" : "Confirmar entrega"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <PreorderDeliverySheet
        open={!!deliveryFor}
        onOpenChange={(o) => !o && setDeliveryFor(null)}
        customer={deliveryFor ? { id: deliveryFor.id, name: deliveryFor.name } : null}
      />
    </div>
  );
}

export function PreorderRouteLoading() {
  return (
    <div className="flex items-center justify-center py-20">
      <Icon icon={Loading03Icon} className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
