import { Add01Icon, Delete02Icon, Download01Icon, Edit01Icon, MapPinIcon, Upload01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  listCustomers, createCustomer, updateCustomer, deleteCustomer, bulkCreateCustomers,
  getCustomerPhotoUploadUrl, getCustomerPhotoViewUrls,
} from "@/lib/api/customers.functions";
import { parseCSV } from "@/lib/csv";
import { getMyContext } from "@/lib/api/context.functions";
import { listBranches, isBranchPreorderEnabled } from "@/lib/api/branches.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { toast } from "sonner";
import { StatusBadge, TagBadge } from "@/components/admin/status-badge";
import { LocationPicker } from "@/components/location-picker";
import { useBranchScope } from "@/lib/branch-scope";
import { useSorting } from "@/hooks/use-sorting";
import { filterByBranch, filterBySearch, filterByActive } from "@/lib/table-utils";
import {
  PageHeader, TableToolbar, DataTableCard, SortableTableHead, TableStatusRow,
  FilterSelect, StatusFilterSelect,
} from "@/components/admin/data-table";

export const Route = createFileRoute("/_authenticated/app/customers")({
  loader: async ({ context }) => {
    const ctx = await context.queryClient.fetchQuery({
      queryKey: ["myContext"],
      queryFn: () => getMyContext(),
    });
    const allowed = ctx.roles.some((r) => r === "owner" || r === "supervisor");
    if (!allowed) throw redirect({ to: "/app" });
    return ctx;
  },
  component: CustomersPage,
});

interface Customer {
  id: string;
  branch_id: string;
  branch_name: string | null;
  name: string;
  phone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  photo_url: string | null;
  notes: string | null;
  is_active: boolean;
  pending_balance: number;
  category?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  retail: "Retail",
  hotel: "Hotel",
  restaurant: "Restaurante",
};

function extractPath(photoUrl: string | null): string | null {
  if (!photoUrl) return null;
  // photo_url stores the storage path directly (e.g. "<branch_id>/<uuid>.jpg")
  return photoUrl;
}

