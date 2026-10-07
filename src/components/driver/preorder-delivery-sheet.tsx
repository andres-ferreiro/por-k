import {
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  Camera01Icon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { useEffect, useMemo, useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PhotoCapture } from "@/components/driver/photo-capture";
import { useServerFn } from "@tanstack/react-start";
import {
  confirmPreorderDelivery,
  getPreorderDeliveryDetail,
  getPhotoViewUrls,
} from "@/lib/api/driver.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useReceipt } from "@/components/driver/receipt-provider";
import { ReceivedField, receivedFor, type MoneyMethod, type ReceivedMode } from "@/components/driver/received-field";
import { visitBalance } from "@/lib/account";

type Status = "delivered" | "failed";
type FailureReason = "closed" | "other";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: { id: string; name: string } | null;
}

const fmt = (n: number) => n.toLocaleString("es", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });

export function PreorderDeliverySheet({ open, onOpenChange, customer }: Props) {
  const [status, setStatus] = useState<Status>("delivered");
  const [comment, setComment] = useState("");
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [failureReason, setFailureReason] = useState<FailureReason>("other");
  const [failurePhotoPath, setFailurePhotoPath] = useState<string | null>(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);
  // Preorders are on credit unless the driver collects something at the door.
  const [receivedMode, setReceivedMode] = useState<ReceivedMode>("none");
  const [customReceived, setCustomReceived] = useState(0);
  const [method, setMethod] = useState<MoneyMethod>("cash");

  const qc = useQueryClient();
  const { showReceipt } = useReceipt();
  const confirm = useServerFn(confirmPreorderDelivery);
  const getDetail = useServerFn(getPreorderDeliveryDetail);
  const viewUrls = useServerFn(getPhotoViewUrls);

  const detailQ = useQuery({
    queryKey: ["driver", "preorderDetail", customer?.id],
    queryFn: () => getDetail({ data: { customer_id: customer!.id } }),
    enabled: open && !!customer,
  });

  useEffect(() => {
    if (!open || !detailQ.data) return;
    const d = detailQ.data;
    if (d.delivery) {
      setStatus(d.delivery.status === "failed" ? "failed" : "delivered");
      setComment(d.delivery.comment ?? "");
      setPhotoPath(d.delivery.photo_url ?? null);
      setFailureReason((d.delivery.failure_reason as FailureReason) ?? "other");
      setFailurePhotoPath(d.delivery.failure_photo_url ?? null);
    } else {
      setStatus("delivered");
      setComment("");
      setPhotoPath(null);
      setFailureReason("other");
      setFailurePhotoPath(null);
    }
    setReceivedMode("none");
    setCustomReceived(0);
    setMethod("cash");
  }, [open, detailQ.data]);

  useEffect(() => {
    const path = photoPath ?? failurePhotoPath;
    if (!path) { setExistingPhotoUrl(null); return; }
    viewUrls({ data: { paths: [path] } })
      .then((m) => setExistingPhotoUrl(m[path] ?? null))
      .catch(() => setExistingPhotoUrl(null));
  }, [photoPath, failurePhotoPath, viewUrls]);

  const items = detailQ.data?.items ?? [];
  const total = useMemo(
    () => items.reduce((s, i) => s + i.quantity * i.unit_price, 0),
    [items],
  );
  const isDelivered = detailQ.data?.delivery?.status === "delivered";
  const previousBalance = detailQ.data?.previous_balance ?? 0;
  const receivedNow = receivedFor(receivedMode, customReceived, total, previousBalance);
  const { exceeds: receivedExceeds } = visitBalance(total, previousBalance, receivedNow);
  const photoChanged = photoPath !== (detailQ.data?.delivery?.photo_url ?? null);

  const saveMut = useMutation({
    mutationFn: () =>
      confirm({
        data: {
          customer_id: customer!.id,
          status,
          photo_path: status === "delivered" ? photoPath : null,
          failure_reason: status === "failed" ? failureReason : null,
          failure_photo_path: status === "failed" ? failurePhotoPath : null,
          comment: comment || null,
          // Only on the first confirmation; re-saving the note photo must not touch payments.
          ...(status === "delivered" && !isDelivered
            ? { amount_received: receivedNow, payment_method: method }
            : {}),
        },
      }),
    onSuccess: (res) => {
      // Only offer the receipt the first time the order is confirmed as delivered,
      // not when the driver just adds or replaces the note photo afterwards.
      const firstDelivery = status === "delivered" && detailQ.data?.delivery?.status !== "delivered";
      qc.invalidateQueries({ queryKey: ["driver", "myRouteToday"] });
      qc.invalidateQueries({ queryKey: ["driver", "preorderDetail", customer?.id] });
      toast.success(status === "delivered" ? "Entrega confirmada" : "Entrega marcada como fallida");
      onOpenChange(false);
      if (firstDelivery && res?.delivery_id && Number(res.total) > 0) {
        const account = {
          previousBalance,
          received: Number(res.received ?? 0),
          balance: Number(res.new_balance ?? 0),
        };
        setTimeout(() => showReceipt({ deliveryId: res.delivery_id as string, account }), 350);
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh]">
        <DrawerHeader>
          <DrawerTitle>{customer?.name}</DrawerTitle>
          <DrawerDescription>Pedido del día · Crédito a cuenta</DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-8 space-y-4 overflow-y-auto">
          {detailQ.isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Cargando pedido…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No hay pedido para hoy.</p>
          ) : (
            <>
              <div className="rounded-lg border divide-y">
                {items.map((i) => (
                  <div key={i.product_id} className="flex justify-between items-center px-3 py-2.5 text-sm">
                    <div>
                      <p className="font-medium">{i.product_name}</p>
                      <p className="text-xs text-muted-foreground">{i.quantity} {i.unit} × {fmt(i.unit_price)}</p>
                    </div>
                    <span className="font-medium tabular-nums">{fmt(i.quantity * i.unit_price)}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center px-3 py-3 font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{fmt(total)}</span>
                </div>
              </div>

              {!isDelivered && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant={status === "delivered" ? "default" : "outline"}
                      className={status === "delivered" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                      onClick={() => setStatus("delivered")}
                    >
                      <Icon icon={CheckmarkCircle02Icon} className="h-4 w-4 mr-1" />
                      Entregado
                    </Button>
                    <Button
                      variant={status === "failed" ? "default" : "outline"}
                      className={status === "failed" ? "bg-rose-600 hover:bg-rose-700" : ""}
                      onClick={() => setStatus("failed")}
                    >
                      <Icon icon={CancelCircleIcon} className="h-4 w-4 mr-1" />
                      Fallido
                    </Button>
                  </div>

                  {status === "delivered" && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium flex items-center gap-1">
                        <Icon icon={Camera01Icon} className="h-4 w-4" />
                        Foto de la nota entregada al cliente *
                      </p>
                      <PhotoCapture
                        bucket="delivery-photos"
                        value={photoPath}
                        previewUrl={existingPhotoUrl}
                        onChange={setPhotoPath}
                      />
                    </div>
                  )}

                  {status === "delivered" && (
                    <div className="rounded-lg border p-3">
                      <ReceivedField
                        total={total}
                        previous={previousBalance}
                        mode={receivedMode}
                        custom={customReceived}
                        onMode={(m) => setReceivedMode(m)}
                        onCustom={(n) => {
                          setCustomReceived(n);
                          setReceivedMode("custom");
                        }}
                        method={method}
                        onMethod={setMethod}
                      />
                    </div>
                  )}

                  {status === "failed" && (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        {(["closed", "other"] as FailureReason[]).map((r) => (
                          <Button
                            key={r}
                            size="sm"
                            variant={failureReason === r ? "default" : "outline"}
                            onClick={() => setFailureReason(r)}
                          >
                            {r === "closed" ? "Cerrado" : "Otro"}
                          </Button>
                        ))}
                      </div>
                      <PhotoCapture
                        bucket="delivery-photos"
                        value={failurePhotoPath}
                        previewUrl={existingPhotoUrl}
                        onChange={setFailurePhotoPath}
                      />
                    </div>
                  )}

                  <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Comentario opcional…"
                    rows={2}
                  />

                  <Button
                    className="w-full h-12"
                    onClick={() => saveMut.mutate()}
                    disabled={saveMut.isPending || (status === "delivered" && (!photoPath || receivedExceeds))}
                  >
                    {saveMut.isPending ? "Guardando…" : "Confirmar"}
                  </Button>
                </>
              )}

              {isDelivered && (
                <div className="space-y-3">
                  {detailQ.data?.delivery?.id && (
                    <Button
                      variant="outline"
                      className="w-full h-11"
                      onClick={() => {
                        const id = detailQ.data!.delivery!.id as string;
                        onOpenChange(false);
                        setTimeout(() => showReceipt({ deliveryId: id }), 350);
                      }}
                    >
                      Ver / imprimir recibo
                    </Button>
                  )}
                  {existingPhotoUrl && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Nota entregada</p>
                      <img src={existingPhotoUrl} alt="Nota" className="rounded-lg border w-full" />
                    </div>
                  )}
                  <div className="space-y-2">
                    <p className="text-sm font-medium flex items-center gap-1">
                      <Icon icon={Camera01Icon} className="h-4 w-4" />
                      {existingPhotoUrl ? "Agregar o actualizar foto" : "Foto de la nota entregada"}
                    </p>
                    <PhotoCapture
                      bucket="delivery-photos"
                      value={photoPath}
                      previewUrl={existingPhotoUrl}
                      onChange={setPhotoPath}
                    />
                  </div>
                  <Button
                    className="w-full h-12"
                    onClick={() => saveMut.mutate()}
                    disabled={saveMut.isPending || !photoChanged || !photoPath}
                  >
                    {saveMut.isPending ? "Guardando…" : "Guardar foto"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
