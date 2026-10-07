import {
  Alert02Icon,
  BluetoothConnectedIcon,
  BluetoothNotConnectedIcon,
  CheckmarkCircle02Icon,
  Loading03Icon,
  PrinterIcon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { usePrinter, type PrinterStatus } from "@/components/driver/printer-provider";

const HEADLINE: Record<PrinterStatus, { title: string; hint: string; tone: string }> = {
  connected: {
    title: "Impresora conectada",
    hint: "Lista para imprimir recibos.",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300",
  },
  printing: {
    title: "Imprimiendo…",
    hint: "No apagues la impresora ni te alejes.",
    tone: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
  },
  connecting: {
    title: "Conectando…",
    hint: "Esto puede tardar unos segundos.",
    tone: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
  },
  disconnected: {
    title: "Sin conexión",
    hint: "Enciende la impresora y conéctala para imprimir recibos.",
    tone: "border-border bg-muted text-foreground",
  },
  error: {
    title: "No se pudo conectar",
    hint: "Revisa la lista de abajo e intenta de nuevo.",
    tone: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300",
  },
  unsupported: {
    title: "Este navegador no puede imprimir",
    hint: "Los recibos se compartirán como PDF. Para imprimir, abre la app en Google Chrome en un teléfono Android.",
    tone: "border-border bg-muted text-foreground",
  },
};

function StatusIcon({ status }: { status: PrinterStatus }) {
  if (status === "connected") return <Icon icon={BluetoothConnectedIcon} className="h-6 w-6" />;
  if (status === "printing") return <Icon icon={PrinterIcon} className="h-6 w-6 animate-pulse" />;
  if (status === "connecting") return <Icon icon={Loading03Icon} className="h-6 w-6 animate-spin" />;
  if (status === "error") return <Icon icon={Alert02Icon} className="h-6 w-6" />;
  return <Icon icon={BluetoothNotConnectedIcon} className="h-6 w-6" />;
}

const timeFmt = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });

export function PrinterSheet() {
  const p = usePrinter();
  const busy = p.status === "connecting" || p.status === "printing";
  const head = HEADLINE[p.status];
  const hasDevice = !!p.deviceName;

  async function onTest() {
    const ok = await p.printTest();
    if (ok) toast.success("Prueba enviada a la impresora.");
  }

  return (
    <Drawer open={p.sheetOpen} onOpenChange={(o) => (o ? p.openSheet() : p.closeSheet())}>
      <DrawerContent className="max-h-[92dvh]">
        <DrawerHeader>
          <DrawerTitle>Impresora de recibos</DrawerTitle>
          <DrawerDescription>GOOJPRT PT-210 u otra impresora térmica de 58 mm</DrawerDescription>
        </DrawerHeader>

        <div className="space-y-4 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className={`flex items-start gap-3 rounded-xl border p-4 ${head.tone}`}>
            <StatusIcon status={p.status} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold leading-tight">{head.title}</div>
              <div className="mt-0.5 text-sm opacity-90">{p.error && p.status === "error" ? p.error : head.hint}</div>
              {hasDevice && p.status !== "unsupported" && (
                <div className="mt-2 text-xs opacity-80">
                  Impresora: <b>{p.deviceName}</b>
                  {p.lastPrintAt && <> · Último recibo {timeFmt.format(p.lastPrintAt)}</>}
                </div>
              )}
            </div>
          </div>

          {p.status !== "unsupported" && (
            <div className="space-y-2">
              {!hasDevice ? (
                <Button className="h-12 w-full font-semibold" onClick={() => p.pair()} disabled={busy}>
                  <Icon icon={BluetoothConnectedIcon} className="h-5 w-5" />
                  Conectar impresora
                </Button>
              ) : (
                <>
                  {p.status !== "connected" && p.status !== "printing" && (
                    <Button className="h-12 w-full font-semibold" onClick={() => p.reconnect()} disabled={busy}>
                      <Icon icon={RefreshIcon} className="h-5 w-5" />
                      Reconectar
                    </Button>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      className="h-11"
                      onClick={onTest}
                      disabled={busy || p.status !== "connected"}
                    >
                      <Icon icon={CheckmarkCircle02Icon} className="h-4 w-4" />
                      Imprimir prueba
                    </Button>
                    <Button variant="outline" className="h-11" onClick={() => p.pair()} disabled={busy}>
                      Cambiar impresora
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    className="h-10 w-full text-rose-600 hover:text-rose-700"
                    onClick={p.forget}
                    disabled={busy}
                  >
                    Olvidar impresora
                  </Button>
                </>
              )}
            </div>
          )}

          {p.status !== "unsupported" && p.status !== "connected" && (
            <div className="rounded-xl border p-4 text-sm">
              <div className="mb-2 font-semibold">Si no conecta, revisa:</div>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>La impresora está encendida y con batería (luz azul parpadeando).</li>
                <li>Bluetooth y ubicación están activados en el teléfono.</li>
                <li>Estás usando la app en Google Chrome.</li>
                <li>La impresora no está conectada a otro teléfono.</li>
                <li>Tiene papel y la tapa está bien cerrada.</li>
              </ul>
              {!hasDevice && (
                <button
                  type="button"
                  onClick={() => p.pair(true)}
                  className="mt-3 text-xs font-medium text-primary underline underline-offset-2"
                  disabled={busy}
                >
                  No aparece mi impresora: mostrar todos los dispositivos
                </button>
              )}
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground">
            Si no puedes imprimir, siempre puedes compartir el recibo como PDF.
          </p>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
