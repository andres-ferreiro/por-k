import { Add01Icon, Edit01Icon, ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listUsers, createUser, updateUser, resetUserPassword } from "@/lib/api/users.functions";
import { listBranches } from "@/lib/api/branches.functions";
import { useBranchScope } from "@/lib/branch-scope";
import { useSorting } from "@/hooks/use-sorting";
import { usePagination } from "@/hooks/use-pagination";
import { filterByBranch, filterBySearch, filterByActive } from "@/lib/table-utils";
import {
  PageHeader, TableToolbar, DataTableCard, SortableTableHead, TableStatusRow,
  FilterSelect, StatusFilterSelect, TablePagination,
} from "@/components/admin/data-table";
import { ActiveStatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { toast } from "sonner";

function PasswordInput({ value, onChange, placeholder, id }: {
  value: string; onChange: (v: string) => void; placeholder?: string; id?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
        tabIndex={-1}
      >
        {show ? <Icon icon={ViewOffIcon} className="h-4 w-4" /> : <Icon icon={ViewIcon} className="h-4 w-4" />}
      </button>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/app/users")({
  component: UsersPage,
});

const ROLE_LABEL: Record<string, string> = {
  owner: "Propietario", supervisor: "Supervisor", cashier: "Cajero", driver: "Repartidor", transfer_driver: "Abastecimiento",
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
  const { branchId } = useBranchScope();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const { sortKey, sortDir, toggle, sort } = useSorting("full_name");

  const rows = useMemo(() => {
    let scoped = filterByBranch(users ?? [], branchId);
    scoped = filterBySearch(scoped, search, (u) =>
      [u.full_name, u.email, u.phone, u.branch_name, ...u.roles.map((r) => ROLE_LABEL[r] ?? r)]
        .filter(Boolean).join(" "),
    );
    if (roleFilter !== "all") scoped = scoped.filter((u) => u.roles.includes(roleFilter));
    scoped = filterByActive(scoped, statusFilter as "all" | "active" | "inactive");
    return sort(scoped, (u, key) => {
      if (key === "role") return u.roles.map((r) => ROLE_LABEL[r] ?? r).join(", ");
      if (key === "is_active") return u.is_active;
      return (u as Record<string, unknown>)[key];
    });
  }, [users, branchId, search, roleFilter, statusFilter, sort]);

  const pagination = usePagination(rows, undefined, [search, roleFilter, statusFilter, sortKey, sortDir, branchId]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Usuarios"
        description="Crea cuentas y asigna rol y sucursal."
        action={
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Icon icon={Add01Icon} className="h-4 w-4 mr-1" /> Nuevo usuario
          </Button>
        }
      />

      <TableToolbar
        search
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar usuarios…"
        filters={
          <>
            <FilterSelect value={roleFilter} onValueChange={setRoleFilter} placeholder="Rol">
              <SelectItem value="all">Todos los roles</SelectItem>
              <SelectItem value="owner">Propietario</SelectItem>
              <SelectItem value="supervisor">Supervisor</SelectItem>
              <SelectItem value="cashier">Cajero</SelectItem>
              <SelectItem value="driver">Repartidor</SelectItem>
              <SelectItem value="transfer_driver">Abastecimiento</SelectItem>
            </FilterSelect>
            <StatusFilterSelect value={statusFilter} onValueChange={setStatusFilter} />
          </>
        }
      />

      <DataTableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead label="Nombre" sortKey="full_name" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <SortableTableHead label="Correo" sortKey="email" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <SortableTableHead label="Rol" sortKey="role" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <SortableTableHead label="Sucursal" sortKey="branch_name" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <SortableTableHead label="Estado" sortKey="is_active" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableStatusRow colSpan={6} loading={isLoading} />
            {!isLoading && rows.length === 0 && (
              <TableStatusRow colSpan={6} empty emptyMessage="Aún no hay usuarios." />
            )}
            {pagination.paginatedItems.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.full_name ?? "—"}</TableCell>
                <TableCell>{u.email ?? "—"}</TableCell>
                <TableCell>{u.roles.map((r) => ROLE_LABEL[r] ?? r).join(", ") || "—"}</TableCell>
                <TableCell>{u.branch_name ?? "—"}</TableCell>
                <TableCell><ActiveStatusBadge active={u.is_active} /></TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(u as User); setOpen(true); }}>
                    <Icon icon={Edit01Icon} className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination {...pagination.controls} />
      </DataTableCard>

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
  const resetPwd = useServerFn(resetUserPassword);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<string>("supervisor");
  const [branchId, setBranchId] = useState<string>("");
  const [active, setActive] = useState(true);
  const [newPassword, setNewPassword] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      if (editing) {
        await update({ data: {
          id: editing.id,
          full_name: fullName,
          phone: phone || null,
          branch_id: branchId || null,
          is_active: active,
          role: role as any,
        }});
        if (newPassword) {
          await resetPwd({ data: { id: editing.id, password: newPassword } });
        }
        return;
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
        setNewPassword("");
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
              <div className="space-y-1.5">
                <Label>Contraseña</Label>
                <PasswordInput value={password} onChange={setPassword} placeholder="Mínimo 6 caracteres" />
              </div>
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
              <SelectItem value="transfer_driver">Abastecimiento</SelectItem>
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
            <>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label>Activo</Label>
                <Switch checked={active} onCheckedChange={setActive} />
              </div>
              <div className="space-y-1.5">
                <Label>Nueva contraseña</Label>
                <PasswordInput
                  value={newPassword}
                  onChange={setNewPassword}
                  placeholder="Dejar vacío para no cambiar"
                />
                {newPassword && newPassword.length < 6 && (
                  <p className="text-xs text-destructive">Mínimo 6 caracteres</p>
                )}
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={
              mut.isPending ||
              !fullName ||
              (!editing && (!email || !password)) ||
              (!!newPassword && newPassword.length < 6)
            }
          >{mut.isPending ? "Guardando…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