function CustomersPage() {
  const list = useServerFn(listCustomers);
  const ctxFn = useServerFn(getMyContext);
  const listB = useServerFn(listBranches);

  const { data: ctx } = useQuery({ queryKey: ["myContext"], queryFn: () => ctxFn() });
  const { data: customers, isLoading } = useQuery({ queryKey: ["customers"], queryFn: () => list() });
  const { data: branches } = useQuery({
    queryKey: ["branches"],
    queryFn: () => listB(),
    enabled: ctx?.primaryRole === "owner",
  });

  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const { branchId } = useBranchScope();
  const { sortKey, sortDir, toggle, sort } = useSorting("name");

  const qc = useQueryClient();
  const del = useServerFn(deleteCustomer);
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Cliente eliminado");
      setDeleting(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const isOwner = ctx?.primaryRole === "owner";

  const rows = useMemo(() => {
    let scoped = filterByBranch(customers ?? [], branchId);
    scoped = filterBySearch(scoped, search, (c) =>
      [c.name, c.phone, c.address, c.branch_name].filter(Boolean).join(" "),
    );
    scoped = filterByActive(scoped, statusFilter as "all" | "active" | "inactive");
    if (locationFilter === "with") scoped = scoped.filter((c) => c.lat != null && c.lng != null);
    if (locationFilter === "without") scoped = scoped.filter((c) => c.lat == null || c.lng == null);
    return sort(scoped, (c, key) => {
      if (key === "location") return c.lat != null && c.lng != null ? 1 : 0;
      return (c as Record<string, unknown>)[key];
    });
  }, [customers, branchId, search, locationFilter, statusFilter, sort]);

  const colSpan = isOwner ? 7 : 6;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Clientes"
        description="Gestiona los clientes de tu sucursal."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Icon icon={Upload01Icon} className="h-4 w-4 mr-1" /> Importar CSV
            </Button>
            <Button onClick={() => { setEditing(null); setOpen(true); }}>
              <Icon icon={Add01Icon} className="h-4 w-4 mr-1" /> Nuevo cliente
            </Button>
          </div>
        }
      />

      <TableToolbar
        search
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar clientes…"
        filters={
          <>
            <StatusFilterSelect value={statusFilter} onValueChange={setStatusFilter} />
            <FilterSelect value={locationFilter} onValueChange={setLocationFilter} placeholder="Ubicación">
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="with">Con mapa</SelectItem>
              <SelectItem value="without">Sin mapa</SelectItem>
            </FilterSelect>
          </>
        }
      />

      <DataTableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead label="Nombre" sortKey="name" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <SortableTableHead label="Categoría" sortKey="category" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <SortableTableHead label="Teléfono" sortKey="phone" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <SortableTableHead label="Dirección" sortKey="address" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <SortableTableHead label="Ubicación" sortKey="location" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              <SortableTableHead label="Saldo pend." sortKey="pending_balance" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              {isOwner && (
                <SortableTableHead label="Sucursal" sortKey="branch_name" activeKey={sortKey} direction={sortDir} onSort={toggle} />
              )}
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableStatusRow colSpan={colSpan} loading={isLoading} />
            {!isLoading && rows.length === 0 && (
              <TableStatusRow colSpan={colSpan} empty emptyMessage="Aún no hay clientes." />
            )}
            {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>
                    {(c as Customer).category && (c as Customer).category !== "retail"
                      ? <TagBadge className="text-xs normal-case tracking-normal">{CATEGORY_LABELS[(c as Customer).category!] ?? (c as Customer).category}</TagBadge>
                      : <span className="text-muted-foreground text-sm">Retail</span>}
                  </TableCell>
                  <TableCell>{c.phone ?? "—"}</TableCell>
                  <TableCell className="max-w-[260px] truncate">{c.address ?? "—"}</TableCell>
                  <TableCell>
                    {c.lat != null && c.lng != null
                      ? <span className="inline-flex items-center gap-1 text-sm"><Icon icon={MapPinIcon} className="h-3.5 w-3.5" /> Sí</span>
                      : <span className="text-muted-foreground text-sm">—</span>}
                  </TableCell>
                  <TableCell>
                    {Number(c.pending_balance ?? 0) > 0
                      ? <StatusBadge tone="danger" className="tabular-nums normal-case tracking-normal">{Number(c.pending_balance).toLocaleString("es-MX", { style: "currency", currency: "MXN" })}</StatusBadge>
                      : <span className="text-muted-foreground text-sm">—</span>}
                  </TableCell>
                  {isOwner && <TableCell>{c.branch_name ?? "—"}</TableCell>}
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(c as Customer); setOpen(true); }}>
                        <Icon icon={Edit01Icon} className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleting(c as Customer)}>
                        <Icon icon={Delete02Icon} className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableCard>

      <CustomerDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        isOwner={isOwner}
        branches={branches ?? []}
        defaultBranchId={ctx?.branchId ?? null}
      />

      <CustomerImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        isOwner={isOwner}
        branches={branches ?? []}
        defaultBranchId={ctx?.branchId ?? null}
      />

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar cliente</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará a <b>{deleting?.name}</b> y su foto. Esta acción no se puede deshacer.
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

interface ImportRow {
  line: number;
  name: string;
  phone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  error: string | null;
}

function pickField(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k]?.trim();
    if (v) return v;
  }
  return "";
}

function parseOptionalNumber(value: string, min: number, max: number, label: string): number | null | string {
  if (!value.trim()) return null;
  const n = Number(value.replace(",", "."));
  if (Number.isNaN(n)) return `${label} no es un número válido`;
  if (n < min || n > max) return `${label} debe estar entre ${min} y ${max}`;
  return n;
}

function parseCustomerImportRows(text: string): ImportRow[] {
  return parseCSV(text).map((row, i) => {
    const line = i + 2;
    const name = pickField(row, "nombre", "name");
    const phone = pickField(row, "telefono", "phone", "teléfono") || null;
    const address = pickField(row, "direccion", "address", "dirección") || null;
    const notes = pickField(row, "notas", "notes") || null;

    const latRaw = pickField(row, "latitud", "lat");
    const lngRaw = pickField(row, "longitud", "lng", "lon");
    const latResult = parseOptionalNumber(latRaw, -90, 90, "Latitud");
    const lngResult = parseOptionalNumber(lngRaw, -180, 180, "Longitud");

    let error: string | null = null;
    if (!name) error = "El nombre es obligatorio";
    else if (typeof latResult === "string") error = latResult;
    else if (typeof lngResult === "string") error = lngResult;

    return {
      line,
      name,
      phone,
      address,
      lat: typeof latResult === "number" ? latResult : null,
      lng: typeof lngResult === "number" ? lngResult : null,
      notes,
      error,
    };
  });
}

