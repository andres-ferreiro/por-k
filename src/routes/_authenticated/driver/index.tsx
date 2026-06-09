import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyRouteToday } from "@/lib/api/driver.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Phone, CheckCircle2, Clock, XCircle, PackageCheck, Wallet, Loader2 } from "lucide-react";
import { DeliverySheet } from "@/components/driver/delivery-sheet";
import { PaymentSheet } from "@/components/driver/payment-sheet";

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
  if (status === "delivered") return { label: "Entregado", cls: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: CheckCircle2 };
  if (status === "failed") return { label: "Fallido", cls: "bg-rose-100 text-rose-800 border-rose-200", icon: XCircle };
  if (status === "pending") return { label: "Pendiente", cls: "bg-amber-100 text-amber-800 border-amber-200", icon: Clock };
  return { label: "Sin marcar", cls: "bg-muted text-muted-foreground border", icon: Clock };
}

function Page() {
  const { data, isLoading } = useMyRoute();
  const [deliveryFor, setDeliveryFor] = useState<Customer | null>(null);
  const [paymentFor, setPaymentFor] = useState<Customer | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data?.route) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-2">
          <MapPin className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="font-medium">Sin ruta asignada</p>
          <p className="text-sm text-muted-foreground">Pide a tu supervisor que te asigne una ruta.</p>
        </CardContent>
      </Card>
    );
  }

  const total = data.customers.length;
  const done = data.customers.filter((c) => c.delivery && c.delivery.status !== "pending").length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const dateLabel = new Date(data.date + "T00:00:00").toLocaleDateString("es", {
    weekday: "long", day: "numeric", month: "long",
  });

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{dateLabel}</div>
        <h1 className="text-2xl font-bold">{data.route.name}</h1>
      </div>

      <Card>
        <CardContent className="py-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Progreso</span>
            <span>
              <span className="font-bold text-foreground">{done}</span>
              <span className="text-muted-foreground"> / {total}</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {data.customers.length === 0 && (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
            Esta ruta aún no tiene clientes.
          </CardContent></Card>
        )}
        {data.customers.map((c, idx) => {
          const meta = statusMeta(c.delivery?.status);
          const Icon = meta.icon;
          const mapHref = c.lat != null && c.lng != null
            ? `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`
            : c.address
            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`
            : null;
          return (
            <Card key={c.id} className="overflow-hidden">
              <CardContent className="py-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold leading-tight">{c.name}</div>
                      <Badge variant="outline" className={`shrink-0 ${meta.cls}`}>
                        <Icon className="h-3 w-3 mr-1" />
                        {meta.label}
                      </Badge>
                    </div>
                    {c.address && <div className="text-sm text-muted-foreground mt-0.5">{c.address}</div>}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {mapHref && (
                    <Button asChild variant="outline" size="sm" className="flex-1 min-w-[120px]">
                      <a href={mapHref} target="_blank" rel="noreferrer">
                        <MapPin className="h-4 w-4" /> Ubicación
                      </a>
                    </Button>
                  )}
                  {c.phone && (
                    <Button asChild variant="outline" size="sm" className="flex-1 min-w-[120px]">
                      <a href={`tel:${c.phone}`}>
                        <Phone className="h-4 w-4" /> Llamar
                      </a>
                    </Button>
                  )}
                </div>

                <Button onClick={() => setDeliveryFor(c)} className="w-full h-11">
                  <PackageCheck className="h-4 w-4" /> Vender / Entregar
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
      />
      <PaymentSheet
        open={!!paymentFor}
        onOpenChange={(o) => !o && setPaymentFor(null)}
        customer={paymentFor ? { id: paymentFor.id, name: paymentFor.name } : null}
      />
    </div>
  );
}

