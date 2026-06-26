import { Add01Icon, ArrowRight01Icon, Delete02Icon, Edit01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  listRoutes, createRoute, updateRoute, deleteRoute, listBranchDrivers,
} from "@/lib/api/routes.functions";
import { getMyContext } from "@/lib/api/context.functions";
import { listBranches } from "@/lib/api/branches.functions";
import { useBranchScope } from "@/lib/branch-scope";
import { useSorting } from "@/hooks/use-sorting";
import { filterByBranch, filterBySearch, filterByActive } from "@/lib/table-utils";
import {
  PageHeader, TableToolbar, DataTableCard, SortableTableHead, TableStatusRow,
  StatusFilterSelect,
} from "@/components/admin/data-table";
import { ActiveStatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/routes/")({
  component: RoutesPage,
});

interface RouteRow {
  id: string;
  branch_id: string;
  branch_name: string | null;
  name: string;
  driver_id: string | null;
  driver_name: string | null;
  is_active: boolean;
  customer_count: number;
}

function RoutesPage() {
  const list = useServerFn(listRoutes);
  const ctxFn = useServerFn(getMyContext);
  const listB = useServerFn(listBranches);

  const { data: ctx } = useQuery({ queryKey: ["myContext"], queryFn: () => ctxFn() });
  const { data: routes, isLoading, isError, error } = useQuery({ queryKey: ["routes"], queryFn: () => list() });
  const { data: branches } = useQuery({
    queryKey: ["branches"],
    queryFn: () => listB(),
    enabled: ctx?.primaryRole === "owner",
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RouteRow | null>(null);
  const [deleting, setDeleting] = useState<RouteRow | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { branchId } = useBranchScope();
  const { sortKey, sortDir, toggle, sort } = useSorting("name");
  const isOwner = ctx?.primaryRole === "owner";

  const qc = useQueryClient();
  const del = useServerFn(deleteRoute);
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routes"] });
      toast.success("Ruta eliminada");
      setDeleting(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const rows = useMemo(() => {
    let scoped = filterByBranch(routes ?? [], branchId);
    scoped = filterBySearch(scoped, search, (r) =>
      [r.name, r.driver_name, r.branch_name].filter(Boolean).join(" "),
    );
    scoped = filterByActive(scoped, statusFilter as "all" | "active" | "inactive");
    return sort(scoped, (r, key) => {
      if (key === "customer_count") return r.customer_count;
      if (key === "is_active") return r.is_active;
      return (r as Record<string, unknown>)[key];
    });
  }, [routes, branchId, search, statusFilter, sort]);

  const colSpan = isOwner ? 6 : 5;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Rutas"
        description="Define rutas asignando clientes y un repartidor."
        action={
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Icon icon={Add01Icon} className="h-4 w-4 mr-1" /> Nueva ruta
          </Button>
        }
      />

      <TableToolbar
        search
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar rutas…"
        filters={<StatusFilterSelect value={statusFilter} onValueChange={setStatusFilter} activeLabel="Activas" inactiveLabel="Inactivas" />}
      />

      <DataTableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead label="Nombre" sortKey="name" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <SortableTableHead label="Repartidor" sortKey="driver_name" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <SortableTableHead label="Clientes" sortKey="customer_count" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              {isOwner && (
                <SortableTableHead label="Sucursal" sortKey="branch_name" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              )}
              <SortableTableHead label="Estado" sortKey="is_active" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableStatusRow colSpan={colSpan} loading={isLoading} />
            {!isLoading && isError && (
              <TableStatusRow
                colSpan={colSpan}
                empty
                emptyMessage={(error as Error)?.message ?? "No se pudieron cargar las rutas."}
              />
            )}
            {!isLoading && !isError && rows.length === 0 && (
              <TableStatusRow colSpan={colSpan} empty emptyMessage="Aún no hay rutas." />
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  <Link to="/app/routes/$routeId" params={{ routeId: r.id }} className="hover:underline">
                    {r.name}
                  </Link>
                </TableCell>
                <TableCell>{r.driver_name ?? <span className="text-muted-foreground">Sin asignar</span>}</TableCell>
                <TableCell>{r.customer_count}</TableCell>
                {isOwner && <TableCell>{r.branch_name ?? "—"}</TableCell>}
                <TableCell><ActiveStatusBadge active={r.is_active} activeLabel="Activa" inactiveLabel="Inactiva" /></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => { setEditing(r as RouteRow); setOpen(true); }}>
                      <Icon icon={Edit01Icon} className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleting(r as RouteRow)}>
                      <Icon icon={Delete02Icon} className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" asChild>
                      <Link to="/app/routes/$routeId" params={{ routeId: r.id }}>
                        <Icon icon={ArrowRight01Icon} className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableCard>

      <RouteDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        isOwner={isOwner}
        branches={branches ?? []}
        defaultBranchId={ctx?.branchId ?? null}
      />

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar ruta</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la ruta <b>{deleting?.name}</b> y la asignación de sus clientes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && delMut.mutate(deleting.id)}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RouteDialog({
  open, onOpenChange, editing, isOwner, branches, defaultBranchId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: RouteRow | null;
  isOwner: boolean;
  branches: { id: string; name: string }[];
  defaultBranchId: string | null;
}) {
  const qc = useQueryClient();
  const create = useServerFn(createRoute);
  const update = useServerFn(updateRoute);
  const drivers = useServerFn(listBranchDrivers);

  const [name, setName] = useState("");
  const [branchId, setBranchId] = useState<string>("");
  const [driverId, setDriverId] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setBranchId(editing?.branch_id ?? defaultBranchId ?? "");
    setDriverId(editing?.driver_id ?? "");
  }, [open, editing, defaultBranchId]);

  const effectiveBranch = isOwner ? branchId : defaultBranchId;
  const { data: driverList } = useQuery({
    queryKey: ["branch-drivers", effectiveBranch],
    queryFn: () => drivers({ data: { branch_id: effectiveBranch } }),
    enabled: !!effectiveBranch,
  });

  const mut = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        driver_id: driverId || null,
        branch_id: isOwner ? branchId || null : null,
      };
      if (editing) return update({ data: { id: editing.id, ...payload } });
      return create({ data: payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routes"] });
      toast.success(editing ? "Ruta actualizada" : "Ruta creada");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Editar ruta" : "Nueva ruta"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          {isOwner && (
            <div className="space-y-1.5">
              <Label>Sucursal</Label>
              <Select value={branchId} onValueChange={(v) => { setBranchId(v); setDriverId(""); }}>
                <SelectTrigger><SelectValue placeholder="Selecciona una sucursal" /></SelectTrigger>
                <SelectContent>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Repartidor</Label>
            <Select value={driverId || "_none"} onValueChange={(v) => setDriverId(v === "_none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Sin asignar</SelectItem>
                {(driverList ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.full_name ?? d.id.slice(0, 8)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {effectiveBranch && (driverList?.length ?? 0) === 0 && (
              <p className="text-xs text-muted-foreground">No hay repartidores activos en esta sucursal.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={!name || mut.isPending || (isOwner && !branchId)}>
            {mut.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
