import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDateMedium, fmtMoney } from "@/lib/format";
import {
  getCustomerAccount,
  registerCustomerPayment,
  type AccountMovementKind,
} from "@/lib/api/accounts.functions";

const KIND_LABEL: Record<AccountMovementKind, string> = {
  opening: "Saldo inicial",
  sale: "Venta a crédito",
  payment: "Pago / abono",
  adjustment: "Ajuste",
};

const METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
  credit: "Crédito",
  other: "Otro",
};

type Props = {
  customer: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
};

/** Read-only statement of a customer's account + form to register a (partial) payment. */
export function CustomerAccountDialog({ customer, onOpenChange }: Props) {
  const getAccount = useServerFn(getCustomerAccount);
  const register = useServerFn(registerCustomerPayment);
  const qc = useQueryClient();

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "transfer" | "other">("cash");
  const [note, setNote] = useState("");

  const customerId = customer?.id;

  useEffect(() => {
    setAmount("");
    setMethod("cash");
    setNote("");
  }, [customerId]);

  const accountQ = useQuery({
    queryKey: ["customerAccount", customerId],
    queryFn: () => getAccount({ data: { customer_id: customerId! } }),
    enabled: !!customerId,
  });

  const balance = accountQ.data?.customer.balance ?? 0;
  const parsed = Number(amount);
  const validAmount = Number.isFinite(parsed) && parsed > 0;
  const overBalance = validAmount && parsed > balance + 0.001;

  const payMut = useMutation({
    mutationFn: () =>
      register({
        data: { customer_id: customerId!, amount: parsed, method, note: note.trim() || null },
      }),
    onSuccess: (res) => {
      toast.success(
        res.new_balance > 0
          ? `Abono registrado. Resta ${fmtMoney(res.new_balance)}`
          : "Abono registrado. Cuenta saldada",
      );
      setAmount("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["customerAccount", customerId] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["admin", "payments"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo registrar el abono."),
  });

  return (
    <Dialog open={!!customer} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Estado de cuenta</DialogTitle>
          <DialogDescription>{customer?.name}</DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/40 px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Saldo pendiente</span>
          <span className={`text-2xl font-bold tabular-nums ${balance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
            {accountQ.isLoading ? "…" : fmtMoney(balance)}
          </span>
        </div>

        {balance > 0 && (
          <form
            className="grid gap-3 rounded-lg border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (validAmount && !overBalance) payMut.mutate();
            }}
          >
            <div className="text-sm font-medium">Registrar abono</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="abono-amount">Monto</Label>
                <Input
                  id="abono-amount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Método</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Efectivo</SelectItem>
                    <SelectItem value="transfer">Transferencia</SelectItem>
                    <SelectItem value="other">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="abono-note">Nota (opcional)</Label>
              <Input id="abono-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            </div>
            {overBalance && (
              <p className="text-xs text-rose-600">El abono no puede ser mayor al saldo ({fmtMoney(balance)}).</p>
            )}
            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAmount(String(balance))}>
                Pagar todo
              </Button>
              <Button type="submit" disabled={!validAmount || overBalance || payMut.isPending}>
                {payMut.isPending ? "Guardando…" : "Registrar abono"}
              </Button>
            </div>
          </form>
        )}

        <div className="text-sm font-medium">Movimientos</div>
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Concepto</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accountQ.isLoading && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Cargando…</TableCell></TableRow>
              )}
              {!accountQ.isLoading && (accountQ.data?.movements.length ?? 0) === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Sin movimientos.</TableCell></TableRow>
              )}
              {accountQ.data?.movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap">{fmtDateMedium(m.occurred_on)}</TableCell>
                  <TableCell>
                    <div>{KIND_LABEL[m.kind] ?? m.kind}{m.method ? ` · ${METHOD_LABEL[m.method] ?? m.method}` : ""}</div>
                    {m.note && <div className="text-xs text-muted-foreground">{m.note}</div>}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums ${m.amount < 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {m.amount < 0 ? "−" : "+"}{fmtMoney(Math.abs(m.amount))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{fmtMoney(m.balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
