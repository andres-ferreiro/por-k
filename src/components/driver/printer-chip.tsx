import {
  BluetoothConnectedIcon,
  BluetoothIcon,
  BluetoothNotConnectedIcon,
  Loading03Icon,
  PrinterIcon,
  Alert02Icon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { usePrinter, type PrinterStatus } from "@/components/driver/printer-provider";
import { cn } from "@/lib/utils";

const META: Record<
  PrinterStatus,
  { label: string; dot: string; icon: typeof BluetoothIcon; spin?: boolean }
> = {
  connected: { label: "Impresora lista", dot: "bg-emerald-400", icon: BluetoothConnectedIcon },
  printing: { label: "Imprimiendo…", dot: "bg-amber-300", icon: PrinterIcon, spin: true },
  connecting: { label: "Conectando…", dot: "bg-amber-300", icon: Loading03Icon, spin: true },
  disconnected: { label: "Sin impresora", dot: "bg-white/50", icon: BluetoothNotConnectedIcon },
  error: { label: "Error de impresora", dot: "bg-rose-400", icon: Alert02Icon },
  unsupported: { label: "Solo PDF", dot: "bg-white/50", icon: PrinterIcon },
};

/** Small always-visible status button for the driver header. Opens the printer sheet. */
export function PrinterChip({ className }: { className?: string }) {
  const { status, deviceName, openSheet } = usePrinter();
  const meta = META[status];
  const label = status === "connected" && deviceName ? deviceName : meta.label;

  return (
    <button
      type="button"
      onClick={openSheet}
      className={cn(
        "flex h-8 max-w-[9.5rem] items-center gap-1.5 rounded-full bg-white/15 px-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-white/25 active:bg-white/30",
        className,
      )}
      aria-label={`Impresora: ${meta.label}`}
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)} />
      <Icon icon={meta.icon} className={cn("h-3.5 w-3.5", meta.spin && "animate-spin")} />
      <span className="truncate">{label}</span>
    </button>
  );
}
