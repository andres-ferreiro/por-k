import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listBranches, createBranch, updateBranch } from "@/lib/api/branches.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/branches")({
  component: BranchesPage,
});

interface Branch { id: string; name: string; address: string | null; phone: string | null; is_active: boolean }

function BranchesPage() {
  const list = useServerFn(listBranches);
  const { data, isLoading } = useQuery({ queryKey: ["branches"], queryFn: () => list() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sucursales</h1>
          <p className="text-muted-foreground">Gestiona las sucursales de la empresa.</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nueva sucursal
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Dirección</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Cargando…</TableCell></TableRow>}
            {!isLoading && (data?.length ?? 0) === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Aún no hay sucursales.</TableCell></TableRow>
            )}
            {(data ?? []).map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium">{b.name}</TableCell>
                <TableCell>{b.address ?? "—"}</TableCell>
                <TableCell>{b.phone ?? "—"}</TableCell>
                <TableCell>{b.is_active ? <Badge>Activa</Badge> : <Badge variant="secondary">Inactiva</Badge>}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(b as Branch); setOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

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

  // reset when editing changes
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
