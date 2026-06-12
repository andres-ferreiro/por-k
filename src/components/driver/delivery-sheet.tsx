import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowLeftRightIcon,
  ArrowUp01Icon,
  BanknoteIcon,
  CancelCircleIcon,
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

type Status = "delivered" | "pending" | "failed";
type Method = "cash" | "transfer" | "credit" | "other";
type PayStatus = "paid" | "pending";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: { id: string; name: string } | null;
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

export function DeliverySheet({ open, onOpenChange, customer }: Props) {
  const [status, setStatus] = useState<Status>("delivered");
  const [comment, setComment] = useState("");
  const [photoPath, setPhotoPath] = useState<string | null>(null);
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

  useEffect(() => {
    if (!open || !detailQ.data) return;
    const d = detailQ.data;
    if (d.delivery) {
      setStatus(d.delivery.status as Status);
      setComment(d.delivery.comment ?? "");
      setPhotoPath(d.delivery.photo_url ?? null);
      if (d.delivery.comment || d.delivery.photo_url) setShowNotes(true);
    } else {
      setStatus("delivered");
      setComment("");
      setPhotoPath(null);
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

  const setQtyVal = (id: string, val: number) => setQty((s) => ({ ...s, [id]: Math.max(0, val) }));
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
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[96vh] flex flex-col">
          <DrawerHeader className="pb-0 shrink-0">
            <DrawerTitle>Visita</DrawerTitle>
            <DrawerDescription>{customer.name}</DrawerDescription>
          </DrawerHeader>

          {/* Status — compact segmented control */}
          <div className="px-4 pt-2 pb-0 shrink-0">
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

          {/* Main scrollable content */}
          <div className="flex-1 overflow-y-auto px-4 pt-3 pb-2 space-y-3 min-h-0">
            {isDelivered ? (
              <Tabs defaultValue="sell" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-3">
                  <TabsTrigger value="sell" className="gap-1.5">
                    Vender
                    {sellCount > 0 && (
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-bold">
                        {sellCount}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="returns" className="gap-1.5" disabled={returnableProducts.length === 0}>
                    Devoluciones
                    {retCount > 0 && (
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] text-white font-bold">
                        {retCount}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="sell" className="mt-0 space-y-1.5">
                  {productsQ.isLoading && (
                    <p className="text-sm text-muted-foreground py-6 text-center">Cargando productos…</p>
                  )}
                  {!productsQ.isLoading && products.length === 0 && (
                    <p className="text-sm text-muted-foreground py-6 text-center">No hay productos activos.</p>
                  )}
                  {products.map((p) => {
                    const q = qty[p.id] ?? 0;
                    const subtotal = q * p.effective_price;
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
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
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
                            className="w-10 text-center font-bold tabular-nums text-sm px-1 py-1.5 rounded-md hover:bg-accent transition-colors"
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
                        <div className="flex items-center gap-1">
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
                            className="w-10 text-center font-bold tabular-nums text-sm px-1 py-1.5 rounded-md hover:bg-accent transition-colors"
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
              </Tabs>
            ) : (
              <div className="py-4 text-center text-sm text-muted-foreground rounded-lg border border-dashed">
                {status === "pending"
                  ? "Visita marcada como pendiente. No se registrarán productos vendidos."
                  : "Visita marcada como fallida. No se registrarán productos vendidos."}
              </div>
            )}

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

          {/* Fixed bottom bar */}
          <div className="shrink-0 border-t bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom,1rem))]">
            {isDelivered && total > 0 && (
              <div className="flex items-center justify-between mb-2.5 px-1">
                <span className="text-sm text-muted-foreground">Total a cobrar</span>
                <span className="text-xl font-bold tabular-nums text-primary">{fmt(total)}</span>
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
                disabled={mut.isPending}
              >
                {mut.isPending ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Quantity keypad */}
      {keypadFor && (
        <QuantityKeypad
          open={!!keypadFor}
          onOpenChange={(o) => !o && setKeypadFor(null)}
          label={keypadFor.name}
          value={keypadFor.type === "sell" ? (qty[keypadFor.id] ?? 0) : (retQty[keypadFor.id] ?? 0)}
          onConfirm={(val) => {
            if (keypadFor.type === "sell") setQtyVal(keypadFor.id, val);
            else setRetQtyVal(keypadFor.id, val);
            setKeypadFor(null);
          }}
        />
      )}
    </>
  );
}
