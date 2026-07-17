import { Add01Icon, Camera01Icon, Cancel01Icon, DeliveryTruck02Icon, Edit01Icon, Package01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useEffect } from "react";
import { getMyContext } from "@/lib/api/context.functions";
import {
  getPreorderRouteInfo,
  listPreorderCustomers,
  listOrdersForDate,
  getOrderDetail,
  upsertOrder,
  cancelOrder,
  getCustomerPricedProductsForOrder,
} from "@/lib/api/orders.functions";
import { listBranchDrivers } from "@/lib/api/routes.functions";
import { useBranchScope } from "@/lib/branch-scope";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePagination } from "@/hooks/use-pagination";
import { todayInTZ } from "@/lib/tz";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DeliveryStatusBadge, StatusBadge, TagBadge } from "@/components/admin/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from "@/components/ui/drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  PageHeader, TableToolbar, DataTableCard, TableStatusRow, TablePagination,
} from "@/components/admin/data-table";
import { PreorderReportDialog } from "@/components/preorders/preorder-report-dialog";
import { StatGrid, StatCardSimple } from "@/components/admin/stat-cards";
import { PhotoCapture } from "@/components/driver/photo-capture";
import { getPhotoViewUrls } from "@/lib/api/driver.functions";

export const Route = createFileRoute("/_authenticated/app/preorders")({
  loader: async ({ context }) => {
    const ctx = await context.queryClient.fetchQuery({
      queryKey: ["myContext"],
      queryFn: () => getMyContext(),
    });
    const allowed = ctx.roles.some((r) => r === "owner" || r === "supervisor" || r === "cashier");
    if (!allowed) throw redirect({ to: "/app" });
    return ctx;
  },
  component: PreordersPage,
});

const fmt = (n: number) => n.toLocaleString("es", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });

