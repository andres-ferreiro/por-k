import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Add01Icon,
  ArrowDown01Icon,
  Search01Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import {
  listBodegaProducts,
  getBodegaOrdersForDate,
  placeInterBodegaOrder,
  listBodegaOrders,
  getBodegaOrderDetail,
} from "@/lib/api/bodega.functions";
import { useBranchScope } from "@/lib/branch-scope";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePagination } from "@/hooks/use-pagination";
import {
  getValidDeliveryDates,
  bodegaDeadlineMessage,
  formatDateLabel,
  canOrderForDelivery,
} from "@/lib/bodega-deadline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SupplyOrderStatusBadge, TagBadge } from "@/components/admin/status-badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PageHeader,
  DataTableCard,
  TableStatusRow,
  TablePagination,
} from "@/components/admin/data-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { QuantityControl } from "@/components/admin/bodega-quantity-control";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

export function BodegaInterOrderForm({
  fromBodegaId,
  fromBodegaName,
  targetBodegas,
}: {
  fromBodegaId: string;
  fromBodegaName: string;
  targetBodegas: { id: string; name: string; label: string }[];
}) {
  const { branchId } = useBranchScope();
  const isMobile = useIsMobile();
  const listHistory = useServerFn(listBodegaOrders);
  const [orderOpen, setOrderOpen] = useState(false);
  const [targetBodegaId, setTargetBodegaId] = useState(targetBodegas[0]?.id ?? "");
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (!targetBodegaId && targetBodegas[0]) setTargetBodegaId(targetBodegas[0].id);
  }, [targetBodegas, targetBodegaId]);

  const historyQ = useQuery({
    queryKey: ["bodegaInterOrders", branchId],
    queryFn: () =>
      listHistory({
        data: {
          branch_id: branchId,
          order_source: "bodega",
          limit: 30,
        },
      }),
    enabled: !!branchId,
  });

  const historyRows = historyQ.data ?? [];
  const pagination = usePagination(historyRows);

  const targetLabel = targetBodegas.find((b) => b.id === targetBodegaId)?.label ?? "";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pedidos a otra bodega"
        description={`Desde ${fromBodegaName} · solicita insumos del catálogo de otra bodega.`}
        action={
          <Button onClick={() => setOrderOpen(true)} disabled={!targetBodegaId}>
            <Icon icon={Add01Icon} className="h-4 w-4 mr-1" />
            Nuevo pedido
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-sm text-muted-foreground">Bodega destino</Label>
        <Select value={targetBodegaId} onValueChange={setTargetBodegaId}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Seleccionar bodega" />
          </SelectTrigger>
          <SelectContent>
            {targetBodegas.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Entrega</TableHead>
              <TableHead>Destino</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Productos</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableStatusRow colSpan={5} loading={historyQ.isLoading} />
            {!historyQ.isLoading && historyRows.length === 0 && (
              <TableStatusRow colSpan={5} empty emptyMessage="Sin pedidos inter-bodega." />
            )}
            {pagination.paginatedItems.map((o) => (
              <TableRow key={o.id}>
                <TableCell>{formatDateLabel(o.delivery_date)}</TableCell>
                <TableCell>{o.bodega_name}</TableCell>
                <TableCell>
                  <SupplyOrderStatusBadge status={o.status} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{o.item_count}</TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => setDetailOrderId(o.id)}>
                    <Icon icon={ViewIcon} className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination {...pagination.controls} />
      </DataTableCard>

      <InterOrderSheet
        open={orderOpen}
        onOpenChange={setOrderOpen}
        fromBodegaId={fromBodegaId}
        targetBodegaId={targetBodegaId}
        targetBodegaName={targetLabel}
        isMobile={isMobile}
      />

      <InterOrderDetail
        orderId={detailOrderId}
        onOpenChange={(open) => !open && setDetailOrderId(null)}
        isMobile={isMobile}
      />
    </div>
  );
}

function InterOrderSheet({
  open,
  onOpenChange,
  fromBodegaId,
  targetBodegaId,
  targetBodegaName,
  isMobile,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fromBodegaId: string;
  targetBodegaId: string;
  targetBodegaName: string;
  isMobile: boolean;
}) {
  const qc = useQueryClient();
  const listProducts = useServerFn(listBodegaProducts);
  const getOrders = useServerFn(getBodegaOrdersForDate);
  const placeOrder = useServerFn(placeInterBodegaOrder);

  const validDates = useMemo(() => getValidDeliveryDates(5), []);
  const [deliveryDate, setDeliveryDate] = useState(validDates[0] ?? "");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());

  const productsQ = useQuery({
    queryKey: ["bodegaInterCatalog", targetBodegaId],
    queryFn: () => listProducts(),
    enabled: open && !!targetBodegaId,
    select: (rows) => rows.filter((p) => p.bodega_id === targetBodegaId && p.is_active),
  });

  const orderQ = useQuery({
    queryKey: ["bodegaInterOrder", fromBodegaId, targetBodegaId, deliveryDate],
    queryFn: () =>
      getOrders({
        data: {
          branch_id: fromBodegaId,
          delivery_date: deliveryDate,
          order_source: "bodega",
          target_bodega_id: targetBodegaId,
        },
      }),
    enabled: open && !!fromBodegaId && !!targetBodegaId && !!deliveryDate,
  });

  useEffect(() => {
    if (!open) return;
    if (orderQ.data) {
      const map: Record<string, number> = {};
      for (const item of orderQ.data.merged_items) map[item.product_id] = item.quantity;
      setQuantities(map);
      setNotes(orderQ.data.orders[0]?.notes ?? "");
    } else if (orderQ.isSuccess) {
      setQuantities({});
      setNotes("");
    }
  }, [open, orderQ.data, orderQ.isSuccess]);

  useEffect(() => {
    if (open && validDates[0]) setDeliveryDate(validDates[0]);
  }, [open, validDates]);

  const activeProducts = productsQ.data ?? [];

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return activeProducts;
    return activeProducts.filter((p) =>
      [p.name, p.unit, p.bodega_category].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  }, [activeProducts, productSearch]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filteredProducts>();
    for (const p of filteredProducts) {
      const cat = p.bodega_category ?? "Sin categoría";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "es"));
  }, [filteredProducts]);

  useEffect(() => {
    if (grouped.length > 0) setOpenCategories(new Set(grouped.map(([c]) => c)));
  }, [grouped.length, productSearch]);

  const summary = useMemo(() => {
    let totalItems = 0;
    for (const p of activeProducts) {
      const qty = quantities[p.id] ?? 0;
      if (qty > 0) totalItems += qty;
    }
    return {
      totalItems,
      lineCount: Object.values(quantities).filter((q) => q > 0).length,
    };
  }, [activeProducts, quantities]);

  const selectedItems = useMemo(
    () => activeProducts.filter((p) => (quantities[p.id] ?? 0) > 0).map((p) => ({ ...p, qty: quantities[p.id]! })),
    [activeProducts, quantities],
  );

  const canEdit = orderQ.data?.orders.every((o) => o.can_edit) ?? canOrderForDelivery(deliveryDate);
  const existingOrderId = orderQ.data?.orders[0]?.id;

  const saveMut = useMutation({
    mutationFn: async () => {
      const items = Object.entries(quantities)
        .filter(([, q]) => q > 0)
        .map(([product_id, quantity]) => ({ product_id, quantity }));
      if (items.length === 0) throw new Error("Agrega al menos un producto.");
      return placeOrder({
        data: {
          from_bodega_id: fromBodegaId,
          to_bodega_id: targetBodegaId,
          delivery_date: deliveryDate,
          notes: notes.trim() || null,
          items,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bodegaInterOrders"] });
      qc.invalidateQueries({ queryKey: ["bodegaInterOrder"] });
      qc.invalidateQueries({ queryKey: ["bodegaIncomingOrders"] });
      toast.success("Pedido inter-bodega guardado");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const setQty = (productId: string, v: number) => {
    setQuantities((prev) => {
      const next = { ...prev };
      if (v <= 0) delete next[productId];
      else next[productId] = v;
      return next;
    });
  };

  const deadlineBanner = (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-900">Pedido a {targetBodegaName}</p>
        <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
          {deliveryDate ? bodegaDeadlineMessage(deliveryDate) : "Selecciona fecha de entrega."}
        </p>
      </div>
    </div>
  );

  const dateSelector = (
    <div className="flex flex-wrap gap-1.5 items-center">
      {validDates.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => setDeliveryDate(d)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-all ${
            deliveryDate === d
              ? "bg-foreground text-background border-foreground shadow-sm"
              : "border-border text-muted-foreground hover:border-foreground/50 hover:text-foreground"
          }`}
        >
          {formatDateLabel(d)}
        </button>
      ))}
      <Input
        type="date"
        value={deliveryDate}
        min={validDates[0]}
        onChange={(e) => setDeliveryDate(e.target.value)}
        className="w-auto h-8 text-xs"
      />
    </div>
  );

  const searchBar = (
    <div className="relative">
      <Icon
        icon={Search01Icon}
        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
      />
      <Input
        className="pl-9 bg-muted/40 border-transparent focus-visible:border-input focus-visible:bg-background transition-colors"
        placeholder="Buscar productos…"
        value={productSearch}
        onChange={(e) => setProductSearch(e.target.value)}
      />
    </div>
  );

  const productList = (
    <div className="space-y-2">
      {productsQ.isLoading && (
        <p className="text-sm text-muted-foreground py-6 text-center">Cargando productos…</p>
      )}
      {!productsQ.isLoading && grouped.length === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center">Sin productos que coincidan.</p>
      )}
      {grouped.map(([category, products]) => {
        const catSelected = products.filter((p) => (quantities[p.id] ?? 0) > 0).length;
        return (
          <Collapsible key={category} open={openCategories.has(category)}>
            <div className="rounded-xl border overflow-hidden">
              <CollapsibleTrigger
                className="flex w-full items-center gap-2.5 px-4 py-3 hover:bg-muted/40 transition-colors"
                onClick={() =>
                  setOpenCategories((prev) => {
                    const next = new Set(prev);
                    if (next.has(category)) next.delete(category);
                    else next.add(category);
                    return next;
                  })
                }
              >
                <Icon
                  icon={ArrowDown01Icon}
                  className={`h-3.5 w-3.5 text-muted-foreground flex-shrink-0 transition-transform duration-200 ${openCategories.has(category) ? "" : "-rotate-90"}`}
                />
                <span className="font-semibold text-sm flex-1 text-left">{category}</span>
                {catSelected > 0 && (
                  <Badge variant="primary" className="h-5 text-[10px] px-1.5">
                    {catSelected} sel.
                  </Badge>
                )}
                <TagBadge className="h-5 text-[10px] px-1.5">
                  {products.length}
                </TagBadge>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="divide-y border-t">
                  {products.map((p) => {
                    const qty = quantities[p.id] ?? 0;
                    return (
                      <div
                        key={p.id}
                        className={`flex items-center gap-3 px-4 py-3 transition-colors ${qty > 0 ? "bg-primary/[0.03]" : ""}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate transition-colors ${qty > 0 ? "text-primary" : ""}`}>
                            {p.name}
                          </p>
                          <p className="text-xs text-muted-foreground">{p.unit}</p>
                        </div>
                        <QuantityControl
                          value={qty}
                          disabled={!canEdit}
                          onChange={(v) => setQty(p.id, v)}
                        />
                      </div>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })}
    </div>
  );

  const summarySidebar = (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b bg-muted/10 flex-shrink-0">
        <h3 className="font-semibold text-sm">Resumen del pedido</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Entrega: {deliveryDate ? formatDateLabel(deliveryDate) : "—"}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-3 min-h-0">
        {selectedItems.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-1 py-8">
            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              Los productos que agregues<br />aparecerán aquí
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {selectedItems.map((item) => (
              <li key={item.id} className="flex items-start gap-2 text-sm">
                <span className="flex-1 leading-snug text-foreground/80">{item.name}</span>
                <span className="tabular-nums font-bold text-primary whitespace-nowrap">×{item.qty}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex-shrink-0 border-t bg-muted/10 px-5 py-4 space-y-3.5">
        <div className="grid grid-cols-2 gap-y-1 text-sm">
          <span className="text-muted-foreground">Productos</span>
          <span className="text-right font-semibold tabular-nums">{summary.lineCount}</span>
          <span className="text-muted-foreground">Unidades</span>
          <span className="text-right font-semibold tabular-nums">{summary.totalItems}</span>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Notas opcionales</Label>
          <Textarea
            value={notes}
            disabled={!canEdit}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Instrucciones especiales…"
            rows={2}
            className="text-sm resize-none"
          />
        </div>

        {!canEdit && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
            El plazo para modificar este pedido ya cerró (3:00 PM del día anterior).
          </p>
        )}

        <Button
          className="w-full"
          size="default"
          onClick={() => saveMut.mutate()}
          disabled={!canEdit || saveMut.isPending || summary.lineCount === 0}
        >
          {saveMut.isPending ? "Guardando…" : existingOrderId ? "Actualizar pedido" : "Enviar pedido"}
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[95dvh] flex flex-col">
          <DrawerHeader className="border-b px-4 py-3 flex-shrink-0 text-left gap-0.5">
            <DrawerTitle className="text-base">Pedido a {targetBodegaName}</DrawerTitle>
            {deliveryDate && (
              <p className="text-xs text-muted-foreground">
                Entrega: {formatDateLabel(deliveryDate)}
              </p>
            )}
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="px-4 py-4 space-y-4">
              {deadlineBanner}
              {dateSelector}
              {searchBar}
              {productList}
              <div className="space-y-1.5 pt-1">
                <Label className="text-xs text-muted-foreground">Notas opcionales</Label>
                <Textarea
                  value={notes}
                  disabled={!canEdit}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Instrucciones especiales…"
                  rows={2}
                  className="resize-none text-sm"
                />
              </div>
            </div>
          </div>

          <DrawerFooter className="flex-shrink-0 border-t bg-background px-4 py-3 space-y-2">
            {summary.lineCount > 0 && (
              <p className="text-xs text-muted-foreground text-center tabular-nums">
                {summary.lineCount} producto{summary.lineCount !== 1 ? "s" : ""} · {summary.totalItems} unidades
              </p>
            )}
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                className="col-span-2"
                onClick={() => saveMut.mutate()}
                disabled={!canEdit || saveMut.isPending || summary.lineCount === 0}
              >
                {saveMut.isPending ? "Guardando…" : existingOrderId ? "Actualizar" : "Enviar pedido"}
              </Button>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl sm:max-h-[92vh] sm:h-[92vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0 space-y-0.5">
          <DialogTitle>Pedido a {targetBodegaName}</DialogTitle>
          <DialogDescription>Productos del catálogo de la bodega destino.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <div className="px-6 py-4 space-y-3 border-b flex-shrink-0">
              {deadlineBanner}
              {dateSelector}
              {searchBar}
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {productList}
            </div>
          </div>

          <aside className="w-72 border-l flex-shrink-0 flex flex-col min-h-0 overflow-hidden">
            {summarySidebar}
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InterOrderDetail({
  orderId,
  onOpenChange,
  isMobile,
}: {
  orderId: string | null;
  onOpenChange: (open: boolean) => void;
  isMobile: boolean;
}) {
  const open = !!orderId;
  const getDetail = useServerFn(getBodegaOrderDetail);
  const detailQ = useQuery({
    queryKey: ["bodegaOrderDetail", orderId],
    queryFn: () => getDetail({ data: { order_id: orderId! } }),
    enabled: open,
  });

  const content = detailQ.isLoading ? (
    <p className="text-sm text-muted-foreground py-8 text-center">Cargando…</p>
  ) : !detailQ.data ? null : (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <TagBadge>→ {detailQ.data.bodega_name}</TagBadge>
        <SupplyOrderStatusBadge status={detailQ.data.status} />
      </div>
      <ul className="space-y-2 text-sm max-h-[50vh] overflow-y-auto">
        {detailQ.data.items.map((item) => (
          <li key={item.id} className="flex justify-between gap-4">
            <span>{item.name} <span className="text-muted-foreground">({item.unit})</span></span>
            <span className="font-semibold tabular-nums">{item.quantity}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader><DrawerTitle>Detalle del pedido</DrawerTitle></DrawerHeader>
          <div className="px-4 pb-6">{content}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Detalle del pedido</DialogTitle></DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
