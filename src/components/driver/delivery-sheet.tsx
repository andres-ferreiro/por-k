import { useEffect, useMemo, useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PhotoCapture } from "@/components/driver/photo-capture";
import { useServerFn } from "@tanstack/react-start";
import {
  saveDeliveryVisit,
  getCustomerPricedProducts,
  getTodayDeliveryDetail,
  getPhotoViewUrls,
} from "@/lib/api/driver.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2, Clock, XCircle, Plus, Minus, Banknote, ArrowLeftRight, CreditCard, MoreHorizontal,
  RotateCcw, ChevronDown, ChevronUp, Tag,
} from "lucide-react";

type Status = "delivered" | "pending" | "failed";
type Method = "cash" | "transfer" | "credit" | "other";
type PayStatus = "paid" | "pending";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: { id: string; name: string } | null;
  initial?: { status: Status; comment: string | null; photo_url: string | null } | null;
}

const STATUSES: { value: Status; label: string; icon: any; cls: string }[] = [
  { value: "delivered", label: "Entregado", icon: CheckCircle2, cls: "bg-emerald-600 text-white border-emerald-600" },
  { value: "pending", label: "Pendiente", icon: Clock, cls: "bg-amber-500 text-white border-amber-500" },
  { value: "failed", label: "Fallido", icon: XCircle, cls: "bg-rose-600 text-white border-rose-600" },
];

const METHODS: { value: Method; label: string; icon: any }[] = [
  { value: "cash", label: "Efectivo", icon: Banknote },
  { value: "transfer", label: "Transfer.", icon: ArrowLeftRight },
  { value: "credit", label: "Crédito", icon: CreditCard },
  { value: "other", label: "Otro", icon: MoreHorizontal },
];

const fmt = (n: number) => n.toLocaleString("es", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });

