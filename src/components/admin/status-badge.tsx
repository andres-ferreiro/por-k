import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "neutral" | "info";

const toneClass: Record<StatusTone, string> = {
  success: "border-emerald-600/60 text-emerald-700 dark:text-emerald-400",
  warning: "border-amber-600/60 text-amber-700 dark:text-amber-400",
  danger: "border-red-600/60 text-red-700 dark:text-red-400",
  neutral: "border-border text-muted-foreground",
  info: "border-sky-600/60 text-sky-700 dark:text-sky-400",
};

export function StatusBadge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ActiveStatusBadge({
  active,
  activeLabel = "Activo",
  inactiveLabel = "Inactivo",
}: {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  return (
    <StatusBadge tone={active ? "success" : "neutral"}>
      {active ? activeLabel : inactiveLabel}
    </StatusBadge>
  );
}

export function PaymentStatusBadge({ status }: { status: "paid" | "pending" | string }) {
  return (
    <StatusBadge tone={status === "paid" ? "success" : "warning"}>
      {status === "paid" ? "Pagado" : "Pendiente"}
    </StatusBadge>
  );
}

export function DeliveryStatusBadge({ status }: { status: "delivered" | "pending" | "failed" | string }) {
  const tone: StatusTone =
    status === "delivered" ? "success" : status === "failed" ? "danger" : "warning";
  const label =
    status === "delivered" ? "Entregada" : status === "failed" ? "Fallida" : "Pendiente";
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}
