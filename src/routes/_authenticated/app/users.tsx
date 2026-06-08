import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listUsers, createUser, updateUser } from "@/lib/api/users.functions";
import { listBranches } from "@/lib/api/branches.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/users")({
  component: UsersPage,
});

const ROLE_LABEL: Record<string, string> = {
  owner: "Propietario", supervisor: "Supervisor", cashier: "Cajero", driver: "Repartidor",
};

interface User {
  id: string; email: string | null; full_name: string | null; phone: string | null;
  branch_id: string | null; branch_name: string | null; is_active: boolean; roles: string[];
}

function UsersPage() {
  const list = useServerFn(listUsers);
  const listB = useServerFn(listBranches);
  const { data: users, isLoading } = useQuery({ queryKey: ["users"], queryFn: () => list() });
  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: () => listB() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
          <p className="text-muted-foreground">Crea cuentas y asigna rol y sucursal.</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nuevo usuario
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Correo</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Sucursal</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Cargando…</TableCell></TableRow>}
            {!isLoading && (users?.length ?? 0) === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Aún no hay usuarios.</TableCell></TableRow>
            )}
            {(users ?? []).map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.full_name ?? "—"}</TableCell>
                <TableCell>{u.email ?? "—"}</TableCell>
                <TableCell>{u.roles.map((r) => ROLE_LABEL[r] ?? r).join(", ") || "—"}</TableCell>
                <TableCell>{u.branch_name ?? "—"}</TableCell>
                <TableCell>{u.is_active ? <Badge>Activo</Badge> : <Badge variant="secondary">Inactivo</Badge>}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(u as User); setOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <UserDialog open={open} onOpenChange={setOpen} editing={editing} branches={branches ?? []} />
    </div>
  );
}

function UserDialog({ open, onOpenChange, editing, branches }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  editing: User | null; branches: { id: string; name: string }[];
}) {
  const qc = useQueryClient();
  const create = useServerFn(createUser);
  const update = useServerFn(updateUser);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<string>("supervisor");
  const [branchId, setBranchId] = useState<string>("");
  const [active, setActive] = useState(true);

  const mut = useMutation({
    mutationFn: async () => {
      if (editing) {
        return update({ data: {
          id: editing.id,
          full_name: fullName,
          phone: phone || null,
          branch_id: branchId || null,
          is_active: active,
          role: role as any,
        }});
      }
      return create({ data: {
        email, password, full_name: fullName, phone: phone || null,
        role: role as any, branch_id: branchId || null,
      }});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success(editing ? "Usuario actualizado" : "Usuario creado");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (v) {
        setFullName(editing?.full_name ?? "");
        setEmail(editing?.email ?? "");
        setPassword("");
        setPhone(editing?.phone ?? "");
        setRole(editing?.roles[0] ?? "supervisor");
        setBranchId(editing?.branch_id ?? "");
        setActive(editing?.is_active ?? true);
      }
      onOpenChange(v);
    }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Editar usuario" : "Nuevo usuario"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Nombre completo</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          {!editing && (
            <>
              <div className="space-y-1.5"><Label>Correo</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Contraseña</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" /></div>
            </>
          )}
          <div className="space-y-1.5"><Label>Teléfono</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Rol</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">Propietario</SelectItem>
                <SelectItem value="supervisor">Supervisor</SelectItem>
                <SelectItem value="cashier">Cajero</SelectItem>
                <SelectItem value="driver">Repartidor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Sucursal</Label>
            <Select value={branchId || "_none"} onValueChange={(v) => setBranchId(v === "_none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Sin sucursal" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Sin sucursal</SelectItem>
                {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {editing && (
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label>Activo</Label>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !fullName || (!editing && (!email || !password))}
          >{mut.isPending ? "Guardando…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
