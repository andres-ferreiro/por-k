import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listTodayDeliveries, getMyRouteToday } from "@/lib/api/driver.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, XCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { DeliverySheet } from "@/components/driver/delivery-sheet";

export const Route = createFileRoute("/_authenticated/driver/deliveries")({
  component: Page,
});

function Page() {
  const fetcher = useServerFn(listTodayDeliveries);
  const fetchRoute = useServerFn(getMyRouteToday);
  const { data, isLoading } = useQuery({
    queryKey: ["driver", "deliveriesToday"],
    queryFn: () => fetcher(),
  });
  const { data: route } = useQuery({
    queryKey: ["driver", "myRouteToday"],
    queryFn: () => fetchRoute(),
  });

  const [selected, setSelected] = useState<{ id: string; name: string; status: any; comment: string | null; photo_url: string | null } | null>(null);

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const rows = data ?? [];
  const counts = {
    delivered: rows.filter((r) => r.status === "delivered").length,
    pending: rows.filter((r) => r.status === "pending").length,
    failed: rows.filter((r) => r.status === "failed").length,
  };

  // Allow editing only if the customer is in today's route
  const customerInRoute = (id: string) => route?.customers.find((c) => c.id === id);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Entregas de hoy</h1>

      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Entregados" value={counts.delivered} cls="bg-emerald-50 text-emerald-800" icon={CheckCircle2} />
        <StatCard label="Pendientes" value={counts.pending} cls="bg-amber-50 text-amber-800" icon={Clock} />
        <StatCard label="Fallidos" value={counts.failed} cls="bg-rose-50 text-rose-800" icon={XCircle} />
      </div>

      {rows.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          Aún no registras entregas hoy.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const canEdit = !!customerInRoute(r.customer_id);
            const meta = r.status === "delivered"
              ? { label: "Entregado", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" }
              : r.status === "failed"
              ? { label: "Fallido", cls: "bg-rose-100 text-rose-800 border-rose-200" }
              : { label: "Pendiente", cls: "bg-amber-100 text-amber-800 border-amber-200" };
            return (
              <Card
                key={r.id}
                className={canEdit ? "cursor-pointer hover:bg-accent/40 transition" : ""}
                onClick={() => canEdit && setSelected({
                  id: r.customer_id,
                  name: r.customer_name ?? "",
                  status: r.status,
                  comment: r.comment,
                  photo_url: r.photo_url,
                })}
              >
                <CardContent className="py-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.customer_name}</div>
                    {r.comment && <div className="text-xs text-muted-foreground line-clamp-2">{r.comment}</div>}
                  </div>
                  <Badge variant="outline" className={meta.cls}>{meta.label}</Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <DeliverySheet
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        customer={selected ? { id: selected.id, name: selected.name } : null}
        initial={selected ? { status: selected.status, comment: selected.comment, photo_url: selected.photo_url } : null}
      />
    </div>
  );
}

function StatCard({ label, value, cls, icon: Icon }: any) {
  return (
    <div className={`rounded-lg p-3 ${cls}`}>
      <Icon className="h-4 w-4" />
      <div className="text-2xl font-bold mt-1">{value}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}
