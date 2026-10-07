import { useEffect, useMemo, useState } from "react";
import { Alert02Icon, Loading03Icon, PrinterIcon, Share08Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { getDeliveryReceipt } from "@/lib/api/receipts.functions";
import { renderReceiptCanvas } from "@/lib/receipt/render-receipt-canvas";
import type { ReceiptData } from "@/lib/receipt/types";
import { usePrinter } from "@/components/driver/printer-provider";
import type { ShowReceiptArgs } from "@/components/driver/receipt-provider";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  args: ShowReceiptArgs | null;
}

export function ReceiptSheet({ open, onOpenChange, args }: Props) {
  const printer = usePrinter();
  const fetchReceipt = useServerFn(getDeliveryReceipt);
  const [printing, setPrinting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["driver", "receipt", args?.deliveryId],
    queryFn: () => fetchReceipt({ data: { delivery_id: args!.deliveryId } }),
    enabled: open && !!args?.deliveryId,
    staleTime: 15_000,
  });

  const data: ReceiptData | null = useMemo(
    () => (q.data ? { ...q.data, previousBalance: args?.previousBalance ?? null } : null),
    [q.data, args?.previousBalance],
  );

  useEffect(() => {
    if (!open) {
      setPrintError(null);
      return;
    }
    if (!data) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    renderReceiptCanvas(data, 1)
      .then((canvas) => {
        if (!cancelled) setPreviewUrl(canvas.toDataURL("image/png"));
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, data]);

  const canPrint = printer.supported;
  const hasPrinter = !!printer.deviceName;

  async function onPrint() {
    if (!data) return;
    setPrintError(null);

    if (!hasPrinter) {
      toast.info("Primero conecta la impresora.");
      printer.openSheet();
      return;
    }
    setPrinting(true);
    try {
      await printer.printCanvas(await renderReceiptCanvas(data, 1));
      toast.success("Recibo impreso.");
    } catch (e) {
      setPrintError(
        e instanceof Error ? e.message : "No se pudo imprimir. Puedes compartir el recibo como PDF.",
      );
    } finally {
      setPrinting(false);
    }
  }

  async function onShare() {
    if (!data) return;
    setSharing(true);
    try {
      const { shareReceiptPdf } = await import("@/lib/receipt/receipt-pdf");
      const result = await shareReceiptPdf(data);
      if (result === "downloaded") toast.success("PDF descargado.");
    } catch {
      toast.error("No se pudo crear el PDF.");
    } finally {
      setSharing(false);
    }
  }

  const printLabel = !canPrint
    ? null
    : printing
      ? "Imprimiendo…"
      : hasPrinter
        ? printer.status === "connected"
          ? "Imprimir recibo"
          : "Imprimir recibo (reconecta solo)"
        : "Conectar impresora";

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="flex max-h-[94dvh] flex-col">
        <DrawerHeader className="shrink-0">
          <DrawerTitle>Recibo</DrawerTitle>
          <DrawerDescription>{data?.customerName ?? "Cargando…"}</DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          {q.isLoading && (
            <div className="flex justify-center py-16">
              <Icon icon={Loading03Icon} className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {q.isError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {(q.error as Error)?.message ?? "No se pudo cargar el recibo."}
              <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => q.refetch()}>
                Reintentar
              </Button>
            </div>
          )}
          {previewUrl && (
            <div className="mx-auto w-full max-w-[19rem] rounded-md border bg-white p-1 shadow-sm">
              <img src={previewUrl} alt="Vista previa del recibo" className="w-full" />
            </div>
          )}
        </div>

        <div className="shrink-0 space-y-2 border-t bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom,1rem))]">
          {printError && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
              <Icon icon={Alert02Icon} className="mt-0.5 h-4 w-4" />
              <div>
                {printError}
                <div className="mt-0.5 text-xs opacity-80">Puedes reintentar o compartir el PDF.</div>
              </div>
            </div>
          )}

          {canPrint && (
            <Button className="h-12 w-full font-semibold" onClick={onPrint} disabled={!data || printing}>
              <Icon icon={PrinterIcon} className="h-5 w-5" />
              {printError ? "Reintentar impresión" : printLabel}
            </Button>
          )}
          <Button
            variant={canPrint ? "outline" : "default"}
            className="h-12 w-full font-semibold"
            onClick={onShare}
            disabled={!data || sharing}
          >
            <Icon icon={sharing ? Loading03Icon : Share08Icon} className={`h-5 w-5 ${sharing ? "animate-spin" : ""}`} />
            {sharing ? "Creando PDF…" : "Compartir PDF"}
          </Button>
          <Button variant="ghost" className="h-10 w-full" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
