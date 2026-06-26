import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowLeftRightIcon,
  ArrowUp01Icon,
  BanknoteIcon,
  CancelCircleIcon,
  Camera01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  CreditCardIcon,
  MinusSignIcon,
  MoreHorizontalIcon,
  Tag01Icon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { useEffect, useMemo, useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PhotoCapture } from "@/components/driver/photo-capture";
import { QuantityKeypad } from "@/components/driver/quantity-keypad";
import { useServerFn } from "@tanstack/react-start";
import {
  saveDeliveryVisit,
  getCustomerPricedProducts,
  getTodayDeliveryDetail,
  getPhotoViewUrls,
} from "@/lib/api/driver.functions";
import { getMyDispatchStock } from "@/lib/api/dispatches.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { captureCurrentLocation, reverseGeocode } from "@/lib/geocode";

type Status = "delivered" | "pending" | "failed";
type Method = "cash" | "transfer" | "credit" | "other";
type PayStatus = "paid" | "pending";
type FailureReason = "closed" | "no_order" | "other";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: { id: string; name: string; pending_balance?: number } | null;
  autoLocationOnSell?: boolean;
}

const STATUSES: { value: Status; label: string; icon: typeof CheckmarkCircle02Icon; cls: string; activeCls: string }[] = [
  { value: "delivered", label: "Entregado", icon: CheckmarkCircle02Icon, cls: "border-emerald-500", activeCls: "bg-emerald-600 text-white border-emerald-600" },
  { value: "pending", label: "Pendiente", icon: Clock01Icon, cls: "border-amber-400", activeCls: "bg-amber-500 text-white border-amber-500" },
  { value: "failed", label: "Fallido", icon: CancelCircleIcon, cls: "border-rose-400", activeCls: "bg-rose-600 text-white border-rose-600" },
];

const METHODS: { value: Method; label: string; icon: typeof BanknoteIcon }[] = [
  { value: "cash", label: "Efectivo", icon: BanknoteIcon },
  { value: "transfer", label: "Transfer.", icon: ArrowLeftRightIcon },
  { value: "credit", label: "Crédito", icon: CreditCardIcon },
  { value: "other", label: "Otro", icon: MoreHorizontalIcon },
];

const fmt = (n: number) => n.toLocaleString("es", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });

