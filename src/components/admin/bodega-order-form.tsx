import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Add01Icon,
  ArrowDown01Icon,
  MoreHorizontalIcon,
  Search01Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import {
  listBodegaProducts,
  getBodegaOrderForDate,
  placeBodegaOrder,
  cancelBodegaOrder,
  listBodegaOrders,
  getBodegaOrderDetail,
  setBranchReceiptStatus,
} from "@/lib/api/bodega.functions";
import { useBranchScope } from "@/lib/branch-scope";
import { useIsMobile } from "@/hooks/use-mobile";
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
import {
  CorrectionStatusBadge,
  ReceiptStatusBadge,
  SupplyOrderStatusBadge,
  TagBadge,
} from "@/components/admin/status-badge";
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
  TableToolbar,
  DataTableCard,
  TableStatusRow,
} from "@/components/admin/data-table";
import { StatGrid, StatCardSimple } from "@/components/admin/stat-cards";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { QuantityControl } from "@/components/admin/bodega-quantity-control";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

type OrderRow = {
  id: string;
  delivery_date: string;
  status: string;
  bodega_id: string;
  bodega_name: string;
  branch_receipt_status: string | null;
  branch_receipt_note: string | null;
  item_count: number;
  can_edit: boolean;
  notes: string | null;
};

