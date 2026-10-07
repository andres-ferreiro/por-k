import { useEffect, useMemo, useState } from "react";
import { Download01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/admin/status-badge";
import { TableStatusRow } from "@/components/admin/data-table";
import { adjustCustomerBalance, getCustomerAccount, registerCustomerPayment } from "@/lib/api/accounts.functions";
import { fmtDateMedium, fmtMoney } from "@/lib/format";
import { downloadCSV } from "@/lib/csv";
import { parseMoneyInput, round2, type AccountMovement } from "@/lib/account";

interface Props {
  customerId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Owner and supervisor only (the database enforces it too). */
  canAdjust: boolean;
}

type Filter = "all" | "sale" | "payment" | "adjustment";
type Form = null | "abono" | "ajuste";

const METHOD_LABEL: Record<string, string> = {
  cash: "efectivo", transfer: "transferencia", credit: "crédito", other: "otro",
};

function concept(m: AccountMovement): string {
  switch (m.kind) {
    case "opening":
      return "Saldo inicial";
    case "sale":
      return m.amount >= 0 ? "Venta" : "Venta (corrección)";
    case "payment": {
      const how = m.method ? ` (${METHOD_LABEL[m.method] ?? m.method})` : "";
      const base = m.amount < 0 ? `Abono${how}` : "Pago revertido";
      return m.note ? `${base}: ${m.note}` : base;
    }
    case "adjustment":
      return m.note ? `Ajuste: ${m.note}` : "Ajuste";
  }
}

export function CustomerAccountSheet({ customerId, open, onOpenChange, canAdjust }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [form, setForm] = useState<Form>(null);

  const getAccount = useServerFn(getCustomerAccount);
  const q = useQuery({
    queryKey: ["account", customerId],
    queryFn: () => getAccount({ data: { customer_id: customerId! } }),
    enabled: open && !!customerId,
  });

  useEffect(() => {
    if (open) {
      setFilter("all");
      setForm(null);
    }
  }, [open, customerId]);

  const movements = useMemo(() => {
    const all = q.data?.movements ?? [];
    if (filter === "all") return all;
    if (filter === "sale") return all.filter((m) => m.kind === "sale" || m.kind === "opening");
    return all.filter((m) => m.kind === filter);
  }, [q.data, filter]);

  const data = q.data;
  const balance = data?.customer.balance ?? 0;
  const mismatch = data ? Math.abs(data.ledger_balance - balance) > 0.005 : false;
  const aging = data?.aging;

  function exportCSV() {
    if (!data) return;
    downloadCSV(
      `estado-de-cuenta_${data.customer.name.replace(/\s+/g, "-")}.csv`,
      [...data.movements].reverse().map((m) => ({
        fecha: m.occurred_on,
        concepto: concept(m),
        cargo: m.amount > 0 ? m.amount : "",
        abono: m.amount < 0 ? -m.amount : "",
        saldo: m.balance,
      })),
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <SheetHeader className="shrink-0 border-b px-6 py-4 text-left">
          <SheetTitle>{data?.customer.name ?? "Estado de cuenta"}</SheetTitle>
          <SheetDescription>Estado de cuenta del cliente</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {q.isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>}
          {q.isError && (
            <p className="py-8 text-center text-sm text-destructive">No se pudo cargar el estado de cuenta.</p>
          )}

          {data && (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Debe</div>
                  <div
                    className={`text-3xl font-bold tabular-nums ${balance > 0 ? "text-rose-600" : "text-emerald-600"}`}
                  >
                    {fmtMoney(balance)}
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  Último abono
                  <div className="text-sm font-medium text-foreground">
                    {data.last_payment_on ? fmtDateMedium(data.last_payment_on) : "nunca"}
                  </div>
                </div>
              </div>

              {mismatch && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  El saldo ({fmtMoney(balance)}) no coincide con el historial ({fmtMoney(data.ledger_balance)}).
                  Avisa a soporte antes de registrar más movimientos.
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setForm(form === "abono" ? null : "abono")} disabled={balance <= 0}>
                  Registrar abono
                </Button>
                {canAdjust && (
                  <Button size="sm" variant="outline" onClick={() => setForm(form === "ajuste" ? null : "ajuste")}>
                    Ajuste
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={exportCSV} className="ml-auto">
                  <Icon icon={Download01Icon} className="mr-1 h-3.5 w-3.5" /> CSV
                </Button>
              </div>

              {form === "abono" && (
                <AbonoForm
                  customerId={data.customer.id}
                  balance={balance}
                  onDone={() => setForm(null)}
                />
              )}
              {form === "ajuste" && canAdjust && (
                <AdjustForm customerId={data.customer.id} balance={balance} onDone={() => setForm(null)} />
              )}

              {aging && balance > 0 && (
                <div className="rounded-lg border p-3">
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Antigüedad (estimada)
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {([
                      ["0–30 días", aging.d0_30, ""],
                      ["31–60", aging.d31_60, "text-amber-600"],
                      ["61–90", aging.d61_90, "text-rose-600"],
                      ["+90", aging.d90_plus, "text-rose-700"],
                    ] as const).map(([label, value, cls]) => (
                      <div key={label}>
                        <div className="text-[11px] text-muted-foreground">{label}</div>
                        <div className={`text-sm font-semibold tabular-nums ${value > 0 ? cls : "text-muted-foreground"}`}>
                          {fmtMoney(value)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Los abonos se aplican primero a lo más antiguo. Es una estimación: el sistema lleva un solo saldo por cliente.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                {([
                  ["all", "Todo"],
                  ["sale", "Ventas"],
                  ["payment", "Abonos"],
                  ["adjustment", "Ajustes"],
                ] as [Filter, string][]).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFilter(id)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      filter === id ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Concepto</TableHead>
                      <TableHead className="text-right">Cargo</TableHead>
                      <TableHead className="text-right">Abono</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.length === 0 && (
                      <TableStatusRow colSpan={5} empty emptyMessage="Sin movimientos." />
                    )}
                    {movements.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap text-xs">{fmtDateMedium(m.occurred_on)}</TableCell>
                        <TableCell className="max-w-[220px] text-sm">
                          <span className="line-clamp-2">{concept(m)}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {m.amount > 0 ? fmtMoney(m.amount) : ""}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-700">
                          {m.amount < 0 ? fmtMoney(-m.amount) : ""}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{fmtMoney(m.balance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {filter !== "all" && (
                <p className="text-[11px] text-muted-foreground">
                  El saldo de cada línea considera todos los movimientos, aunque el filtro oculte algunos.
                </p>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function useInvalidateAccounts() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["account"] });
    qc.invalidateQueries({ queryKey: ["receivables"] });
    qc.invalidateQueries({ queryKey: ["customers"] });
    qc.invalidateQueries({ queryKey: ["admin"] });
  };
}

function AbonoForm({ customerId, balance, onDone }: { customerId: string; balance: number; onDone: () => void }) {
  const [text, setText] = useState("");
  const [method, setMethod] = useState<"cash" | "transfer" | "other">("cash");
  const [note, setNote] = useState("");
  const invalidate = useInvalidateAccounts();
  const register = useServerFn(registerCustomerPayment);

  const amount = parseMoneyInput(text);
  const exceeds = amount > round2(balance) + 0.004;

  const mut = useMutation({
    mutationFn: () => register({ data: { customer_id: customerId, amount, method, note: note.trim() || null } }),
    onSuccess: (res) => {
      toast.success(res.new_balance > 0 ? `Abono registrado. Debe ${fmtMoney(res.new_balance)}` : "Abono registrado. Cuenta liquidada.");
      invalidate();
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo registrar el abono"),
  });

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="abono-monto">Monto</Label>
          <Input
            id="abono-monto"
            inputMode="decimal"
            placeholder="0.00"
            value={text}
            onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, ""))}
            className={exceeds ? "border-rose-500" : ""}
          />
        </div>
        <div className="space-y-1.5">
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
      <div className="flex flex-wrap gap-1.5">
        <Button type="button" size="sm" variant="outline" onClick={() => setText(String(round2(balance)))}>
          Todo el saldo ({fmtMoney(balance)})
        </Button>
      </div>
      {exceeds && <p className="text-xs font-medium text-rose-600">No puede ser mayor al saldo ({fmtMoney(balance)}).</p>}
      <div className="space-y-1.5">
        <Label htmlFor="abono-nota">Nota (opcional)</Label>
        <Input id="abono-nota" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone} disabled={mut.isPending}>Cancelar</Button>
        <Button type="button" size="sm" onClick={() => mut.mutate()} disabled={mut.isPending || amount <= 0 || exceeds}>
          {mut.isPending ? "Guardando…" : amount > 0 ? `Registrar ${fmtMoney(amount)}` : "Registrar"}
        </Button>
      </div>
    </div>
  );
}

function AdjustForm({ customerId, balance, onDone }: { customerId: string; balance: number; onDone: () => void }) {
  const [direction, setDirection] = useState<"down" | "up">("down");
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const invalidate = useInvalidateAccounts();
  const adjust = useServerFn(adjustCustomerBalance);

  const amount = parseMoneyInput(text);
  const signed = direction === "down" ? -amount : amount;
  const tooMuch = direction === "down" && amount > round2(balance) + 0.004;
  const noteOk = note.trim().length >= 3;

  const mut = useMutation({
    mutationFn: () => adjust({ data: { customer_id: customerId, amount: signed, note: note.trim() } }),
    onSuccess: (res) => {
      toast.success(`Ajuste registrado. Debe ${fmtMoney(res.new_balance)}`);
      invalidate();
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo registrar el ajuste"),
  });

  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
      <p className="text-xs text-muted-foreground">
        Un ajuste cambia el saldo <b>sin</b> registrar dinero recibido (por ejemplo, una deuda pagada fuera del sistema).
        Queda en el historial con su motivo.
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {([
          ["down", "Reduce la deuda"],
          ["up", "Aumenta la deuda"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setDirection(id)}
            className={`rounded-md border-2 py-1.5 text-sm font-medium ${
              direction === id ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="adj-monto">Monto</Label>
        <Input
          id="adj-monto"
          inputMode="decimal"
          placeholder="0.00"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, ""))}
          className={tooMuch ? "border-rose-500" : ""}
        />
        {tooMuch && <p className="text-xs font-medium text-rose-600">El saldo no puede quedar negativo.</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="adj-nota">Motivo (obligatorio)</Label>
        <Textarea
          id="adj-nota"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="Ej: el cliente pagó en la oficina el 12 de agosto"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <StatusBadge tone="neutral" className="normal-case tracking-normal tabular-nums">
          Saldo nuevo: {fmtMoney(Math.max(0, round2(balance + signed)))}
        </StatusBadge>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onDone} disabled={mut.isPending}>Cancelar</Button>
          <Button
            type="button"
            size="sm"
            onClick={() => mut.mutate()}
            disabled={mut.isPending || amount <= 0 || !noteOk || tooMuch}
          >
            {mut.isPending ? "Guardando…" : "Registrar ajuste"}
          </Button>
        </div>
      </div>
    </div>
  );
}
