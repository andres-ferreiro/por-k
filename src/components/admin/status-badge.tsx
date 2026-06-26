import { cn } from "@/lib/utils";
import {
  badgeToneClass,
  correctionStatusTone,
  deliveryStatusTone,
  receiptStatusTone,
  supplyOrderStatusTone,
  type BadgeTone,
} from "@/lib/badge-tones";

export type { BadgeTone, StatusTone } from "@/lib/badge-tones";

export function StatusBadge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return <span className={badgeToneClass(tone, className)}>{children}</span>;
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

export function DeliveryStatusBadge({
  status,
}: {
  status: "delivered" | "pending" | "failed" | string;
}) {
  const tone = deliveryStatusTone(status);
  const label =
    status === "delivered" ? "Entregada" : status === "failed" ? "Fallida" : "Pendiente";
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}

const SUPPLY_ORDER_LABELS: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

export function SupplyOrderStatusBadge({ status }: { status: string }) {
  return (
    <StatusBadge tone={supplyOrderStatusTone(status)}>
      {SUPPLY_ORDER_LABELS[status] ?? status}
    </StatusBadge>
  );
}

const RECEIPT_LABELS: Record<string, string> = {
  received: "Recibido",
  incomplete: "Incompleto",
};

export function ReceiptStatusBadge({ status }: { status: string }) {
  return (
    <StatusBadge tone={receiptStatusTone(status)}>
      {RECEIPT_LABELS[status] ?? status}
    </StatusBadge>
  );
}

export function CorrectionStatusBadge({
  status,
}: {
  status: "pending" | "delivered" | string | null | undefined;
}) {
  const tone = correctionStatusTone(status);
  if (!tone) return null;
  const label = status === "pending" ? "Corrección pendiente" : "Corrección entregada";
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}

export function TagBadge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn(badgeToneClass("neutral", "normal-case tracking-normal"), className)}>
      {children}
    </span>
  );
}
