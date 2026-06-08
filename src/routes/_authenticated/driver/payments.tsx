import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listTodayPayments, deletePayment, getMyRouteToday } from "@/lib/api/driver.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Loader2, Trash2, Banknote, ArrowLeftRight, CreditCard, MoreHorizontal } from "lucide-react";
import { PaymentSheet } from "@/components/driver/payment-sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/driver/payments")({
  component: Page,
});

const METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo", transfer: "Transferencia", credit: "Crédito", other: "Otro",
};
const METHOD_ICON: Record<string, any> = {
  cash: Banknote, transfer: ArrowLeftRight, credit: CreditCard, other: MoreHorizontal,
};

function Page() {
  const fetcher = useServerFn(listTodayPayments);
  const fetchRoute = useServerFn(getMyRouteToday);
  const del = useServerFn(deletePayment);
  const qc = useQueryClient();

  const { data: payments, isLoading } = useQuery({
    queryKey: ["driver", "paymentsToday"],
    queryFn: () => fetcher(),
  });
  const { data: route } = useQuery({
    queryKey: ["driver", "myRouteToday"],
    queryFn: () => fetchRoute(),
  });

  const [pickerOpen, setPickerOpen] = useState(false);
  const [paymentFor, setPaymentFor] = useState<{ id: string; name: string } | null>(null);

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Pago eliminado.");
      qc.invalidateQueries({ queryKey: ["driver"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo eliminar."),
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const rows = payments ?? [];
  const total = rows.filter((r) => r.status === "paid").reduce((s, r) => s + r.amount, 0);
  const byMethod: Record<string, number> = {};
  for (const r of rows) {
    if (r.status === "paid") byMethod[r.method] = (byMethod[r.method] ?? 0) + r.amount;
  }
  const fmt = (n: number) =>
    n.toLocaleString("es", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pagos de hoy</h1>
      </div>

      <Card>
        <CardContent className="py-4 space-y-3">
          <div>
            <div className="text-xs text-muted-foreground">Total cobrado</div>
            <div className="text-3xl font-bold">{fmt(total)}</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["cash", "transfer", "credit", "other"] as const).map((m) => {
              const Icon = METHOD_ICON[m];
              return (
                <div key={m} className="rounded-md border p-2 flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">{METHOD_LABEL[m]}</div>
                    <div className="text-sm font-semibold truncate">{fmt(byMethod[m] ?? 0)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          Aún no registras pagos hoy.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const Icon = METHOD_ICON[r.method];
            return (
              <Card key={r.id}>
                <CardContent className="py-3 flex items-center gap-3">
                  <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{r.customer_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {METHOD_LABEL[r.method]} · {new Date(r.paid_at).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
                      {r.note ? ` · ${r.note}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{fmt(r.amount)}</div>
                    <Badge variant="outline" className={r.status === "paid" ? "bg-emerald-100 text-emerald-800 border-emerald-200" : "bg-amber-100 text-amber-800 border-amber-200"}>
                      {r.status === "paid" ? "Pagado" : "Pendiente"}
                    </Badge>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => delMut.mutate(r.id)}
                    disabled={delMut.isPending}
                    className="shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Button
        className="fixed bottom-20 right-4 h-14 w-14 rounded-full shadow-lg z-20"
        onClick={() => setPickerOpen(true)}
        size="icon"
      >
        <Plus className="h-6 w-6" />
      </Button>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>¿De qué cliente?</DialogTitle>
            <DialogDescription>Selecciona un cliente de tu ruta.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-1">
            {(route?.customers ?? []).map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setPickerOpen(false);
                  setPaymentFor({ id: c.id, name: c.name });
                }}
                className="w-full text-left px-3 py-3 rounded-md hover:bg-accent flex items-center gap-3"
              >
                <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                  {c.position + 1}
                </div>
                <div className="min-w-0">
                  <div className="font-medium truncate">{c.name}</div>
                  {c.address && <div className="text-xs text-muted-foreground truncate">{c.address}</div>}
                </div>
              </button>
            ))}
            {(route?.customers ?? []).length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-8">
                No hay clientes en tu ruta.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <PaymentSheet open={!!paymentFor} onOpenChange={(o) => !o && setPaymentFor(null)} customer={paymentFor} />
    </div>
  );
}
