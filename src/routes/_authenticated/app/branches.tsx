import { Add01Icon, Edit01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  listBranches, createBranch, updateBranch,
  getBranchPreorderConfig, setBranchPreorderEnabled,
  getBranchBodegaFlag, setBodegaFlag,
} from "@/lib/api/branches.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { toast } from "sonner";
import { useSorting } from "@/hooks/use-sorting";
import { filterBySearch, filterByActive } from "@/lib/table-utils";
import {
  PageHeader, TableToolbar, DataTableCard, SortableTableHead, TableStatusRow,
  StatusFilterSelect,
} from "@/components/admin/data-table";
import { ActiveStatusBadge, StatusBadge } from "@/components/admin/status-badge";

export const Route = createFileRoute("/_authenticated/app/branches")({
  component: BranchesPage,
  loader: async ({ context }) => {
    const ctx = await context.queryClient.fetchQuery({
      queryKey: ["myContext"],
      queryFn: () => import("@/lib/api/context.functions").then((m) => m.getMyContext()),
    });
    return { isOwner: ctx.primaryRole === "owner" };
  },
});

interface Branch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  preorder_enabled?: boolean;
  is_bodega?: boolean;
}

function BranchesPage() {
  const { isOwner } = Route.useLoaderData();
  const list = useServerFn(listBranches);
  const { data, isLoading } = useQuery({ queryKey: ["branches"], queryFn: () => list() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { sortKey, sortDir, toggle, sort } = useSorting("name");

  const rows = useMemo(() => {
    const filtered = filterBySearch(data ?? [], search, (b) =>
      [b.name, b.address, b.phone].filter(Boolean).join(" "),
    );
    const scoped = filterByActive(filtered, statusFilter as "all" | "active" | "inactive");
    return sort(scoped, (b, key) => {
      if (key === "is_active") return b.is_active;
      return (b as Record<string, unknown>)[key];
    });
  }, [data, search, statusFilter, sort]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sucursales"
        description="Gestiona las sucursales de la empresa."
        action={
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Icon icon={Add01Icon} className="h-4 w-4 mr-1" /> Nueva sucursal
          </Button>
        }
      />

      <TableToolbar
        search
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar sucursales…"
        filters={<StatusFilterSelect value={statusFilter} onValueChange={setStatusFilter} activeLabel="Activas" inactiveLabel="Inactivas" />}
      />

      <DataTableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead label="Nombre" sortKey="name" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <SortableTableHead label="Dirección" sortKey="address" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <SortableTableHead label="Teléfono" sortKey="phone" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <SortableTableHead label="Estado" sortKey="is_active" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              {isOwner && <TableHead>Pedidos</TableHead>}
              {isOwner && <TableHead>Bodega</TableHead>}
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableStatusRow colSpan={isOwner ? 7 : 5} loading={isLoading} />
            {!isLoading && rows.length === 0 && (
              <TableStatusRow colSpan={isOwner ? 7 : 5} empty emptyMessage="Aún no hay sucursales." />
            )}
            {rows.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium">{b.name}</TableCell>
                <TableCell>{b.address ?? "—"}</TableCell>
                <TableCell>{b.phone ?? "—"}</TableCell>
                <TableCell><ActiveStatusBadge active={b.is_active} activeLabel="Activa" inactiveLabel="Inactiva" /></TableCell>
                {isOwner && (
                  <TableCell>
                    {(b as Branch).preorder_enabled
                      ? <StatusBadge tone="success" className="normal-case tracking-normal">Hoteles/Rest.</StatusBadge>
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                )}
                {isOwner && (
                  <TableCell>
                    {(b as Branch).is_bodega
                      ? <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">Bodega</span>
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                )}
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(b as Branch); setOpen(true); }}>
                    <Icon icon={Edit01Icon} className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableCard>

      <BranchDialog open={open} onOpenChange={setOpen} editing={editing} isOwner={isOwner} />
    </div>
  );
}

function BranchDialog({
  open, onOpenChange, editing, isOwner,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Branch | null;
  isOwner: boolean;
}) {
  const qc = useQueryClient();
  const create = useServerFn(createBranch);
  const update = useServerFn(updateBranch);
  const getPreorder = useServerFn(getBranchPreorderConfig);
  const setPreorder = useServerFn(setBranchPreorderEnabled);
  const getBodega = useServerFn(getBranchBodegaFlag);
  const setBodega = useServerFn(setBodegaFlag);
  const [name, setName] = useState(editing?.name ?? "");
  const [address, setAddress] = useState(editing?.address ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [active, setActive] = useState(editing?.is_active ?? true);
  const [preorderEnabled, setPreorderEnabled] = useState(false);
  const [preorderRoute, setPreorderRoute] = useState<{ id: string; name: string; driver_name: string | null } | null>(null);
  const [isBodega, setIsBodega] = useState(false);

  const preorderQ = useQuery({
    queryKey: ["branchPreorder", editing?.id],
    queryFn: () => getPreorder({ data: { branch_id: editing!.id } }),
    enabled: open && !!editing && isOwner,
  });

  const bodegaQ = useQuery({
    queryKey: ["branchBodega", editing?.id],
    queryFn: () => getBodega({ data: { branch_id: editing!.id } }),
    enabled: open && !!editing && isOwner,
  });

  useState(() => {
    setName(editing?.name ?? "");
    setAddress(editing?.address ?? "");
    setPhone(editing?.phone ?? "");
    setActive(editing?.is_active ?? true);
    return 0;
  });

  useEffect(() => {
    if (preorderQ.data) {
      setPreorderEnabled(preorderQ.data.preorder_enabled);
      setPreorderRoute(preorderQ.data.preorder_route);
    }
  }, [preorderQ.data]);

  useEffect(() => {
    if (bodegaQ.data) setIsBodega(bodegaQ.data.is_bodega);
  }, [bodegaQ.data]);

  const preorderMut = useMutation({
    mutationFn: (enabled: boolean) =>
      setPreorder({ data: { branch_id: editing!.id, preorder_enabled: enabled } }),
    onSuccess: (res) => {
      setPreorderEnabled(res.preorder_enabled);
      if (res.preorder_route) setPreorderRoute(res.preorder_route);
      else if (!res.preorder_enabled) setPreorderRoute(null);
      qc.invalidateQueries({ queryKey: ["branches"] });
      qc.invalidateQueries({ queryKey: ["branchPreorder", editing?.id] });
      qc.invalidateQueries({ queryKey: ["preorderRouteInfo"] });
      toast.success(res.preorder_enabled ? "Ruta de pedidos activada" : "Ruta de pedidos desactivada");
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const bodegaMut = useMutation({
    mutationFn: (enabled: boolean) =>
      setBodega({ data: { branch_id: editing!.id, is_bodega: enabled } }),
    onSuccess: (res) => {
      setIsBodega(res.is_bodega);
      qc.invalidateQueries({ queryKey: ["branches"] });
      qc.invalidateQueries({ queryKey: ["branchBodega", editing?.id] });
      qc.invalidateQueries({ queryKey: ["bodegaContext"] });
      toast.success(res.is_bodega ? "Sucursal marcada como bodega" : "Bodega desactivada");
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const mut = useMutation({
    mutationFn: async () => {
      if (editing) {
        return update({ data: { id: editing.id, name, address: address || null, phone: phone || null, is_active: active } });
      }
      return create({ data: { name, address: address || null, phone: phone || null, is_active: active } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branches"] });
      toast.success(editing ? "Sucursal actualizada" : "Sucursal creada");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (v && !editing) { setName(""); setAddress(""); setPhone(""); setActive(true); }
      if (v && editing) { setName(editing.name); setAddress(editing.address ?? ""); setPhone(editing.phone ?? ""); setActive(editing.is_active); }
      onOpenChange(v);
    }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Editar sucursal" : "Nueva sucursal"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Dirección</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Teléfono</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label>Activa</Label>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
          {isOwner && editing && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Ruta de pedidos (hoteles/restaurantes)</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Permite registrar clientes hotel/restaurante y tomar pedidos anticipados.
                  </p>
                </div>
                <Switch
                  checked={preorderEnabled}
                  disabled={preorderMut.isPending || preorderQ.isLoading}
                  onCheckedChange={(v) => preorderMut.mutate(v)}
                />
              </div>
              {preorderEnabled && preorderRoute?.id && (
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>Ruta: <span className="font-medium text-foreground">{preorderRoute.name}</span></p>
                  {preorderRoute.driver_name ? (
                    <p>Repartidor: <span className="font-medium text-foreground">{preorderRoute.driver_name}</span></p>
                  ) : (
                    <p className="text-amber-600 text-xs">Sin repartidor asignado aún</p>
                  )}
                  <Link
                    to="/app/routes/$routeId"
                    params={{ routeId: preorderRoute.id }}
                    className="text-primary text-xs underline inline-block"
                    onClick={() => onOpenChange(false)}
                  >
                    Configurar ruta y repartidor →
                  </Link>
                </div>
              )}
              {isOwner && editing && (
                <div className="space-y-3 rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Sucursal bodega</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Recibe pedidos de insumos. Puedes tener varias bodegas con catálogos distintos.
                      </p>
                    </div>
                    <Switch
                      checked={isBodega}
                      disabled={bodegaMut.isPending || bodegaQ.isLoading}
                      onCheckedChange={(v) => bodegaMut.mutate(v)}
                    />
                  </div>
                  {isBodega && (
                    <p className="text-xs text-blue-700 bg-blue-50 rounded px-2 py-1.5">
                      Asigna productos de bodega a esta sucursal en Catálogo → Bodega (Insumos).
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
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
