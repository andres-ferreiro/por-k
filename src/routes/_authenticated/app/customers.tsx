import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  listCustomers, createCustomer, updateCustomer, deleteCustomer,
  getCustomerPhotoUploadUrl, getCustomerPhotoViewUrls,
} from "@/lib/api/customers.functions";
import { getMyContext } from "@/lib/api/context.functions";
import { listBranches } from "@/lib/api/branches.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, MapPin, Upload } from "lucide-react";
import { toast } from "sonner";
import { LocationPicker } from "@/components/location-picker";

export const Route = createFileRoute("/_authenticated/app/customers")({
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
}

function extractPath(photoUrl: string | null): string | null {
  if (!photoUrl) return null;
  // photo_url stores the storage path directly (e.g. "<branch_id>/<uuid>.jpg")
  return photoUrl;
}

function CustomersPage() {
  const list = useServerFn(listCustomers);
  const ctxFn = useServerFn(getMyContext);
  const listB = useServerFn(listBranches);
  const getViews = useServerFn(getCustomerPhotoViewUrls);

  const { data: ctx } = useQuery({ queryKey: ["myContext"], queryFn: () => ctxFn() });
  const { data: customers, isLoading } = useQuery({ queryKey: ["customers"], queryFn: () => list() });
  const { data: branches } = useQuery({
    queryKey: ["branches"],
    queryFn: () => listB(),
    enabled: ctx?.primaryRole === "owner",
  });

  const photoPaths = useMemo(
    () => (customers ?? []).map((c) => extractPath(c.photo_url)).filter((p): p is string => !!p),
    [customers],
  );
  const { data: photoUrls } = useQuery({
    queryKey: ["customer-photo-urls", photoPaths],
    queryFn: () => getViews({ data: { paths: photoPaths } }),
    enabled: photoPaths.length > 0,
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">Gestiona los clientes de tu sucursal.</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nuevo cliente
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16" />
              <TableHead>Nombre</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Dirección</TableHead>
              <TableHead>Ubicación</TableHead>
              {isOwner && <TableHead>Sucursal</TableHead>}
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={isOwner ? 7 : 6} className="text-center text-muted-foreground py-8">Cargando…</TableCell></TableRow>
            )}
            {!isLoading && (customers?.length ?? 0) === 0 && (
              <TableRow><TableCell colSpan={isOwner ? 7 : 6} className="text-center text-muted-foreground py-8">Aún no hay clientes.</TableCell></TableRow>
            )}
            {(customers ?? []).map((c) => {
              const path = extractPath(c.photo_url);
              const img = path && photoUrls ? photoUrls[path] : undefined;
              return (
                <TableRow key={c.id}>
                  <TableCell>
                    <Avatar className="h-9 w-9">
                      {img && <AvatarImage src={img} alt={c.name} />}
                      <AvatarFallback>{c.name.slice(0, 1).toUpperCase()}</AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.phone ?? "—"}</TableCell>
                  <TableCell className="max-w-[260px] truncate">{c.address ?? "—"}</TableCell>
                  <TableCell>
                    {c.lat != null && c.lng != null
                      ? <span className="inline-flex items-center gap-1 text-sm"><MapPin className="h-3.5 w-3.5" /> Sí</span>
                      : <span className="text-muted-foreground text-sm">—</span>}
                  </TableCell>
                  {isOwner && <TableCell>{c.branch_name ?? "—"}</TableCell>}
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(c as Customer); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleting(c as Customer)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <CustomerDialog
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
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setPhone(editing?.phone ?? "");
    setAddress(editing?.address ?? "");
    setNotes(editing?.notes ?? "");
    setLat(editing?.lat ?? null);
    setLng(editing?.lng ?? null);
    setBranchId(editing?.branch_id ?? defaultBranchId ?? "");
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
          <DialogDescription>Datos de contacto, foto y ubicación en mapa.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
            <Label>Foto</Label>
            <div className="flex items-center gap-3">
              <Avatar className="h-16 w-16">
                {photoPreview && <AvatarImage src={photoPreview} />}
                <AvatarFallback>{name.slice(0, 1).toUpperCase() || "C"}</AvatarFallback>
              </Avatar>
              <div>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <Button type="button" variant="outline" size="sm" asChild>
                    <span>
                      <Upload className="h-4 w-4 mr-1" />
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
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Ubicación en mapa</Label>
            <LocationPicker
              value={{ lat, lng }}
              onChange={(v) => { setLat(v.lat); setLng(v.lng); }}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={!name || mut.isPending || uploading}>
            {mut.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
