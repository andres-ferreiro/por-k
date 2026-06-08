import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  listRoutes, createRoute, updateRoute, deleteRoute, listBranchDrivers,
} from "@/lib/api/routes.functions";
import { getMyContext } from "@/lib/api/context.functions";
import { listBranches } from "@/lib/api/branches.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, ChevronRight } from "lucide-react";
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
  const { data: routes, isLoading } = useQuery({ queryKey: ["routes"], queryFn: () => list() });
  const { data: branches } = useQuery({
    queryKey: ["branches"],
    queryFn: () => listB(),
    enabled: ctx?.primaryRole === "owner",
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RouteRow | null>(null);
  const [deleting, setDeleting] = useState<RouteRow | null>(null);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rutas</h1>
          <p className="text-muted-foreground">Define rutas asignando clientes y un repartidor.</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nueva ruta
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Repartidor</TableHead>
              <TableHead>Clientes</TableHead>
              {isOwner && <TableHead>Sucursal</TableHead>}
              <TableHead>Estado</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={isOwner ? 6 : 5} className="text-center text-muted-foreground py-8">Cargando…</TableCell></TableRow>
            )}
            {!isLoading && (routes?.length ?? 0) === 0 && (
              <TableRow><TableCell colSpan={isOwner ? 6 : 5} className="text-center text-muted-foreground py-8">Aún no hay rutas.</TableCell></TableRow>
            )}
            {(routes ?? []).map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  <Link to="/app/routes/$routeId" params={{ routeId: r.id }} className="hover:underline">
                    {r.name}
                  </Link>
                </TableCell>
                <TableCell>{r.driver_name ?? <span className="text-muted-foreground">Sin asignar</span>}</TableCell>
                <TableCell>{r.customer_count}</TableCell>
                {isOwner && <TableCell>{r.branch_name ?? "—"}</TableCell>}
                <TableCell>{r.is_active ? <Badge>Activa</Badge> : <Badge variant="secondary">Inactiva</Badge>}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => { setEditing(r as RouteRow); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleting(r as RouteRow)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" asChild>
                      <Link to="/app/routes/$routeId" params={{ routeId: r.id }}>
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

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
