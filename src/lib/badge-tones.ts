import { cn } from "@/lib/utils";

export type BadgeTone =
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "neutral"
  | "info";

export const BADGE_BASE =
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide";

export const badgeToneClasses: Record<BadgeTone, string> = {
  primary:
    "border-primary/40 bg-primary/10 text-primary dark:border-primary/50 dark:bg-primary/15",
  success:
    "border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400",
  warning:
    "border-amber-600/40 bg-amber-500/10 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400",
  danger:
    "border-red-600/40 bg-red-500/10 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-400",
  neutral: "border-border bg-muted/50 text-muted-foreground",
  info:
    "border-sky-600/40 bg-sky-500/10 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-400",
};

export function badgeToneClass(tone: BadgeTone, className?: string) {
  return cn(BADGE_BASE, badgeToneClasses[tone], className);
}

/** @deprecated use BadgeTone */
export type StatusTone = BadgeTone;

export function deliveryStatusTone(
  status: "delivered" | "pending" | "failed" | string | null | undefined,
): BadgeTone {
  if (status === "delivered") return "success";
  if (status === "failed") return "danger";
  if (status === "pending") return "warning";
  return "neutral";
}

export function supplyOrderStatusTone(status: string): BadgeTone {
  if (status === "delivered") return "primary";
  if (status === "confirmed") return "info";
  if (status === "pending") return "warning";
  if (status === "cancelled") return "danger";
  return "neutral";
}

export function receiptStatusTone(status: string): BadgeTone {
  if (status === "received") return "success";
  if (status === "incomplete") return "danger";
  return "neutral";
}

export function correctionStatusTone(status: string | null | undefined): BadgeTone | null {
  if (status === "pending") return "warning";
  if (status === "delivered") return "success";
  return null;
}