export function DeliverySheet({ open, onOpenChange, customer, autoLocationOnSell = false }: Props) {
  const [status, setStatus] = useState<Status>("delivered");
  const [comment, setComment] = useState("");
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [failureReason, setFailureReason] = useState<FailureReason>("other");
  const [failurePhotoPath, setFailurePhotoPath] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [retQty, setRetQty] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<Method>("cash");
  const [payStatus, setPayStatus] = useState<PayStatus>("paid");
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [keypadFor, setKeypadFor] = useState<{ id: string; type: "sell" | "return"; name: string } | null>(null);

  const qc = useQueryClient();
  const save = useServerFn(saveDeliveryVisit);
  const getProducts = useServerFn(getCustomerPricedProducts);
  const getDetail = useServerFn(getTodayDeliveryDetail);
  const viewUrls = useServerFn(getPhotoViewUrls);
  const getStock = useServerFn(getMyDispatchStock);

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
  const stockQ = useQuery({
    queryKey: ["driver", "dispatchStock", customer?.id],
    queryFn: () => getStock({ data: { exclude_customer_id: customer?.id ?? null } }),
    enabled: open,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!open || !detailQ.data) return;
    const d = detailQ.data;
    if (d.delivery) {
      setStatus(d.delivery.status as Status);
      setComment(d.delivery.comment ?? "");
      setPhotoPath(d.delivery.photo_url ?? null);
      setFailureReason((d.delivery.failure_reason as FailureReason) ?? "other");
      setFailurePhotoPath(d.delivery.failure_photo_url ?? null);
      if (d.delivery.comment || d.delivery.photo_url) setShowNotes(true);
    } else {
      setStatus("delivered");
      setComment("");
      setPhotoPath(null);
      setFailureReason("other");
      setFailurePhotoPath(null);
      setShowNotes(false);
    }
    setQty(Object.fromEntries(d.items.map((i: any) => [i.product_id, i.quantity])));
    setRetQty(Object.fromEntries(d.returns.map((r: any) => [r.product_id, r.quantity])));
    if (d.payment) {
      setMethod(d.payment.method as Method);
      setPayStatus(d.payment.status as PayStatus);
    } else {
      setMethod("cash");
      setPayStatus("paid");
    }
    setShowPayment(false);
    setExistingPhotoUrl(null);
    if (d.delivery?.photo_url) {
      viewUrls({ data: { bucket: "delivery-photos", paths: [d.delivery.photo_url] } })
        .then((m) => setExistingPhotoUrl(m[d.delivery!.photo_url!] ?? null))
        .catch(() => {});
    }
  }, [open, detailQ.data, viewUrls]);

  const products = productsQ.data ?? [];
  const returnableProducts = useMemo(() => products.filter((p) => p.allow_returns), [products]);

  const stockMap = stockQ.data?.stock ?? {};
  const tracksStock = stockQ.data?.has_loaded_stock ?? false;
  const totalRemainingStock = stockQ.data?.total_units ?? null;
  const outOfStock = tracksStock && totalRemainingStock === 0;

  const total = useMemo(
    () =>
      products.reduce((s, p) => {
        const netQty = Math.max(0, (qty[p.id] ?? 0) - (retQty[p.id] ?? 0));
        return s + netQty * p.effective_price;
      }, 0),
    [products, qty, retQty],
  );

  const sellCount = useMemo(() => Object.values(qty).filter((q) => q > 0).length, [qty]);
  const retCount = useMemo(() => Object.values(retQty).filter((q) => q > 0).length, [retQty]);

  const setQtyVal = (id: string, val: number) => {
    const cap = stockMap[id];
    const max = tracksStock && cap !== undefined ? cap : Infinity;
    setQty((s) => ({ ...s, [id]: Math.min(Math.max(0, val), max) }));
  };
  const setRetQtyVal = (id: string, val: number) => setRetQty((s) => ({ ...s, [id]: Math.max(0, val) }));

  const mut = useMutation({
    mutationFn: async () => {
      if (!customer) return;
      const items = Object.entries(qty)
        .filter(([, q]) => q > 0)
        .map(([product_id, quantity]) => ({ product_id, quantity }));
      const returns = Object.entries(retQty)
        .filter(([, q]) => q > 0)
        .map(([product_id, quantity]) => ({ product_id, quantity }));

      let location: { lat: number; lng: number; address: string | null } | undefined;
      if (autoLocationOnSell && status === "delivered") {
        const coords = await captureCurrentLocation();
        if (coords) {
          const address = await reverseGeocode(coords.lat, coords.lng);
          location = { ...coords, address };
        }
      }

      return save({
        data: {
          customer_id: customer.id,
          status,
          comment: comment.trim() || null,
          photo_path: photoPath,
          failure_reason: status === "failed" ? failureReason : null,
          failure_photo_path: status === "failed" ? failurePhotoPath : null,
          items: status === "delivered" ? items : [],
          returns,
          payment: { method, status: payStatus },
          location,
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
  const pendingBalance = customer.pending_balance ?? 0;

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="flex h-[96dvh] max-h-[96dvh] flex-col overflow-hidden">
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <DrawerHeader className="shrink-0 pb-0">
            <DrawerTitle>Visita</DrawerTitle>
            <DrawerDescription>{customer.name}</DrawerDescription>
          </DrawerHeader>

          {/* Status — compact segmented control */}
          <div className="shrink-0 px-4 pt-2 pb-0">
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-muted">
              {STATUSES.map((s) => {
                const active = status === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setStatus(s.value)}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                      active ? s.activeCls : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon icon={s.icon} className="h-3.5 w-3.5" />
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {isDelivered ? (
            <Tabs defaultValue="sell" className="flex min-h-0 flex-1 flex-col">
              {/* Fixed sell / returns tabs */}
              <div className="shrink-0 border-b bg-background px-4">
                <TabsList className="grid h-auto w-full grid-cols-2 gap-0 rounded-none bg-transparent p-0">
                  <TabsTrigger
                    value="sell"
                    className="gap-1.5 rounded-none border-b-2 border-transparent bg-transparent py-2.5 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
                  >
                    Vender
                    {sellCount > 0 && (
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                        {sellCount}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger
                    value="returns"
                    disabled={returnableProducts.length === 0}
                    className="gap-1.5 rounded-none border-b-2 border-transparent bg-transparent py-2.5 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none disabled:opacity-40"
                  >
                    Devoluciones
                    {retCount > 0 && (
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                        {retCount}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Scrollable product list + extras */}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pt-3 pb-2 space-y-3">
                <TabsContent value="sell" className="mt-0 space-y-1.5">
                  {productsQ.isLoading && (
                    <p className="text-sm text-muted-foreground py-6 text-center">Cargando productos…</p>
                  )}
                  {!productsQ.isLoading && products.length === 0 && (
                    <p className="text-sm text-muted-foreground py-6 text-center">No hay productos activos.</p>
                  )}
                  {outOfStock && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-800 px-3 py-2.5 text-sm font-medium text-rose-700 dark:text-rose-400 text-center">
                      Sin producto disponible — ya vendiste todo lo cargado hoy.
                    </div>
                  )}
                  {products.map((p) => {
                    const q = qty[p.id] ?? 0;
                    const subtotal = q * p.effective_price;
                    const cap = stockMap[p.id];
                    const hasCap = tracksStock && cap !== undefined;
                    const atMax = hasCap && q >= cap;
                    return (
                      <div
                        key={p.id}
                        className={`flex items-center gap-2 rounded-lg border p-2.5 ${q > 0 ? "bg-primary/5 border-primary/30" : "bg-background"}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate flex items-center gap-1">
                            {p.name}
                            {p.has_override && <Icon icon={Tag01Icon} className="h-3 w-3 text-primary shrink-0" />}
                          </div>
                          <div className="text-xs text-muted-foreground tabular-nums">
                            {fmt(p.effective_price)} / {p.unit}
                            {q > 0 && <span className="ml-2 font-semibold text-foreground">= {fmt(subtotal)}</span>}
                            {hasCap && (
                              <span className={`ml-2 ${cap === 0 ? "text-rose-500" : "text-muted-foreground"}`}>
                                · {cap - q >= 0 ? cap - q : 0} dispon.
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-9 w-9 shrink-0"
                            onClick={() => setQtyVal(p.id, q - 1)}
                            disabled={q === 0}
                          >
                            <Icon icon={MinusSignIcon} className="h-4 w-4" />
                          </Button>
                          <button
                            type="button"
                            className="w-10 text-center font-bold tabular-nums text-base px-1 py-1.5 rounded-md hover:bg-accent transition-colors"
                            onClick={() => setKeypadFor({ id: p.id, type: "sell", name: p.name })}
                          >
                            {q}
                          </button>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-9 w-9 shrink-0"
                            onClick={() => setQtyVal(p.id, q + 1)}
                            disabled={atMax}
                          >
                            <Icon icon={Add01Icon} className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </TabsContent>

                <TabsContent value="returns" className="mt-0 space-y-1.5">
                  <p className="text-xs text-muted-foreground mb-2">
                    Producto que el cliente devuelve (se descuenta del cobro).
                  </p>
                  {returnableProducts.map((p) => {
                    const q = retQty[p.id] ?? 0;
                    return (
                      <div
                        key={p.id}
                        className={`flex items-center gap-2 rounded-lg border p-2.5 ${q > 0 ? "bg-rose-50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-800" : "bg-background"}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{p.name}</div>
                          <div className="text-xs text-muted-foreground">{p.unit}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-9 w-9 shrink-0"
                            onClick={() => setRetQtyVal(p.id, q - 1)}
                            disabled={q === 0}
                          >
                            <Icon icon={MinusSignIcon} className="h-4 w-4" />
                          </Button>
                          <button
                            type="button"
                            className="w-10 text-center font-bold tabular-nums text-base px-1 py-1.5 rounded-md hover:bg-accent transition-colors"
                            onClick={() => setKeypadFor({ id: p.id, type: "return", name: p.name })}
                          >
                            {q}
                          </button>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-9 w-9 shrink-0"
                            onClick={() => setRetQtyVal(p.id, q + 1)}
                          >
                            <Icon icon={Add01Icon} className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </TabsContent>

            {/* Payment — collapsible */}
            <div className="rounded-lg border overflow-hidden">
              <button
                type="button"
                onClick={() => setShowPayment((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium"
              >
                <span className="flex items-center gap-2">
                  Método de pago
                  <span className="text-xs font-normal text-muted-foreground">
                    ({METHODS.find((m) => m.value === method)?.label ?? "Efectivo"} · {payStatus === "paid" ? "Pagado" : "Pendiente"})
                  </span>
                </span>
                {showPayment
                  ? <Icon icon={ArrowUp01Icon} className="h-4 w-4 text-muted-foreground" />
                  : <Icon icon={ArrowDown01Icon} className="h-4 w-4 text-muted-foreground" />}
              </button>
              {showPayment && (
                <div className="px-3 pb-3 space-y-2 border-t">
                  <div className="grid grid-cols-4 gap-1.5 pt-2">
                    {METHODS.map((m) => {
                      const active = method === m.value;
                      return (
                        <button
                          key={m.value}
                          type="button"
                          onClick={() => setMethod(m.value)}
                          className={`flex flex-col items-center gap-1 px-1 py-2 rounded-lg border-2 text-[11px] font-medium transition-colors ${
                            active ? "bg-primary text-primary-foreground border-primary" : "border-input bg-background"
                          }`}
                        >
                          <Icon icon={m.icon} className="h-4 w-4" />
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
                        className={`py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
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
                </div>
              )}
            </div>

            {/* Notes & Photo — collapsible */}
            <div className="rounded-lg border overflow-hidden">
              <button
                type="button"
                onClick={() => setShowNotes((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium"
              >
                <span>Comentario y foto</span>
                {showNotes
                  ? <Icon icon={ArrowUp01Icon} className="h-4 w-4 text-muted-foreground" />
                  : <Icon icon={ArrowDown01Icon} className="h-4 w-4 text-muted-foreground" />}
              </button>
              {showNotes && (
                <div className="px-3 pb-3 space-y-3 border-t pt-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-muted-foreground">Comentario (opcional)</label>
                    <Textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={2}
                      placeholder="Ej: dejado con la vecina"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-muted-foreground">Foto (opcional)</label>
                    {existingPhotoUrl && photoPath === detailQ.data?.delivery?.photo_url && (
                      <img
                        src={existingPhotoUrl}
                        alt="Foto previa"
                        className="w-full max-h-40 object-cover rounded-md border"
                      />
                    )}
                    <PhotoCapture bucket="delivery-photos" value={photoPath} onChange={setPhotoPath} />
                  </div>
                </div>
              )}
            </div>
              </div>
            </Tabs>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pt-3 pb-2">
              {status === "pending" ? (
                <div className="py-4 text-center text-sm text-muted-foreground rounded-lg border border-dashed">
                  Visita marcada como pendiente. No se registrarán productos vendidos.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="py-3 text-center text-sm text-muted-foreground rounded-lg border border-dashed">
                    Visita marcada como fallida. No se registrarán productos vendidos.
                  </div>
                  {/* Failure reason */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Razón</label>
                    <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-muted">
                      {(["closed", "no_order", "other"] as FailureReason[]).map((r) => {
                        const labels: Record<FailureReason, string> = { closed: "Cerrada", no_order: "Sin pedido", other: "Otra" };
                        return (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setFailureReason(r)}
                            className={`py-2 rounded-lg text-xs font-semibold transition-all ${
                              failureReason === r ? "bg-rose-600 text-white" : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {labels[r]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {/* Mandatory camera photo when closed */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium flex items-center gap-1.5">
                      <Icon icon={Camera01Icon} className="h-4 w-4" />
                      {failureReason === "closed" ? "Foto de la tienda cerrada (obligatoria)" : "Foto (opcional)"}
                    </label>
                    <PhotoCapture
                      bucket="delivery-photos"
                      value={failurePhotoPath}
                      onChange={setFailurePhotoPath}
                    />
                    {failureReason === "closed" && !failurePhotoPath && (
                      <p className="text-xs text-rose-500">Debes tomar una foto para confirmar que la tienda está cerrada.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Fixed bottom bar */}
          <div className="shrink-0 border-t bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom,1rem))]">
            {pendingBalance > 0 && (
              <div className="flex items-center justify-between mb-2 px-1 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800">
                <span className="text-sm font-medium text-rose-700 dark:text-rose-400">Saldo anterior</span>
                <span className="text-sm font-bold tabular-nums text-rose-700 dark:text-rose-400">{fmt(pendingBalance)}</span>
              </div>
            )}
            {isDelivered && total > 0 && (
              <div className="flex items-center justify-between mb-2.5 px-1">
                <span className="text-sm text-muted-foreground">Total a cobrar</span>
                <span className="text-xl font-bold tabular-nums text-primary">{fmt(total + pendingBalance)}</span>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 h-12"
                onClick={() => onOpenChange(false)}
                disabled={mut.isPending}
              >
                Cancelar
              </Button>
              <Button
                className="flex-2 flex-[2] h-12 font-semibold"
                onClick={() => mut.mutate()}
                disabled={mut.isPending || (status === "failed" && failureReason === "closed" && !failurePhotoPath)}
              >
                {mut.isPending ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </div>

          {keypadFor && (
            <QuantityKeypad
              open
              onClose={() => setKeypadFor(null)}
              label={keypadFor.name}
              value={keypadFor.type === "sell" ? (qty[keypadFor.id] ?? 0) : (retQty[keypadFor.id] ?? 0)}
              onConfirm={(val) => {
                if (keypadFor.type === "sell") setQtyVal(keypadFor.id, val);
                else setRetQtyVal(keypadFor.id, val);
                setKeypadFor(null);
              }}
            />
          )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
