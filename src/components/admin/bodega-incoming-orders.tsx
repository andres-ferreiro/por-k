import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listBodegaOrders,
  getBodegaOrderDetail,
  updateBodegaOrderStatus,
} from "@/lib/api/bodega.functions";
import { todayInTZ } from "@/lib/tz";
import { addDays, formatDateLabel } from "@/lib/bodega-deadline";
import { useBranchScope } from "@/lib/branch-scope";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePagination } from "@/hooks/use-pagination";
import { ViewIcon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ReceiptStatusBadge,
  StatusBadge,
  SupplyOrderStatusBadge,
  TagBadge,
} from "@/components/admin/status-badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TableToolbar,
  DataTableCard,
  TableStatusRow,
  TablePagination,
} from "@/components/admin/data-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

export function BodegaIncomingOrders({
  bodegaId,
  bodegaName,
}: {
  bodegaId?: string;
  bodegaName?: string;
}) {
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const { branchId } = useBranchScope();
  const listOrders = useServerFn(listBodegaOrders);
  const getDetail = useServerFn(getBodegaOrderDetail);
  const updateStatus = useServerFn(updateBodegaOrderStatus);

  const today = todayInTZ();
  const tomorrow = addDays(today, 1);
  const [deliveryDate, setDeliveryDate] = useState(tomorrow);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);

  const ordersQ = useQuery({
    queryKey: ["bodegaIncomingOrders", branchId, bodegaId, deliveryDate],
    queryFn: () =>
      listOrders({
        data: {
          branch_id: branchId,
          bodega_id: bodegaId,
          delivery_date: deliveryDate,
          order_source: "all",
        },
      }),
    enabled: !!branchId,
  });

  const detailQ = useQuery({
    queryKey: ["bodegaOrderDetail", detailOrderId],
    queryFn: () => getDetail({ data: { order_id: detailOrderId! } }),
    enabled: !!detailOrderId,
  });

  const statusMut = useMutation({
    mutationFn: (vars: { order_id: string; status: "confirmed" | "delivered" | "cancelled" }) =>
      updateStatus({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bodegaIncomingOrders"] });
      qc.invalidateQueries({ queryKey: ["bodegaOrderDetail"] });
      toast.success("Estado actualizado");
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const filteredRows = useMemo(() => {
    let rows = ordersQ.data ?? [];
    if (statusFilter !== "all") {
      rows = rows.filter((r) => r.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => r.branch_name.toLowerCase().includes(q));
    }
    return rows;
  }, [ordersQ.data, statusFilter, search]);

  const pagination = usePagination(filteredRows, undefined, [statusFilter, search, deliveryDate]);

  const stats = useMemo(() => {
    const rows = ordersQ.data ?? [];
    return {
      total: rows.length,
      pending: rows.filter((r) => r.status === "pending").length,
      confirmed: rows.filter((r) => r.status === "confirmed").length,
    };
  }, [ordersQ.data]);

  return (
    <div className="space-y-4">
      {bodegaName && (
        <p className="text-sm text-muted-foreground">
          Mostrando pedidos entrantes para <span className="font-medium text-foreground">{bodegaName}</span>
        </p>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <Button
          size="sm"
          variant={deliveryDate === tomorrow ? "default" : "outline"}
          onClick={() => setDeliveryDate(tomorrow)}
        >
          Mañana ({formatDateLabel(tomorrow)})
        </Button>
        <Button
          size="sm"
          variant={deliveryDate === today ? "default" : "outline"}
          onClick={() => setDeliveryDate(today)}
        >
          Hoy ({formatDateLabel(today)})
        </Button>
        <Input
          type="date"
          value={deliveryDate}
          onChange={(e) => setDeliveryDate(e.target.value)}
          className="w-auto"
        />
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <TagBadge className="normal-case tracking-normal">{stats.total} pedidos</TagBadge>
        <TagBadge className="normal-case tracking-normal">{stats.pending} pendientes</TagBadge>
        <StatusBadge tone="info" className="normal-case tracking-normal">{stats.confirmed} confirmados</StatusBadge>
      </div>

      <TableToolbar
        search
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar sucursal…"
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
              <TableHead>Solicitante</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Recibo sucursal</TableHead>
              <TableHead className="text-right">Productos</TableHead>
              <TableHead className="w-52" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableStatusRow colSpan={6} loading={ordersQ.isLoading} />
            {!ordersQ.isLoading && filteredRows.length === 0 && (
              <TableStatusRow colSpan={6} empty emptyMessage="Sin pedidos para esta fecha." />
            )}
            {pagination.paginatedItems.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-medium">{order.branch_name}</TableCell>
                <TableCell>
                  {order.order_source === "bodega" ? (
                    <StatusBadge tone="info">Inter-bodega</StatusBadge>
                  ) : (
                    <TagBadge>Sucursal</TagBadge>
                  )}
                </TableCell>
                <TableCell>
                  <SupplyOrderStatusBadge status={order.status} />
                </TableCell>
                <TableCell>
                  {order.branch_receipt_status ? (
                    <ReceiptStatusBadge status={order.branch_receipt_status} />
                  ) : order.status === "delivered" ? (
                    <span className="text-xs text-muted-foreground">Sin confirmar</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{order.item_count}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setDetailOrderId(order.id)}>
                      <Icon icon={ViewIcon} className="h-3.5 w-3.5 mr-1" />
                      Ver
                    </Button>
                    {order.status === "pending" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={statusMut.isPending}
                        onClick={() => statusMut.mutate({ order_id: order.id, status: "confirmed" })}
                      >
                        Confirmar
                      </Button>
                    )}
                    {(order.status === "pending" || order.status === "confirmed") && (
                      <Button
                        size="sm"
                        disabled={statusMut.isPending}
                        onClick={() => statusMut.mutate({ order_id: order.id, status: "delivered" })}
                      >
                        Entregado
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination {...pagination.controls} />
      </DataTableCard>

      <IncomingOrderDetail
        open={!!detailOrderId}
        onOpenChange={(o) => !o && setDetailOrderId(null)}
        order={detailQ.data}
        loading={detailQ.isLoading}
        isMobile={isMobile}
        onStatusChange={(status) =>
          detailOrderId && statusMut.mutate({ order_id: detailOrderId, status })
        }
        statusPending={statusMut.isPending}
      />
    </div>
  );
}

function IncomingOrderDetail({
  open,
  onOpenChange,
  order,
  loading,
  isMobile,
  onStatusChange,
  statusPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: {
    branch_name: string;
    delivery_date: string;
    status: string;
    placed_by_name: string | null;
    notes: string | null;
    branch_receipt_status: string | null;
    branch_receipt_note: string | null;
    items: { id: string; name: string; unit: string; quantity: number; bodega_category: string | null }[];
  } | undefined;
  loading: boolean;
  isMobile: boolean;
  onStatusChange: (status: "confirmed" | "delivered") => void;
  statusPending: boolean;
}) {
  const grouped = useMemo(() => {
    const items = order?.items ?? [];
    const map = new Map<string, typeof items>();
    for (const item of items) {
      const cat = item.bodega_category ?? "Sin categoría";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    }
    return [...map.entries()];
  }, [order?.items]);

  const content = loading ? (
    <p className="text-sm text-muted-foreground py-8 text-center">Cargando…</p>
  ) : !order ? null : (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="font-medium">{order.branch_name}</span>
        <SupplyOrderStatusBadge status={order.status} />
        {order.branch_receipt_status && (
          <ReceiptStatusBadge status={order.branch_receipt_status} />
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Entrega: {formatDateLabel(order.delivery_date)}
        {order.placed_by_name && ` · ${order.placed_by_name}`}
      </p>
      {order.notes && (
        <p className="text-sm rounded-md border p-2 bg-muted/30">{order.notes}</p>
      )}
      {order.branch_receipt_note && (
        <p className="text-sm rounded-md border border-destructive/30 p-2 bg-destructive/5">
          Nota sucursal: {order.branch_receipt_note}
        </p>
      )}
      <div className="space-y-3 max-h-[40vh] overflow-y-auto">
        {grouped.map(([cat, items]) => (
          <div key={cat}>
            <p className="text-sm font-medium mb-1">{cat}</p>
            <ul className="space-y-1 text-sm">
              {items.map((item) => (
                <li key={item.id} className="flex justify-between gap-4">
                  <span>{item.name} <span className="text-muted-foreground">({item.unit})</span></span>
                  <span className="tabular-nums font-medium">{item.quantity}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 pt-2 border-t">
        {order.status === "pending" && (
          <Button size="sm" variant="outline" disabled={statusPending} onClick={() => onStatusChange("confirmed")}>
            Confirmar
          </Button>
        )}
        {(order.status === "pending" || order.status === "confirmed") && (
          <Button size="sm" disabled={statusPending} onClick={() => onStatusChange("delivered")}>
            Marcar entregado
          </Button>
        )}
      </div>
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
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Detalle del pedido</DialogTitle></DialogHeader>
        {content}
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
