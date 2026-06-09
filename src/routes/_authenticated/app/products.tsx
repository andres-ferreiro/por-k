import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  listProducts, createProduct, updateProduct,
  listProductCustomerPrices, upsertCustomerPrice, deleteCustomerPrice,
} from "@/lib/api/products.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Tag, X, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/products")({
  component: ProductsPage,
});

interface Product { id: string; name: string; unit: string; price: number; is_active: boolean }

const fmt = (n: number) => n.toLocaleString("es", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });

function ProductsPage() {
  const list = useServerFn(listProducts);
  const { data, isLoading } = useQuery({ queryKey: ["products"], queryFn: () => list() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [pricesFor, setPricesFor] = useState<Product | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Catálogo</h1>
          <p className="text-muted-foreground">Productos y precios compartidos por toda la empresa.</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nuevo producto
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead>Unidad</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Cargando…</TableCell></TableRow>}
            {(data ?? []).map((p: any) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{p.unit}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(Number(p.price ?? 0))}</TableCell>
                <TableCell>{p.is_active ? <Badge>Activo</Badge> : <Badge variant="secondary">Inactivo</Badge>}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" title="Precios por cliente" onClick={() => setPricesFor(p as Product)}>
                    <Tag className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(p as Product); setOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <ProductDialog open={open} onOpenChange={setOpen} editing={editing} />
      <CustomerPricesDialog product={pricesFor} onOpenChange={(o) => !o && setPricesFor(null)} />
    </div>
  );
}

function ProductDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (v: boolean) => void; editing: Product | null }) {
  const qc = useQueryClient();
  const create = useServerFn(createProduct);
  const update = useServerFn(updateProduct);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("pieza");
  const [price, setPrice] = useState("0");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setUnit(editing?.unit ?? "pieza");
      setPrice(String(editing?.price ?? 0));
      setActive(editing?.is_active ?? true);
    }
  }, [open, editing]);

  const mut = useMutation({
    mutationFn: async () => {
      const p = Number(price);
      if (!Number.isFinite(p) || p < 0) throw new Error("Precio inválido.");
      const payload = { name, unit, price: p, is_active: active };
      if (editing) return update({ data: { id: editing.id, ...payload } });
      return create({ data: payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(editing ? "Producto actualizado" : "Producto creado");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Editar producto" : "Nuevo producto"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Unidad</Label><Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pieza, kg…" /></div>
            <div className="space-y-1.5">
              <Label>Precio global</Label>
              <Input type="number" inputMode="decimal" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label>Activo</Label>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={!name || mut.isPending}>
            {mut.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomerPricesDialog({ product, onOpenChange }: { product: Product | null; onOpenChange: (v: boolean) => void }) {
  const open = !!product;
  const list = useServerFn(listProductCustomerPrices);
  const upsert = useServerFn(upsertCustomerPrice);
  const del = useServerFn(deleteCustomerPrice);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["productCustomerPrices", product?.id],
    queryFn: () => list({ data: { product_id: product!.id } }),
    enabled: open,
  });

  useEffect(() => { if (open) setSearch(""); }, [open, product?.id]);

  const setMut = useMutation({
    mutationFn: (vars: { customer_id: string; price: number }) =>
      upsert({ data: { product_id: product!.id, ...vars } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["productCustomerPrices", product?.id] }),
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });
  const delMut = useMutation({
    mutationFn: (customer_id: string) => del({ data: { product_id: product!.id, customer_id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["productCustomerPrices", product?.id] }),
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter((c: any) =>
      c.name.toLowerCase().includes(q) || (c.branch_name ?? "").toLowerCase().includes(q),
    );
  }, [data, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Precios por cliente · {product?.name}</DialogTitle>
          <DialogDescription>
            Si dejas el campo vacío, el cliente paga el precio global ({product ? fmt(Number(product.price ?? 0)) : ""}).
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar cliente o sucursal…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="max-h-[55vh] overflow-y-auto -mx-1 px-1">
          {isLoading && <div className="py-8 text-center text-sm text-muted-foreground">Cargando…</div>}
          {!isLoading && filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">Sin clientes.</div>
          )}
          <div className="divide-y">
            {filtered.map((c: any) => (
              <CustomerPriceRow
                key={c.customer_id}
                row={c}
                globalPrice={Number(product?.price ?? 0)}
                onSave={(price) => setMut.mutate({ customer_id: c.customer_id, price })}
                onClear={() => delMut.mutate(c.customer_id)}
                busy={setMut.isPending || delMut.isPending}
              />
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomerPriceRow({
  row, globalPrice, onSave, onClear, busy,
}: {
  row: { customer_id: string; name: string; branch_name: string | null; price: number | null };
  globalPrice: number;
  onSave: (price: number) => void;
  onClear: () => void;
  busy: boolean;
}) {
  const [val, setVal] = useState<string>(row.price != null ? String(row.price) : "");
  useEffect(() => { setVal(row.price != null ? String(row.price) : ""); }, [row.price]);

  const dirty = (row.price != null ? String(row.price) : "") !== val.trim();

  return (
    <div className="py-2 flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{row.name}</div>
        {row.branch_name && <div className="text-xs text-muted-foreground truncate">{row.branch_name}</div>}
      </div>
      <Input
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        placeholder={`Global ${globalPrice.toFixed(2)}`}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="w-32 text-right tabular-nums"
      />
      <Button
        size="sm"
        disabled={busy || !dirty || val.trim() === ""}
        onClick={() => {
          const n = Number(val);
          if (!Number.isFinite(n) || n < 0) return toast.error("Precio inválido");
          onSave(n);
        }}
      >
        Guardar
      </Button>
      <Button
        size="icon"
        variant="ghost"
        title="Usar precio global"
        disabled={busy || row.price == null}
        onClick={onClear}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
