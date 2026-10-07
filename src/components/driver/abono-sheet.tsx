import { useEffect, useState } from "react";
import { ArrowLeftRightIcon, BanknoteIcon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { registerCustomerPayment } from "@/lib/api/accounts.functions";
import { parseMoneyInput, round2 } from "@/lib/account";
type MoneyMethod = "cash" | "transfer" | "other";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: { id: string; name: string; pending_balance: number } | null;
}

const fmt = (n: number) =>
  n.toLocaleString("es", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });

const METHODS: { value: MoneyMethod; label: string; icon: typeof BanknoteIcon }[] = [
  { value: "cash", label: "Efectivo", icon: BanknoteIcon },
  { value: "transfer", label: "Transferencia", icon: ArrowLeftRightIcon },
  { value: "other", label: "Otro", icon: MoreHorizontalIcon },
];

/** Collect money from a customer without a sale (pays down the account balance). */
export function AbonoSheet({ open, onOpenChange, customer }: Props) {
  const [text, setText] = useState("");
  const [method, setMethod] = useState<MoneyMethod>("cash");
  const [note, setNote] = useState("");

  const qc = useQueryClient();
  const register = useServerFn(registerCustomerPayment);

  useEffect(() => {
    if (open) {
      setText("");
      setMethod("cash");
      setNote("");
    }
  }, [open, customer?.id]);

  const balance = round2(customer?.pending_balance ?? 0);
  const amount = parseMoneyInput(text);
  const exceeds = amount > balance + 0.004;
  const newBalance = round2(Math.max(0, balance - amount));

  const mut = useMutation({
    mutationFn: () =>
      register({
        data: { customer_id: customer!.id, amount, method, note: note.trim() || null },
      }),
    onSuccess: (res) => {
      toast.success(res.new_balance > 0 ? `Abono registrado. Debe ${fmt(res.new_balance)}` : "Abono registrado. Cuenta liquidada.");
      qc.invalidateQueries({ queryKey: ["driver"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo registrar el abono."),
  });

  if (!customer) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92dvh]">
        <DrawerHeader>
          <DrawerTitle>Abono</DrawerTitle>
          <DrawerDescription>{customer.name}</DrawerDescription>
        </DrawerHeader>

        <div className="space-y-4 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom,1rem))]">
          <div className="flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2.5 dark:bg-rose-950/20">
            <span className="text-sm font-medium text-rose-700 dark:text-rose-400">Saldo actual</span>
            <span className="text-lg font-bold tabular-nums text-rose-700 dark:text-rose-400">{fmt(balance)}</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="abono-amount">Monto recibido</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                id="abono-amount"
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                placeholder="0.00"
                value={text}
                onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, ""))}
                className={`h-12 pl-7 text-lg font-semibold tabular-nums ${exceeds ? "border-rose-500 focus-visible:ring-rose-500" : ""}`}
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setText(String(balance))}
                className={`rounded-lg border-2 py-2 text-sm font-medium ${
                  amount > 0 && Math.abs(amount - balance) < 0.005 ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background"
                }`}
              >
                Todo el saldo
              </button>
              <button
                type="button"
                onClick={() => setText("")}
                className="rounded-lg border-2 border-input bg-background py-2 text-sm font-medium"
              >
                Borrar
              </button>
            </div>
            {exceeds && (
              <p className="text-xs font-medium text-rose-600">El abono no puede ser mayor al saldo ({fmt(balance)}).</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {METHODS.map((m) => {
              const active = method === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
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

          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="Nota (opcional)"
          />

          {amount > 0 && !exceeds && (
            <div
              className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                newBalance <= 0.004
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
              }`}
            >
              <span className="text-sm font-medium">{newBalance <= 0.004 ? "Liquidado" : "Saldo nuevo"}</span>
              <span className="text-base font-bold tabular-nums">{fmt(newBalance)}</span>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="h-12 flex-1" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
              Cancelar
            </Button>
            <Button
              className="h-12 flex-[2] font-semibold"
              disabled={mut.isPending || amount <= 0 || exceeds}
              onClick={() => mut.mutate()}
            >
              {mut.isPending ? "Guardando…" : amount > 0 ? `Registrar ${fmt(amount)}` : "Registrar abono"}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
