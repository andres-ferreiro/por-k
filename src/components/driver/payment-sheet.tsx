import { ArrowLeftRightIcon, BanknoteIcon, CreditCardIcon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { useEffect, useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useServerFn } from "@tanstack/react-start";
import { createPayment } from "@/lib/api/driver.functions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";


type Method = "cash" | "transfer" | "credit" | "other";
type Status = "paid" | "pending";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: { id: string; name: string } | null;
}

const METHODS: { value: Method; label: string; icon: typeof BanknoteIcon }[] = [
  { value: "cash", label: "Efectivo", icon: BanknoteIcon },
  { value: "transfer", label: "Transferencia", icon: ArrowLeftRightIcon },
  { value: "credit", label: "Crédito", icon: CreditCardIcon },
  { value: "other", label: "Otro", icon: MoreHorizontalIcon },
];

export function PaymentSheet({ open, onOpenChange, customer }: Props) {
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<Status>("paid");
  const [method, setMethod] = useState<Method>("cash");
  const [note, setNote] = useState("");
  const qc = useQueryClient();
  const create = useServerFn(createPayment);

  useEffect(() => {
    if (open) {
      setAmount("");
      setStatus("paid");
      setMethod("cash");
      setNote("");
    }
  }, [open]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!customer) return;
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("Monto inválido.");
      return create({
        data: { customer_id: customer.id, amount: amt, status, method, note: note.trim() || null },
      });
    },
    onSuccess: () => {
      toast.success("Pago registrado.");
      qc.invalidateQueries({ queryKey: ["driver"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo registrar."),
  });

  if (!customer) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh]">
        <DrawerHeader>
          <DrawerTitle>Registrar pago</DrawerTitle>
          <DrawerDescription>{customer.name}</DrawerDescription>
        </DrawerHeader>
        <div className="p-4 space-y-4 overflow-y-auto">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Monto</label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="h-14 text-2xl font-semibold text-center tabular-nums"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Estado</label>
            <div className="grid grid-cols-2 gap-2">
              {(["paid", "pending"] as Status[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`py-3 rounded-lg border-2 text-sm font-medium ${
                    status === s
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

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Método</label>
            <div className="grid grid-cols-2 gap-2">
              {METHODS.map((m) => {
                const active = method === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMethod(m.value)}
                    className={`flex items-center gap-2 px-3 py-3 rounded-lg border-2 text-sm font-medium ${
                      active ? "bg-primary text-primary-foreground border-primary" : "border-input bg-background"
                    }`}
                  >
                    <Icon icon={m.icon} className="h-4 w-4" />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nota (opcional)</label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>
        <div className="p-4 border-t flex gap-2">
          <Button variant="outline" className="flex-1 h-12" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Cancelar
          </Button>
          <Button className="flex-1 h-12" onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