export function DeliverySheet({ open, onOpenChange, customer }: Props) {
  const [status, setStatus] = useState<Status>("delivered");
  const [comment, setComment] = useState("");
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [retQty, setRetQty] = useState<Record<string, number>>({});
  const [showReturns, setShowReturns] = useState(false);
  const [method, setMethod] = useState<Method>("cash");
  const [payStatus, setPayStatus] = useState<PayStatus>("paid");
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);

  const qc = useQueryClient();
  const save = useServerFn(saveDeliveryVisit);
  const getProducts = useServerFn(getCustomerPricedProducts);
  const getDetail = useServerFn(getTodayDeliveryDetail);
  const viewUrls = useServerFn(getPhotoViewUrls);

  const productsQ = useQuery({
    queryKey: ["driver", "pricedProducts", customer?.id],
    queryFn: () => getProducts({ data: { customer_id: customer!.id } }),
    enabled: open && !!customer,
  });
  const detailQ = useQuery({
    queryKey: ["driver", "deliveryDetail", customer?.id],
    queryFn: () => getDetail({ data: { customer_id: customer!.id } }),
    enabled: open && !!customer,
  });

  // Initialize from server when sheet opens
  useEffect(() => {
    if (!open || !detailQ.data) return;
    const d = detailQ.data;
    if (d.delivery) {
      setStatus(d.delivery.status as Status);
      setComment(d.delivery.comment ?? "");
      setPhotoPath(d.delivery.photo_url ?? null);
    } else {
      setStatus("delivered");
      setComment("");
      setPhotoPath(null);
    }
    setQty(Object.fromEntries(d.items.map((i: any) => [i.product_id, i.quantity])));
    setRetQty(Object.fromEntries(d.returns.map((r: any) => [r.product_id, r.quantity])));
    setShowReturns(d.returns.length > 0);
    if (d.payment) {
      setMethod(d.payment.method as Method);
      setPayStatus(d.payment.status as PayStatus);
    } else {
      setMethod("cash");
      setPayStatus("paid");
    }
    setExistingPhotoUrl(null);
    if (d.delivery?.photo_url) {
      viewUrls({ data: { bucket: "delivery-photos", paths: [d.delivery.photo_url] } })
        .then((m) => setExistingPhotoUrl(m[d.delivery!.photo_url!] ?? null))
        .catch(() => {});
    }
  }, [open, detailQ.data, viewUrls]);

  const products = productsQ.data ?? [];
  const total = useMemo(
    () => products.reduce((s, p) => s + (qty[p.id] ?? 0) * p.effective_price, 0),
    [products, qty],
  );
  const linesCount = useMemo(() => Object.values(qty).filter((q) => q > 0).length, [qty]);
  const returnsCount = useMemo(() => Object.values(retQty).filter((q) => q > 0).length, [retQty]);

  const inc = (id: string) => setQty((s) => ({ ...s, [id]: (s[id] ?? 0) + 1 }));
  const dec = (id: string) => setQty((s) => ({ ...s, [id]: Math.max(0, (s[id] ?? 0) - 1) }));
  const incR = (id: string) => setRetQty((s) => ({ ...s, [id]: (s[id] ?? 0) + 1 }));
  const decR = (id: string) => setRetQty((s) => ({ ...s, [id]: Math.max(0, (s[id] ?? 0) - 1) }));

  const mut = useMutation({
    mutationFn: async () => {
      if (!customer) return;
      const items = Object.entries(qty)
        .filter(([, q]) => q > 0)
        .map(([product_id, quantity]) => ({ product_id, quantity }));
      const returns = Object.entries(retQty)
        .filter(([, q]) => q > 0)
        .map(([product_id, quantity]) => ({ product_id, quantity }));
      return save({
        data: {
          customer_id: customer.id,
          status,
          comment: comment.trim() || null,
          photo_path: photoPath,
          items: status === "delivered" ? items : [],
          returns,
          payment: { method, status: payStatus },
        },
      });
    },
    onSuccess: () => {
      toast.success("Visita guardada.");
      qc.invalidateQueries({ queryKey: ["driver"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo guardar."),
  });

  if (!customer) return null;
  const isDelivered = status === "delivered";

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[95vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle>Visita</DrawerTitle>
          <DrawerDescription>{customer.name}</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-2 space-y-4 overflow-y-auto">
          {/* Status */}
          <div className="grid grid-cols-3 gap-2">
            {STATUSES.map((s) => {
              const active = status === s.value;
              const Icon = s.icon;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStatus(s.value)}
                  className={`flex flex-col items-center justify-center gap-1 py-3 rounded-lg border-2 text-xs font-medium transition ${
                    active ? s.cls : "border-input bg-background text-foreground"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {s.label}
                </button>
              );
            })}
          </div>

          {/* Sales */}
          {isDelivered && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Productos vendidos</h3>
                {linesCount > 0 && (
                  <span className="text-xs text-muted-foreground">{linesCount} producto{linesCount === 1 ? "" : "s"}</span>
                )}
              </div>
              {productsQ.isLoading && (
                <div className="text-sm text-muted-foreground py-4 text-center">Cargando productos…</div>
              )}
              {!productsQ.isLoading && products.length === 0 && (
                <div className="text-sm text-muted-foreground py-4 text-center">No hay productos activos.</div>
              )}
              <div className="space-y-1.5">
                {products.map((p) => {
                  const q = qty[p.id] ?? 0;
                  const subtotal = q * p.effective_price;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-2 rounded-lg border p-2 ${q > 0 ? "bg-accent/40 border-primary/40" : ""}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate flex items-center gap-1">
                          {p.name}
                          {p.has_override && <Tag className="h-3 w-3 text-primary" />}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {fmt(p.effective_price)} / {p.unit}
                          {q > 0 && <span className="ml-2 font-medium text-foreground">= {fmt(subtotal)}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button type="button" size="icon" variant="outline" className="h-9 w-9" onClick={() => dec(p.id)} disabled={q === 0}>
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-8 text-center font-bold tabular-nums">{q}</span>
                        <Button type="button" size="icon" variant="outline" className="h-9 w-9" onClick={() => inc(p.id)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {total > 0 && (
                <div className="mt-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 flex items-center justify-between">
                  <span className="text-sm font-medium">Total a cobrar</span>
                  <span className="text-xl font-bold tabular-nums">{fmt(total)}</span>
                </div>
              )}
            </section>
          )}

          {/* Returns */}
          <section className="space-y-2">
            <button
              type="button"
              onClick={() => setShowReturns((v) => !v)}
              className="w-full flex items-center justify-between text-sm font-semibold py-1"
            >
              <span className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4" />
                Devoluciones
                {returnsCount > 0 && <span className="text-xs font-normal text-muted-foreground">({returnsCount})</span>}
              </span>
              {showReturns ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showReturns && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Producto que el cliente devuelve (no se cobra).</p>
                {products.map((p) => {
                  const q = retQty[p.id] ?? 0;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-2 rounded-lg border p-2 ${q > 0 ? "bg-rose-50 border-rose-200" : ""}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.unit}</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button type="button" size="icon" variant="outline" className="h-9 w-9" onClick={() => decR(p.id)} disabled={q === 0}>
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-8 text-center font-bold tabular-nums">{q}</span>
                        <Button type="button" size="icon" variant="outline" className="h-9 w-9" onClick={() => incR(p.id)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Payment */}
          {isDelivered && total > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Cobro</h3>
              <div className="grid grid-cols-4 gap-1.5">
                {METHODS.map((m) => {
                  const Icon = m.icon;
                  const active = method === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setMethod(m.value)}
                      className={`flex flex-col items-center gap-1 px-1 py-2 rounded-lg border-2 text-[11px] font-medium ${
                        active ? "bg-primary text-primary-foreground border-primary" : "border-input bg-background"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {m.label}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(["paid", "pending"] as PayStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setPayStatus(s)}
                    className={`py-2.5 rounded-lg border-2 text-sm font-medium ${
                      payStatus === s
                        ? s === "paid"
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-amber-500 text-white border-amber-500"
                        : "border-input bg-background"
                    }`}
                  >
                    {s === "paid" ? "Pagado" : "Pendiente"}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Comment */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Comentario (opcional)</label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Ej: dejado con la vecina" />
          </div>

          {/* Photo */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Foto (opcional)</label>
            {existingPhotoUrl && photoPath === detailQ.data?.delivery?.photo_url && (
              <img src={existingPhotoUrl} alt="Foto previa" className="w-full max-h-48 object-cover rounded-md border" />
            )}
            <PhotoCapture bucket="delivery-photos" value={photoPath} onChange={setPhotoPath} />
          </div>
        </div>
        <div className="p-4 border-t flex gap-2">
          <Button variant="outline" className="flex-1 h-12" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Cancelar
          </Button>
          <Button className="flex-1 h-12" onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Guardando…" : isDelivered && total > 0 ? `Guardar · ${fmt(total)}` : "Guardar"}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
