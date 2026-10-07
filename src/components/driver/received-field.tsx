import { useEffect, useState } from "react";
import { ArrowLeftRightIcon, BanknoteIcon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { parseMoneyInput, presetAmount, round2, visitBalance } from "@/lib/account";

export type ReceivedMode = "sale" | "all" | "none" | "custom";
export type MoneyMethod = "cash" | "transfer" | "other";

const fmt = (n: number) =>
  n.toLocaleString("es", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });

const METHODS: { value: MoneyMethod; label: string; icon: typeof BanknoteIcon }[] = [
  { value: "cash", label: "Efectivo", icon: BanknoteIcon },
  { value: "transfer", label: "Transferencia", icon: ArrowLeftRightIcon },
  { value: "other", label: "Otro", icon: MoreHorizontalIcon },
];

/**
 * The amount received is stored as a MODE (not a number) so that "Solo venta" keeps
 * following the total while the driver is still adding products. Typing an amount
 * switches to "custom".
 */
export function receivedFor(mode: ReceivedMode, custom: number, total: number, previous: number): number {
  if (mode === "custom") return round2(custom);
  return presetAmount(mode, total, previous);
}

/** Picks the mode that describes an amount that was already saved. */
export function modeForSaved(amountPaid: number, total: number): { mode: ReceivedMode; custom: number } {
  if (amountPaid <= 0.004) return { mode: "none", custom: 0 };
  if (Math.abs(amountPaid - total) < 0.005) return { mode: "sale", custom: 0 };
  return { mode: "custom", custom: amountPaid };
}

interface Props {
  /** Sale of this visit, net of returns. 0 when only collecting old debt. */
  total: number;
  /** Balance before this visit. */
  previous: number;
  mode: ReceivedMode;
  custom: number;
  onMode: (m: Exclude<ReceivedMode, "custom">) => void;
  onCustom: (n: number) => void;
  method: MoneyMethod;
  onMethod: (m: MoneyMethod) => void;
  /** Labels the presets differently when there is no sale. */
  disabled?: boolean;
}

export function ReceivedField({ total, previous, mode, custom, onMode, onCustom, method, onMethod, disabled }: Props) {
  const received = receivedFor(mode, custom, total, previous);
  const { due, left, exceeds } = visitBalance(total, previous, received);

  // Raw text only matters while typing ("12." must not collapse to "12"). It is rewritten
  // only when it disagrees with the real amount (preset pressed, saved visit loaded).
  const [text, setText] = useState(() => (received > 0 ? String(received) : ""));
  useEffect(() => {
    if (parseMoneyInput(text) !== received) setText(received > 0 ? String(received) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [received]);

  const hasSale = total > 0;
  const hasDebt = previous > 0;
  const presets: { id: Exclude<ReceivedMode, "custom">; label: string; show: boolean }[] = [
    { id: "all", label: hasSale ? "Todo" : "Todo el saldo", show: hasDebt },
    { id: "sale", label: "Solo venta", show: hasSale },
    { id: "none", label: "Nada", show: true },
  ];

  return (
    <div className="space-y-3">
      <div className="space-y-1 text-sm">
        {hasSale && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Venta de hoy</span>
            <span className="tabular-nums">{fmt(total)}</span>
          </div>
        )}
        {hasDebt && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Saldo anterior</span>
            <span className="tabular-nums text-rose-600 dark:text-rose-400">{fmt(previous)}</span>
          </div>
        )}
        <div className="flex items-center justify-between border-t pt-1.5">
          <span className="font-medium">Total a cobrar</span>
          <span className="text-lg font-bold tabular-nums text-primary">{fmt(due)}</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="received-amount">Recibido</label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
          <Input
            id="received-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            disabled={disabled}
            value={text}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9.]/g, "");
              setText(raw);
              onCustom(parseMoneyInput(raw));
            }}
            className={`h-12 pl-7 text-lg font-semibold tabular-nums ${exceeds ? "border-rose-500 focus-visible:ring-rose-500" : ""}`}
          />
        </div>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${presets.filter((p) => p.show).length}, minmax(0, 1fr))` }}>
          {presets.filter((p) => p.show).map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={disabled}
              onClick={() => onMode(p.id)}
              className={`rounded-lg border-2 py-2 text-sm font-medium transition-colors ${
                mode === p.id || (mode === "custom" && presetAmount(p.id, total, previous) === received)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {exceeds && (
          <p className="text-xs font-medium text-rose-600">
            Excede lo que debe el cliente ({fmt(due)}).
          </p>
        )}
      </div>

      {received > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {METHODS.map((m) => {
            const active = method === m.value;
            return (
              <button
                key={m.value}
                type="button"
                disabled={disabled}
                onClick={() => onMethod(m.value)}
                className={`flex flex-col items-center gap-1 rounded-lg border-2 px-1 py-2 text-[11px] font-medium transition-colors ${
                  active ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background"
                }`}
              >
                <Icon icon={m.icon} className="h-4 w-4" />
                {m.label}
              </button>
            );
          })}
        </div>
      )}

      {(hasSale || hasDebt) && !exceeds && (
        <div
          className={`flex items-center justify-between rounded-lg px-3 py-2 ${
            left <= 0.004
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
              : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
          }`}
        >
          <span className="text-sm font-medium">{left <= 0.004 ? "Liquidado" : "Queda debiendo"}</span>
          <span className="text-base font-bold tabular-nums">{left <= 0.004 ? fmt(0) : fmt(left)}</span>
        </div>
      )}
    </div>
  );
}