const CATEGORY_LABELS: Record<string, string> = {
  hotel: "Hotel",
  restaurant: "Restaurante",
};

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function PreordersPage() {
  const { branchId } = useBranchScope();
  const today = todayInTZ();
  const tomorrow = addDays(today, 1);
  const [deliveryDate, setDeliveryDate] = useState(tomorrow);
  const [search, setSearch] = useState("");
  const [orderFor, setOrderFor] = useState<{ id: string; name: string; category: string } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const getRouteInfo = useServerFn(getPreorderRouteInfo);
  const listCustomers = useServerFn(listPreorderCustomers);
  const listOrders = useServerFn(listOrdersForDate);

  const routeInfoQ = useQuery({
    queryKey: ["preorderRouteInfo", branchId],
    queryFn: () => getRouteInfo({ data: { branch_id: branchId } }),
    enabled: !!branchId,
  });

  const customersQ = useQuery({
    queryKey: ["preorderCustomers", branchId],
    queryFn: () => listCustomers({ data: { branch_id: branchId } }),
    enabled: !!branchId && routeInfoQ.data?.preorder_enabled,
  });

  const ordersQ = useQuery({
    queryKey: ["preorderOrders", branchId, deliveryDate],
    queryFn: () => listOrders({ data: { branch_id: branchId, delivery_date: deliveryDate } }),
    enabled: !!branchId && routeInfoQ.data?.preorder_enabled,
  });

  const orderMap = useMemo(() => {
    const m = new Map<string, NonNullable<typeof ordersQ.data>[number]>();
    for (const o of ordersQ.data ?? []) m.set(o.customer_id, o);
    return m;
  }, [ordersQ.data]);

  const rows = useMemo(() => {
    let list = (customersQ.data ?? []).filter((c) => c.is_active);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        [c.name, c.phone, c.address, c.category].filter(Boolean).join(" ").toLowerCase().includes(q),
      );
    }
    return list;
  }, [customersQ.data, search]);

  const stats = useMemo(() => {
    const total = rows.length;
    const withOrder = rows.filter((c) => orderMap.has(c.id)).length;
    const orderTotal = (ordersQ.data ?? []).reduce((s, o) => s + o.total, 0);
    return { total, withOrder, pending: total - withOrder, orderTotal };
  }, [rows, orderMap, ordersQ.data]);

  const confirmedCount = useMemo(
    () => (ordersQ.data ?? []).filter((o) => o.status === "confirmed").length,
    [ordersQ.data],
  );

  const pagination = usePagination(rows, undefined, [search, deliveryDate]);

  if (!branchId) {
    return (
      <div className="space-y-4">
        <PageHeader title="Pedidos" description="Pedidos anticipados para hoteles y restaurantes." />
        <div className="rounded-lg border border-dashed p-8 text-center space-y-2">
          <p className="font-medium">Selecciona una sucursal</p>
          <p className="text-sm text-muted-foreground">
            Usa el selector de sucursal arriba a la derecha para ver los pedidos de KM 27 u otra sucursal con ruta de pedidos activada.
          </p>
        </div>
      </div>
    );
  }

  if (routeInfoQ.isLoading) {
    return <p className="text-muted-foreground">Cargando…</p>;
  }

  if (!routeInfoQ.data?.preorder_enabled) {
    return (
      <div className="space-y-4">
        <PageHeader title="Pedidos" description="Pedidos anticipados para hoteles y restaurantes." />
        <div className="rounded-lg border border-dashed p-8 text-center space-y-2">
          <Icon icon={Package01Icon} className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="font-medium">Ruta de pedidos no activada</p>
          <p className="text-sm text-muted-foreground">
            El propietario debe activar la ruta de pedidos en la configuración de esta sucursal.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pedidos"
        description={`Ruta: ${routeInfoQ.data.route?.name ?? "—"} · Hoteles y restaurantes`}
      />

      <div className="flex flex-wrap gap-2 items-center">
        <Button
          variant={deliveryDate === today ? "default" : "outline"}
          size="sm"
          onClick={() => setDeliveryDate(today)}
        >
          Hoy
        </Button>
        <Button
          variant={deliveryDate === tomorrow ? "default" : "outline"}
          size="sm"
          onClick={() => setDeliveryDate(tomorrow)}
        >
          Mañana
        </Button>
        <Input
          type="date"
          value={deliveryDate}
          onChange={(e) => setDeliveryDate(e.target.value)}
          className="w-auto"
        />
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => setReportOpen(true)}
          disabled={confirmedCount === 0}
          title={confirmedCount === 0 ? "Sin pedidos confirmados para esta fecha" : "Ver reporte de carga"}
        >
          <Icon icon={DeliveryTruck02Icon} className="h-4 w-4 mr-1" />
          Reporte
        </Button>
      </div>

      <StatGrid>
        <StatCardSimple label="Clientes en ruta" value={String(stats.total)} />
        <StatCardSimple label="Con pedido" value={String(stats.withOrder)} />
        <StatCardSimple label="Sin pedido" value={String(stats.pending)} highlight={stats.pending > 0} />
        <StatCardSimple label="Total pedidos" value={fmt(stats.orderTotal)} />
      </StatGrid>

      <TableToolbar
        search
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar clientes…"
      />

      <DataTableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableStatusRow colSpan={5} loading={customersQ.isLoading || ordersQ.isLoading} />
            {!customersQ.isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10">
                  <div className="text-center space-y-4 max-w-md mx-auto">
                    <Icon icon={Package01Icon} className="h-10 w-10 mx-auto text-muted-foreground" />
                    <div>
                      <p className="font-medium">No hay clientes en la ruta de pedidos</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Los pedidos solo aparecen para clientes <strong>Hotel</strong> o <strong>Restaurante</strong> agregados a esta ruta.
                      </p>
                    </div>
                    <ol className="text-sm text-left text-muted-foreground space-y-2 list-decimal list-inside">
                      <li>Crea clientes con categoría Hotel o Restaurante en <Link to="/app/customers" className="text-primary underline">Clientes</Link></li>
                      {routeInfoQ.data?.route?.id && (
                        <li>
                          Agrégalos a la ruta en{" "}
                          <Link
                            to="/app/routes/$routeId"
                            params={{ routeId: routeInfoQ.data.route.id }}
                            className="text-primary underline"
                          >
                            Configurar ruta de pedidos
                          </Link>
                        </li>
                      )}
                      <li>Vuelve aquí y usa el botón <strong>Pedido</strong> en cada fila</li>
                    </ol>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {pagination.paginatedItems.map((c) => {
              const order = orderMap.get(c.id);
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>
                    <TagBadge className="text-xs normal-case tracking-normal">
                      {CATEGORY_LABELS[c.category] ?? c.category}
                    </TagBadge>
                  </TableCell>
                  <TableCell>
                    {!order ? (
                      <StatusBadge tone="warning">Sin pedido</StatusBadge>
                    ) : order.status === "delivered" ? (
                      <DeliveryStatusBadge status="delivered" />
                    ) : order.status === "failed" ? (
                      <DeliveryStatusBadge status="failed" />
                    ) : (
                      <StatusBadge tone="info">Confirmado</StatusBadge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {order ? fmt(order.total) : "—"}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setOrderFor({ id: c.id, name: c.name, category: c.category })}
                    >
                      <Icon icon={order ? Edit01Icon : Add01Icon} className="h-4 w-4 mr-1" />
                      {order?.status === "delivered" ? "Agregar" : order ? "Editar" : "Pedido"}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <TablePagination {...pagination.controls} />
      </DataTableCard>

      <OrderDialog
        open={!!orderFor}
        onOpenChange={(v) => !v && setOrderFor(null)}
        customer={orderFor}
        deliveryDate={deliveryDate}
        branchId={branchId}
        routeDriverId={routeInfoQ.data?.route?.driver_id ?? null}
        existingOrder={orderFor ? orderMap.get(orderFor.id) : undefined}
      />

      <PreorderReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        orders={ordersQ.data ?? []}
        branchName={routeInfoQ.data?.route?.name ?? "Sucursal"}
        deliveryDate={deliveryDate}
      />
    </div>
  );
}

function OrderDialog({
  open, onOpenChange, customer, deliveryDate, branchId, routeDriverId, existingOrder,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customer: { id: string; name: string; category: string } | null;
  deliveryDate: string;
  branchId: string;
  routeDriverId: string | null;
  existingOrder?: { id: string; status: string; items: { product_id: string; quantity: number }[]; notes: string | null };
}) {
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const getDetail = useServerFn(getOrderDetail);
  const getProducts = useServerFn(getCustomerPricedProductsForOrder);
  const listDrivers = useServerFn(listBranchDrivers);
  const save = useServerFn(upsertOrder);
  const cancel = useServerFn(cancelOrder);
  const viewUrls = useServerFn(getPhotoViewUrls);

  const [qty, setQty] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [driverId, setDriverId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);
  const [initialPhotoPath, setInitialPhotoPath] = useState<string | null>(null);

  const driversQ = useQuery({
    queryKey: ["branch-drivers", branchId],
    queryFn: () => listDrivers({ data: { branch_id: branchId } }),
    enabled: open && !!branchId,
  });

  const productsQ = useQuery({
    queryKey: ["orderProducts", customer?.id],
    queryFn: () => getProducts({ data: { customer_id: customer!.id } }),
    enabled: open && !!customer,
  });

  const detailQ = useQuery({
    queryKey: ["orderDetail", customer?.id, deliveryDate],
    queryFn: () => getDetail({ data: { customer_id: customer!.id, delivery_date: deliveryDate } }),
    enabled: open && !!customer,
  });

  const isDelivered = (detailQ.data?.order?.status ?? existingOrder?.status) === "delivered";

  useEffect(() => {
    if (!open) return;
    const path = detailQ.data?.photo_url ?? null;
    setPhotoPath(path);
    setInitialPhotoPath(path);
  }, [open, detailQ.data?.photo_url]);

  useEffect(() => {
    if (!photoPath) {
      setExistingPhotoUrl(null);
      return;
    }
    viewUrls({ data: { bucket: "delivery-photos", paths: [photoPath] } })
      .then((m) => setExistingPhotoUrl(m[photoPath] ?? null))
      .catch(() => setExistingPhotoUrl(null));
  }, [photoPath, viewUrls]);

  useEffect(() => {
    if (!open) {
      setProductSearch("");
      return;
    }
    if (!productsQ.data) return;
    const items = detailQ.data?.items ?? existingOrder?.items ?? [];
    const q: Record<string, string> = {};
    for (const p of productsQ.data) {
      const line = items.find((i) => i.product_id === p.id);
      q[p.id] = line ? String(line.quantity) : "";
    }
    setQty(q);
    setNotes(detailQ.data?.order?.notes ?? existingOrder?.notes ?? "");
  }, [open, productsQ.data, detailQ.data, existingOrder]);

  useEffect(() => {
    if (!open || driversQ.isLoading) return;
    const drivers = driversQ.data ?? [];
    const savedDriver = detailQ.data?.driver_id;
    if (savedDriver) {
      setDriverId(savedDriver);
    } else if (routeDriverId && drivers.some((d) => d.id === routeDriverId)) {
      setDriverId(routeDriverId);
    } else if (drivers.length === 1) {
      setDriverId(drivers[0].id);
    } else {
      setDriverId("");
    }
  }, [open, driversQ.data, driversQ.isLoading, detailQ.data?.driver_id, routeDriverId]);

  const filteredProducts = useMemo(() => {
    const list = productsQ.data ?? [];
    const q = productSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => p.name.toLowerCase().includes(q));
  }, [productsQ.data, productSearch]);

  const total = useMemo(() => {
    return (productsQ.data ?? []).reduce((s, p) => {
      const n = Number(qty[p.id]);
      if (!n || n <= 0) return s;
      return s + n * p.effective_price;
    }, 0);
  }, [productsQ.data, qty]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!driverId) throw new Error("Selecciona un repartidor.");
      const items = (productsQ.data ?? [])
        .map((p) => ({ product_id: p.id, quantity: Number(qty[p.id]) || 0 }))
        .filter((i) => i.quantity > 0);
      if (items.length === 0) throw new Error("Agrega al menos un producto.");
      const photoChanged = photoPath !== initialPhotoPath;
      return save({
        data: {
          branch_id: branchId,
          customer_id: customer!.id,
          delivery_date: deliveryDate,
          driver_id: driverId,
          items,
          notes: notes || null,
          ...(photoChanged ? { photo_path: photoPath } : {}),
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["preorderOrders"] });
      qc.invalidateQueries({ queryKey: ["orderDetail", customer?.id, deliveryDate] });
      toast.success(isDelivered ? "Pedido actualizado" : "Pedido guardado");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const cancelMut = useMutation({
    mutationFn: () => cancel({ data: { order_id: existingOrder!.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["preorderOrders"] });
      toast.success("Pedido cancelado");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const title = isDelivered
    ? `Agregar al pedido — ${customer?.name ?? ""}`
    : `${existingOrder ? "Editar pedido" : "Nuevo pedido"} — ${customer?.name ?? ""}`;

  const formBody = (
    <div className="flex flex-col flex-1 min-h-0 gap-4 px-4 sm:px-6 pb-2">
      {isDelivered && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 shrink-0">
          Este pedido ya fue entregado. Puedes agregar productos y actualizar la foto de la nota.
        </p>
      )}
      <p className="text-sm text-muted-foreground shrink-0">
        Entrega: {deliveryDate} · {CATEGORY_LABELS[customer?.category ?? ""] ?? customer?.category}
      </p>

      <div className="space-y-1.5 shrink-0">
        <Label>Repartidor</Label>
        <Select value={driverId || undefined} onValueChange={setDriverId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecciona repartidor" />
          </SelectTrigger>
          <SelectContent>
            {(driversQ.data ?? []).map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.full_name ?? d.id.slice(0, 8)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(driversQ.data?.length ?? 0) === 0 && !driversQ.isLoading && (
          <p className="text-xs text-amber-700">No hay repartidores activos en esta sucursal.</p>
        )}
      </div>

      <div className="relative shrink-0">
        <Icon icon={Search01Icon} className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={productSearch}
          onChange={(e) => setProductSearch(e.target.value)}
          placeholder="Buscar productos…"
          className="pl-9"
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 border rounded-md">
        {productsQ.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Cargando productos…</p>
        ) : filteredProducts.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {productSearch.trim() ? "Sin coincidencias." : "No hay productos activos."}
          </p>
        ) : (
          <div className="divide-y">
            {filteredProducts.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{fmt(p.effective_price)} / {p.unit}</p>
                </div>
                <Input
                  type="number"
                  min={0}
                  className="w-20 shrink-0 text-right"
                  value={qty[p.id] ?? ""}
                  onChange={(e) => setQty((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  placeholder="0"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5 shrink-0">
        <Label>Notas</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
      </div>

      {isDelivered && (
        <div className="space-y-2 shrink-0">
          <p className="text-sm font-medium flex items-center gap-1">
            <Icon icon={Camera01Icon} className="h-4 w-4" />
            Foto de la nota entregada
          </p>
          <PhotoCapture
            bucket="delivery-photos"
            value={photoPath}
            previewUrl={existingPhotoUrl}
            onChange={setPhotoPath}
          />
        </div>
      )}

      <div className="flex justify-between items-center pt-2 border-t shrink-0">
        <span className="font-medium">Total</span>
        <span className="text-lg font-semibold tabular-nums">{fmt(total)}</span>
      </div>
    </div>
  );

  const formFooter = (
    <div className="flex flex-wrap gap-2 justify-end w-full">
      {existingOrder && existingOrder.status !== "delivered" && (
        <Button
          variant="outline"
          className="text-rose-600 mr-auto"
          onClick={() => cancelMut.mutate()}
          disabled={cancelMut.isPending}
        >
          <Icon icon={Cancel01Icon} className="h-4 w-4 mr-1" />
          Cancelar pedido
        </Button>
      )}
      <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
      <Button
        onClick={() => saveMut.mutate()}
        disabled={saveMut.isPending || total <= 0 || !driverId}
      >
        {saveMut.isPending ? "Guardando…" : isDelivered ? "Guardar cambios" : "Guardar pedido"}
      </Button>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[96dvh] flex flex-col">
          <DrawerHeader className="text-left shrink-0">
            <DrawerTitle>{title}</DrawerTitle>
          </DrawerHeader>
          {formBody}
          <DrawerFooter className="shrink-0 border-t pt-4">{formFooter}</DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl sm:max-w-3xl h-[min(90vh,820px)] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {formBody}
        <DialogFooter className="px-6 py-4 border-t shrink-0">{formFooter}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