function CustomerImportDialog({
  open, onOpenChange, isOwner, branches, defaultBranchId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isOwner: boolean;
  branches: { id: string; name: string }[];
  defaultBranchId: string | null;
}) {
  const qc = useQueryClient();
  const bulkCreate = useServerFn(bulkCreateCustomers);

  const [branchId, setBranchId] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBranchId(defaultBranchId ?? "");
    setRows([]);
    setFileName(null);
  }, [open, defaultBranchId]);

  const validRows = rows.filter((r) => !r.error);
  const invalidCount = rows.length - validRows.length;

  const mut = useMutation({
    mutationFn: () => bulkCreate({
      data: {
        branch_id: isOwner ? branchId || null : null,
        import_label: fileName,
        customers: validRows.map((r) => ({
          name: r.name,
          phone: r.phone,
          address: r.address,
          lat: r.lat,
          lng: r.lng,
          notes: r.notes,
        })),
      },
    }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customer-import-batches"] });
      const skipped = invalidCount;
      toast.success(
        skipped > 0
          ? `${result.count} clientes importados (${skipped} filas omitidas)`
          : `${result.count} clientes importados`,
      );
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al importar"),
  });

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Selecciona un archivo CSV.");
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseCustomerImportRows(text);
      if (!parsed.length) {
        toast.error("El archivo no contiene filas de datos.");
        return;
      }
      setRows(parsed);
      setFileName(file.name);
    } catch {
      toast.error("No se pudo leer el archivo.");
    }
  }

  const canImport = validRows.length > 0 && (!isOwner || !!branchId) && !mut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:overflow-hidden">
        <div className="shrink-0 px-6 pt-6">
          <DialogHeader>
            <DialogTitle>Importar clientes desde CSV</DialogTitle>
            <DialogDescription>
              Solo el nombre es obligatorio. Las demás columnas son opcionales.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-2">
            <p className="font-medium">Columnas del archivo</p>
            <p className="text-muted-foreground text-xs">
              <code className="text-foreground">nombre</code> (obligatorio),{" "}
              <code className="text-foreground">telefono</code>,{" "}
              <code className="text-foreground">direccion</code>,{" "}
              <code className="text-foreground">latitud</code>,{" "}
              <code className="text-foreground">longitud</code>,{" "}
              <code className="text-foreground">notas</code>
            </p>
            <a
              href="/samples/clientes-ejemplo.csv"
              download="clientes-ejemplo.csv"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Icon icon={Download01Icon} className="h-3.5 w-3.5" />
              Descargar archivo de ejemplo
            </a>
          </div>

          {isOwner && (
            <div className="space-y-1.5">
              <Label>Sucursal</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger><SelectValue placeholder="Selecciona una sucursal" /></SelectTrigger>
                <SelectContent>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Archivo CSV</Label>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <Button type="button" variant="outline" size="sm" asChild>
                <span>
                  <Icon icon={Upload01Icon} className="mr-1 h-4 w-4" />
                  {fileName ?? "Seleccionar archivo"}
                </span>
              </Button>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          {rows.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>{validRows.length} filas válidas</span>
                {invalidCount > 0 && (
                  <span className="text-destructive">{invalidCount} con errores (se omitirán)</span>
                )}
              </div>
              <div className="max-h-64 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Teléfono</TableHead>
                      <TableHead>Dirección</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.line} className={r.error ? "bg-destructive/5" : undefined}>
                        <TableCell className="text-muted-foreground text-xs">{r.line}</TableCell>
                        <TableCell className="font-medium">{r.name || "—"}</TableCell>
                        <TableCell>{r.phone ?? "—"}</TableCell>
                        <TableCell className="max-w-[180px] truncate">{r.address ?? "—"}</TableCell>
                        <TableCell className="text-xs">
                          {r.error
                            ? <span className="text-destructive">{r.error}</span>
                            : <span className="text-muted-foreground">OK</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t px-6 py-4">
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={() => mut.mutate()} disabled={!canImport}>
              {mut.isPending
                ? "Importando…"
                : validRows.length
                  ? `Importar ${validRows.length} clientes`
                  : "Importar"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CustomerDialog({
  open, onOpenChange, editing, isOwner, branches, defaultBranchId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Customer | null;
  isOwner: boolean;
  branches: { id: string; name: string }[];
  defaultBranchId: string | null;
}) {
  const qc = useQueryClient();
  const create = useServerFn(createCustomer);
  const update = useServerFn(updateCustomer);
  const getUpload = useServerFn(getCustomerPhotoUploadUrl);
  const getViews = useServerFn(getCustomerPhotoViewUrls);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [branchId, setBranchId] = useState<string>("");
  const [category, setCategory] = useState<string>("retail");
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const checkPreorder = useServerFn(isBranchPreorderEnabled);

  const effectiveBranchId = isOwner ? branchId : (editing?.branch_id ?? defaultBranchId ?? "");
  const preorderQ = useQuery({
    queryKey: ["branchPreorderEnabled", effectiveBranchId],
    queryFn: () => checkPreorder({ data: { branch_id: effectiveBranchId } }),
    enabled: open && !!effectiveBranchId,
  });
  const preorderEnabled = preorderQ.data?.preorder_enabled ?? false;

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setPhone(editing?.phone ?? "");
    setAddress(editing?.address ?? "");
    setNotes(editing?.notes ?? "");
    setLat(editing?.lat ?? null);
    setLng(editing?.lng ?? null);
    setBranchId(editing?.branch_id ?? defaultBranchId ?? "");
    setCategory((editing as Customer | null)?.category ?? "retail");
    setPhotoPath(editing?.photo_url ?? null);
    setPhotoPreview(null);
    if (editing?.photo_url) {
      getViews({ data: { paths: [editing.photo_url] } })
        .then((m) => setPhotoPreview(m[editing.photo_url!] ?? null))
        .catch(() => {});
    }
  }, [open, editing, defaultBranchId, getViews]);

  async function handleFile(file: File) {
    const targetBranch = isOwner ? branchId : null;
    if (isOwner && !targetBranch) {
      toast.error("Selecciona una sucursal antes de subir foto.");
      return;
    }
    setUploading(true);
    try {
      const { path, token } = await getUpload({
        data: { branch_id: targetBranch, filename: file.name },
      });
      const { error } = await supabase.storage
        .from("customer-photos")
        .uploadToSignedUrl(path, token, file, { contentType: file.type });
      if (error) throw error;
      setPhotoPath(path);
      setPhotoPreview(URL.createObjectURL(file));
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo subir la foto");
    } finally {
      setUploading(false);
    }
  }

  const mut = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        phone: phone || null,
        address: address || null,
        notes: notes || null,
        lat: lat ?? null,
        lng: lng ?? null,
        photo_url: photoPath ?? null,
        branch_id: isOwner ? branchId || null : null,
        category: category as "retail" | "hotel" | "restaurant",
      };
      if (editing) return update({ data: { id: editing.id, ...payload } });
      return create({ data: payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success(editing ? "Cliente actualizado" : "Cliente creado");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:overflow-hidden">
        <div className="shrink-0 px-6 pt-6">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
            <DialogDescription>
              Datos de contacto, foto de referencia y ubicación en mapa.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Teléfono</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Dirección</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>

          {isOwner && (
            <div className="space-y-1.5">
              <Label>Sucursal</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger><SelectValue placeholder="Selecciona una sucursal" /></SelectTrigger>
                <SelectContent>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Categoría</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="retail">Retail</SelectItem>
                {preorderEnabled && <SelectItem value="hotel">Hotel</SelectItem>}
                {preorderEnabled && <SelectItem value="restaurant">Restaurante</SelectItem>}
              </SelectContent>
            </Select>
            {!preorderEnabled && category !== "retail" && (
              <p className="text-xs text-amber-600">Activa la ruta de pedidos en la sucursal para usar hotel/restaurante.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Foto de referencia</Label>
            <p className="text-xs text-muted-foreground">
              Foto del local, fachada o punto de referencia para la entrega.
            </p>
            {photoPreview ? (
              <img
                src={photoPreview}
                alt="Foto de referencia"
                className="aspect-video w-full max-w-sm rounded-md border object-cover"
              />
            ) : (
              <div className="flex aspect-video w-full max-w-sm items-center justify-center rounded-md border border-dashed bg-muted/40 text-sm text-muted-foreground">
                Sin foto
              </div>
            )}
            <label className="inline-flex cursor-pointer items-center gap-2">
              <Button type="button" variant="outline" size="sm" asChild>
                <span>
                  <Icon icon={Upload01Icon} className="mr-1 h-4 w-4" />
                  {uploading ? "Subiendo…" : photoPath ? "Cambiar foto" : "Subir foto"}
                </span>
              </Button>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          <div className="space-y-1.5">
            <Label>Ubicación en mapa</Label>
            <LocationPicker
              value={{ lat, lng }}
              onChange={(v) => { setLat(v.lat); setLng(v.lng); }}
              onAddressSelect={setAddress}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <div className="shrink-0 border-t px-6 py-4">
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={() => mut.mutate()} disabled={!name || mut.isPending || uploading}>
              {mut.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