export function BodegaOrderForm({
  bodegas,
  branchName,
}: {
  bodegas: { id: string; name: string; label: string }[];
  branchName?: string;
}) {
  const { branchId } = useBranchScope();
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const listHistory = useServerFn(listBodegaOrders);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [orderOpen, setOrderOpen] = useState(false);
  const [editDeliveryDate, setEditDeliveryDate] = useState<string | null>(null);
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [incompleteFor, setIncompleteFor] = useState<OrderRow | null>(null);

  const historyQ = useQuery({
    queryKey: ["bodegaOrderHistory", branchId],
    queryFn: () => listHistory({ data: { branch_id: branchId, limit: 50 } }),
    enabled: !!branchId,
  });

  const stats = useMemo(() => {
    const rows = historyQ.data ?? [];
    return {
      pending: rows.filter((r) => r.status === "pending").length,
      confirmed: rows.filter((r) => r.status === "confirmed").length,
      total: rows.length,
    };
  }, [historyQ.data]);

  const filteredRows = useMemo(() => {
    let rows = historyQ.data ?? [];
    if (statusFilter !== "all") {
      rows = rows.filter((r) => r.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) =>
        formatDateLabel(r.delivery_date).toLowerCase().includes(q) ||
        (STATUS_LABELS[r.status] ?? r.status).toLowerCase().includes(q),
      );
    }
    return rows;
  }, [historyQ.data, statusFilter, search]);

  const setReceipt = useServerFn(setBranchReceiptStatus);
  const cancelOrder = useServerFn(cancelBodegaOrder);

  const receiptMut = useMutation({
    mutationFn: (vars: {
      order_id: string;
      branch_receipt_status: "received" | "incomplete";
      branch_receipt_note?: string | null;
      items?: { item_id: string; received_quantity: number }[];
    }) => setReceipt({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bodegaOrderHistory"] });
      qc.invalidateQueries({ queryKey: ["bodegaOrderDetail"] });
      toast.success("Recibo actualizado");
      setIncompleteFor(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const cancelMut = useMutation({
    mutationFn: (orderId: string) => cancelOrder({ data: { order_id: orderId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bodegaOrderHistory"] });
      toast.success("Pedido cancelado");
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const bodegaLabels = bodegas.map((b) => b.label).join(", ");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pedidos a bodega"
        description={`Un solo pedido se divide automáticamente entre: ${bodegaLabels}${branchName ? ` · ${branchName}` : ""}`}
        action={
          <Button onClick={() => { setEditDeliveryDate(null); setOrderOpen(true); }}>
            <Icon icon={Add01Icon} className="h-4 w-4 mr-1" />
            Nuevo pedido
          </Button>
        }
      />

      <StatGrid>
        <StatCardSimple label="Pendientes" value={stats.pending} highlight={stats.pending > 0} />
        <StatCardSimple label="Confirmados" value={stats.confirmed} />
        <StatCardSimple label="Total pedidos" value={stats.total} />
      </StatGrid>

      <TableToolbar
        search
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por fecha o estado…"
        filters={
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending">Pendiente</SelectItem>
              <SelectItem value="confirmed">Confirmado</SelectItem>
              <SelectItem value="delivered">Entregado</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <DataTableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Entrega</TableHead>
              <TableHead>Bodega</TableHead>
              <TableHead>Estado bodega</TableHead>
              <TableHead>Recibo</TableHead>
              <TableHead className="text-right">Productos</TableHead>
              <TableHead className="w-[72px] text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableStatusRow colSpan={6} loading={historyQ.isLoading} />
            {historyQ.isError && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-destructive py-8">
                  {(historyQ.error as Error)?.message ?? "Error al cargar pedidos"}
                </TableCell>
              </TableRow>
            )}
            {!historyQ.isLoading && !historyQ.isError && filteredRows.length === 0 && (
              <TableStatusRow colSpan={6} empty emptyMessage="Sin pedidos." />
            )}
            {filteredRows.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">{formatDateLabel(o.delivery_date)}</TableCell>
                <TableCell>
                  <TagBadge className="text-[10px]">{o.bodega_name}</TagBadge>
                </TableCell>
                <TableCell>
                  <SupplyOrderStatusBadge status={o.status} />
                </TableCell>
                <TableCell>
                  {o.branch_receipt_status ? (
                    <ReceiptStatusBadge status={o.branch_receipt_status} />
                  ) : o.status === "delivered" ? (
                    <span className="text-xs text-muted-foreground">Sin confirmar</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{o.item_count}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-8 w-8">
                        <Icon icon={MoreHorizontalIcon} className="h-4 w-4" />
                        <span className="sr-only">Acciones</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => setDetailOrderId(o.id)}>
                        <Icon icon={ViewIcon} className="h-4 w-4 mr-2" />
                        Ver detalle
                      </DropdownMenuItem>
                      {o.status === "delivered" && !o.branch_receipt_status && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={receiptMut.isPending}
                            onClick={() =>
                              receiptMut.mutate({
                                order_id: o.id,
                                branch_receipt_status: "received",
                              })
                            }
                          >
                            Marcar recibido
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={receiptMut.isPending}
                            onClick={() => setIncompleteFor(o)}
                          >
                            Marcar incompleto…
                          </DropdownMenuItem>
                        </>
                      )}
                      {o.status === "pending" && o.can_edit && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              setEditDeliveryDate(o.delivery_date);
                              setOrderOpen(true);
                            }}
                          >
                            Editar pedido
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            disabled={cancelMut.isPending}
                            onClick={() => cancelMut.mutate(o.id)}
                          >
                            Cancelar pedido
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableCard>

      <NewOrderSheet
        open={orderOpen}
        onOpenChange={(v) => { if (!v) setEditDeliveryDate(null); setOrderOpen(v); }}
        bodegas={bodegas}
        isMobile={isMobile}
        initialDeliveryDate={editDeliveryDate}
      />

      <OrderDetailDialog
        orderId={detailOrderId}
        onOpenChange={(open) => !open && setDetailOrderId(null)}
        isMobile={isMobile}
      />

      <IncompleteReceiptDialog
        order={incompleteFor}
        onOpenChange={(open) => !open && setIncompleteFor(null)}
        isMobile={isMobile}
        isPending={receiptMut.isPending}
        onConfirm={(payload) => receiptMut.mutate(payload)}
      />
    </div>
  );
}

function NewOrderSheet({
  open,
  onOpenChange,
  bodegas,
  isMobile,
  initialDeliveryDate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bodegas: { id: string; label: string }[];
  isMobile: boolean;
  initialDeliveryDate?: string | null;
}) {
  const { branchId } = useBranchScope();
  const qc = useQueryClient();
  const listProducts = useServerFn(listBodegaProducts);
  const getOrder = useServerFn(getBodegaOrderForDate);
  const placeOrder = useServerFn(placeBodegaOrder);

  const validDates = useMemo(() => getValidDeliveryDates(5), []);
  const [deliveryDate, setDeliveryDate] = useState(validDates[0] ?? "");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());

  const productsQ = useQuery({
    queryKey: ["bodegaCatalogProducts"],
    queryFn: () => listProducts(),
    enabled: open,
  });

  const orderQ = useQuery({
    queryKey: ["bodegaOrder", branchId, deliveryDate],
    queryFn: () => getOrder({ data: { branch_id: branchId, delivery_date: deliveryDate } }),
    enabled: open && !!branchId && !!deliveryDate,
  });

  useEffect(() => {
    if (!open) return;
    if (orderQ.data) {
      const map: Record<string, number> = {};
      for (const item of orderQ.data.items) map[item.product_id] = item.quantity;
      setQuantities(map);
      setNotes(orderQ.data.notes ?? "");
    } else if (orderQ.isSuccess && !orderQ.data) {
      setQuantities({});
      setNotes("");
    }
  }, [open, orderQ.data, orderQ.isSuccess]);

  useEffect(() => {
    if (open && initialDeliveryDate) setDeliveryDate(initialDeliveryDate);
    else if (open && validDates[0] && !initialDeliveryDate) setDeliveryDate(validDates[0]);
  }, [open, initialDeliveryDate, validDates]);

  const activeProducts = useMemo(
    () => (productsQ.data ?? []).filter((p) => p.is_active),
    [productsQ.data],
  );

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return activeProducts;
    return activeProducts.filter((p) =>
      [p.name, p.unit, p.bodega_category].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  }, [activeProducts, productSearch]);

  const grouped = useMemo(() => {
    const byBodega = new Map<string, Map<string, typeof filteredProducts>>();
    for (const p of filteredProducts) {
      const bodegaKey = p.bodega_name ?? "Sin bodega";
      if (!byBodega.has(bodegaKey)) byBodega.set(bodegaKey, new Map());
      const catMap = byBodega.get(bodegaKey)!;
      const cat = p.bodega_category ?? "Sin categoría";
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat)!.push(p);
    }
    return [...byBodega.entries()].map(([bodegaName, catMap]) => ({
      bodegaName,
      categories: [...catMap.entries()].sort(([a], [b]) => a.localeCompare(b, "es")),
    }));
  }, [filteredProducts]);

  useEffect(() => {
    if (grouped.length > 0) {
      const keys = grouped.flatMap((g) => g.categories.map(([c]) => `${g.bodegaName}::${c}`));
      setOpenCategories(new Set(keys));
    }
  }, [grouped.length, productSearch]);

  const summary = useMemo(() => {
    let totalItems = 0;
    const byCategory = new Map<string, number>();
    for (const p of activeProducts) {
      const qty = quantities[p.id] ?? 0;
      if (qty <= 0) continue;
      totalItems += qty;
      const cat = p.bodega_category ?? "Sin categoría";
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + qty);
    }
    return { totalItems, lineCount: Object.values(quantities).filter((q) => q > 0).length, byCategory };
  }, [activeProducts, quantities]);

  const selectedItems = useMemo(
    () => activeProducts.filter((p) => (quantities[p.id] ?? 0) > 0).map((p) => ({ ...p, qty: quantities[p.id]! })),
    [activeProducts, quantities],
  );

  const canEdit = orderQ.data?.can_edit ?? canOrderForDelivery(deliveryDate);
  const existingOrderId = orderQ.data?.id;

  const saveMut = useMutation({
    mutationFn: async () => {
      const items = Object.entries(quantities)
        .filter(([, q]) => q > 0)
        .map(([product_id, quantity]) => ({ product_id, quantity }));
      if (items.length === 0) throw new Error("Agrega al menos un producto.");
      return placeOrder({
        data: {
          branch_id: branchId,
          delivery_date: deliveryDate,
          notes: notes.trim() || null,
          items,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bodegaOrder"] });
      qc.invalidateQueries({ queryKey: ["bodegaOrderHistory"] });
      qc.invalidateQueries({ queryKey: ["bodegaIncomingOrders"] });
      toast.success("Pedido guardado");
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
        <p className="text-sm font-semibold text-amber-900">Pedido unificado a bodegas</p>
        <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
          {deliveryDate ? bodegaDeadlineMessage(deliveryDate) : "Selecciona fecha de entrega."}
          {" "}Los productos se envían automáticamente a {bodegas.map((b) => b.label).join(" y ")}.
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
      {grouped.map((bodegaGroup) => (
        <div key={bodegaGroup.bodegaName} className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <TagBadge>{bodegaGroup.bodegaName}</TagBadge>
          </div>
          {bodegaGroup.categories.map(([category, products]) => {
            const catKey = `${bodegaGroup.bodegaName}::${category}`;
            const catSelected = products.filter((p) => (quantities[p.id] ?? 0) > 0).length;
            return (
              <Collapsible key={catKey} open={openCategories.has(catKey)}>
                <div className="rounded-xl border overflow-hidden">
                  <CollapsibleTrigger
                    className="flex w-full items-center gap-2.5 px-4 py-3 hover:bg-muted/40 transition-colors"
                    onClick={() =>
                      setOpenCategories((prev) => {
                        const next = new Set(prev);
                        if (next.has(catKey)) next.delete(catKey);
                        else next.add(catKey);
                        return next;
                      })
                    }
                  >
                    <Icon
                      icon={ArrowDown01Icon}
                      className={`h-3.5 w-3.5 text-muted-foreground flex-shrink-0 transition-transform duration-200 ${openCategories.has(catKey) ? "" : "-rotate-90"}`}
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
      ))}
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
            <DrawerTitle className="text-base">Nuevo pedido unificado</DrawerTitle>
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

          <div className="flex-shrink-0 border-t bg-background px-4 py-3 space-y-2">
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
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl sm:max-h-[92vh] sm:h-[92vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0 space-y-0.5">
          <DialogTitle>Nuevo pedido unificado</DialogTitle>
          <DialogDescription>Selecciona productos; se enrutan automáticamente a cada bodega.</DialogDescription>
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

function IncompleteReceiptDialog({
  order,
  onOpenChange,
  isMobile,
  isPending,
  onConfirm,
}: {
  order: OrderRow | null;
  onOpenChange: (open: boolean) => void;
  isMobile: boolean;
  isPending: boolean;
  onConfirm: (payload: {
    order_id: string;
    branch_receipt_status: "incomplete";
    branch_receipt_note?: string | null;
    items: { item_id: string; received_quantity: number }[];
  }) => void;
}) {
  const open = !!order;
  const getDetail = useServerFn(getBodegaOrderDetail);
  const [received, setReceived] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");

  const detailQ = useQuery({
    queryKey: ["bodegaOrderDetail", order?.id, "incomplete"],
    queryFn: () => getDetail({ data: { order_id: order!.id } }),
    enabled: open,
  });

  useEffect(() => {
    if (!open || !detailQ.data) return;
    const map: Record<string, number> = {};
    for (const item of detailQ.data.items) {
      map[item.id] = item.received_quantity ?? item.quantity;
    }
    setReceived(map);
    setNote("");
  }, [open, detailQ.data]);

  const items = detailQ.data?.items ?? [];
  const hasShortage = items.some((item) => (received[item.id] ?? item.quantity) < item.quantity);

  const handleConfirm = () => {
    if (!order) return;
    onConfirm({
      order_id: order.id,
      branch_receipt_status: "incomplete",
      branch_receipt_note: note.trim() || null,
      items: items.map((item) => ({
        item_id: item.id,
        received_quantity: received[item.id] ?? item.quantity,
      })),
    });
  };

  const body = detailQ.isLoading ? (
    <p className="text-sm text-muted-foreground py-10 text-center">Cargando productos…</p>
  ) : (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Indica cuánto recibiste de cada producto. Lo que falte quedará registrado para que el
        repartidor entregue la corrección.
      </p>
      <div className="rounded-xl border overflow-hidden max-h-[50vh] overflow-y-auto">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-0 px-4 py-2 bg-muted/40 border-b text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Producto</span>
          <span className="text-right w-16">Pedido</span>
          <span className="text-right w-24">Recibido</span>
          <span className="text-right w-14">Falta</span>
        </div>
        <ul className="divide-y">
          {items.map((item) => {
            const recv = received[item.id] ?? item.quantity;
            const missing = Math.max(0, item.quantity - recv);
            return (
              <li
                key={item.id}
                className={`grid grid-cols-[1fr_auto_auto_auto] gap-x-3 items-center px-4 py-3 ${missing > 0 ? "bg-destructive/[0.03]" : ""}`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.unit}</p>
                </div>
                <span className="text-sm tabular-nums text-muted-foreground w-16 text-right">
                  {item.quantity}
                </span>
                <div className="w-24 flex justify-end">
                  <QuantityControl
                    value={recv}
                    onChange={(v) => setReceived((prev) => ({ ...prev, [item.id]: v }))}
                  />
                </div>
                <span
                  className={`text-sm tabular-nums font-semibold w-14 text-right ${missing > 0 ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {missing > 0 ? missing : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      {!hasShortage && items.length > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Recibiste todo completo — usa &quot;Marcar recibido&quot; en su lugar.
        </p>
      )}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Nota opcional</Label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Detalles adicionales sobre la entrega…"
          rows={2}
          className="resize-none text-sm"
        />
      </div>
    </div>
  );

  const footer = (
    <div className="flex gap-2 justify-end">
      <Button variant="outline" onClick={() => onOpenChange(false)}>
        Cancelar
      </Button>
      <Button
        variant="destructive"
        disabled={!hasShortage || isPending || detailQ.isLoading}
        onClick={handleConfirm}
      >
        {isPending ? "Guardando…" : "Confirmar incompleto"}
      </Button>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92dvh] flex flex-col">
          <DrawerHeader className="border-b text-left">
            <DrawerTitle>Pedido incompleto</DrawerTitle>
            {order && (
              <p className="text-xs text-muted-foreground">
                {formatDateLabel(order.delivery_date)} · {order.bodega_name}
              </p>
            )}
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-4 py-4">{body}</div>
          <DrawerFooter className="border-t">{footer}</DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Pedido incompleto</DialogTitle>
          <DialogDescription>
            {order
              ? `${formatDateLabel(order.delivery_date)} · ${order.bodega_name}`
              : "Registra las cantidades recibidas."}
          </DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OrderDetailDialog({
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

  const grouped = useMemo(() => {
    const items = detailQ.data?.items ?? [];
    const map = new Map<string, typeof items>();
    for (const item of items) {
      const cat = item.bodega_category ?? "Sin categoría";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    }
    return [...map.entries()];
  }, [detailQ.data?.items]);

  const content = detailQ.isLoading ? (
    <p className="text-sm text-muted-foreground py-10 text-center">Cargando…</p>
  ) : !detailQ.data ? null : (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <SupplyOrderStatusBadge status={detailQ.data.status} />
        {detailQ.data.branch_receipt_status && (
          <ReceiptStatusBadge status={detailQ.data.branch_receipt_status} />
        )}
        {detailQ.data.correction_status === "pending" && (
          <CorrectionStatusBadge status="pending" />
        )}
        {detailQ.data.correction_status === "delivered" && (
          <CorrectionStatusBadge status="delivered" />
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          Entrega: {formatDateLabel(detailQ.data.delivery_date)}
          {detailQ.data.placed_by_name && ` · ${detailQ.data.placed_by_name}`}
        </span>
      </div>

      {detailQ.data.notes && (
        <p className="text-sm rounded-xl border bg-muted/30 px-3 py-2.5">{detailQ.data.notes}</p>
      )}
      {detailQ.data.branch_receipt_note && (
        <p className="text-sm rounded-xl border border-destructive/30 px-3 py-2.5 bg-destructive/5 text-destructive">
          {detailQ.data.branch_receipt_note}
        </p>
      )}

      <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
        {grouped.map(([cat, items]) => (
          <div key={cat} className="rounded-xl border overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/30 border-b">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{cat}</p>
            </div>
            <ul className="divide-y">
              {items.map((item) => {
                const received = item.received_quantity;
                const missing =
                  received != null && received < item.quantity
                    ? item.quantity - received
                    : 0;
                return (
                  <li key={item.id} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                    <span className="flex-1 min-w-0">
                      {item.name}
                      <span className="text-muted-foreground ml-1.5 text-xs">({item.unit})</span>
                    </span>
                    <div className="text-right tabular-nums shrink-0">
                      <span className="font-bold text-primary">×{item.quantity}</span>
                      {received != null && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Recibido: {received}
                          {missing > 0 && (
                            <span className="text-destructive font-medium"> · Falta {missing}</span>
                          )}
                          {item.correction_quantity != null && item.correction_quantity > 0 && (
                            <span className="text-emerald-700 font-medium">
                              {" "}
                              · Corregido: {item.correction_quantity}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="flex flex-col max-h-[90dvh]">
          <DrawerHeader className="border-b text-left px-4 py-3">
            <DrawerTitle>Detalle del pedido</DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-4 py-4">{content}</div>
          <div className="border-t px-4 py-3 flex-shrink-0">
            <Button className="w-full" onClick={() => onOpenChange(false)}>Cerrar</Button>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Detalle del pedido</DialogTitle>
        </DialogHeader>
        {content}
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
