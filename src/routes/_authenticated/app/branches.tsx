import { Add01Icon, Edit01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listBranches, createBranch, updateBranch } from "@/lib/api/branches.functions";
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
import { ActiveStatusBadge } from "@/components/admin/status-badge";

export const Route = createFileRoute("/_authenticated/app/branches")({
  component: BranchesPage,
});

interface Branch { id: string; name: string; address: string | null; phone: string | null; is_active: boolean }

function BranchesPage() {
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
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableStatusRow colSpan={5} loading={isLoading} />
            {!isLoading && rows.length === 0 && (
              <TableStatusRow colSpan={5} empty emptyMessage="Aún no hay sucursales." />
            )}
            {rows.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium">{b.name}</TableCell>
                <TableCell>{b.address ?? "—"}</TableCell>
                <TableCell>{b.phone ?? "—"}</TableCell>
                <TableCell><ActiveStatusBadge active={b.is_active} activeLabel="Activa" inactiveLabel="Inactiva" /></TableCell>
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

      <BranchDialog open={open} onOpenChange={setOpen} editing={editing} />
    </div>
  );
}

function BranchDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (v: boolean) => void; editing: Branch | null }) {
  const qc = useQueryClient();
  const create = useServerFn(createBranch);
  const update = useServerFn(updateBranch);
  const [name, setName] = useState(editing?.name ?? "");
  const [address, setAddress] = useState(editing?.address ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [active, setActive] = useState(editing?.is_active ?? true);

  useState(() => {
    setName(editing?.name ?? "");
    setAddress(editing?.address ?? "");
    setPhone(editing?.phone ?? "");
    setActive(editing?.is_active ?? true);
    return 0;
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
