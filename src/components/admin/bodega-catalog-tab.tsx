import { Add01Icon, ArrowDown01Icon, Edit01Icon, Upload01Icon, Download01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useEffect } from "react";
import {
  listBodegaSupplyProducts,
  createBodegaProduct,
  updateBodegaProduct,
  deleteBodegaProduct,
  bulkUpsertBodegaProducts,
} from "@/lib/api/products.functions";
import { getBodegaList } from "@/lib/api/bodega.functions";
import { filterBySearch } from "@/lib/table-utils";
import { PageHeader, TableToolbar } from "@/components/admin/data-table";
import { ActiveStatusBadge, TagBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";

interface BodegaProduct {
  id: string;
  name: string;
  unit: string;
  bodega_category: string | null;
  is_active: boolean;
  bodega_id?: string | null;
}

const CSV_TEMPLATE = `nombre,unidad,categoria
Azúcar glass,bulto 25 kg,Panadería
Levadura,caja 20 piezas,Panadería
Chile limón,kg,Totopos
Integral,pieza,Tortilla harina
Manteca puerco,galón 4L,Chicharronería
Frijoles refritos,medio o litro,Refrigeradores
Coca 600,pieza,Bebidas
Cal,kg,Maíz
Jabón polvo,bulto 10 kg,Limpieza`;

function parseCsv(text: string): { rows: { name: string; unit: string; categoria: string }[]; errors: string[] } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  const errors: string[] = [];
  if (lines.length < 2) return { rows: [], errors: ["El archivo debe tener encabezado y al menos una fila."] };

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const nameIdx = header.indexOf("nombre");
  const unitIdx = header.indexOf("unidad");
  const catIdx = header.indexOf("categoria");
  if (nameIdx < 0 || unitIdx < 0 || catIdx < 0) {
    return { rows: [], errors: ["Encabezados requeridos: nombre, unidad, categoria"] };
  }

  const rows: { name: string; unit: string; categoria: string }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const name = cols[nameIdx] ?? "";
    const unit = cols[unitIdx] ?? "";
    const categoria = cols[catIdx] ?? "";
    if (!name || !unit || !categoria) {
      errors.push(`Fila ${i + 1}: faltan datos obligatorios.`);
      continue;
    }
    rows.push({ name, unit, categoria });
  }
  return { rows, errors };
}

export function BodegaCatalogTab({
  bodegaId: fixedBodegaId,
  bodegaName: fixedBodegaName,
  showHeader = true,
}: {
  bodegaId?: string;
  bodegaName?: string;
  showHeader?: boolean;
}) {
  const listBodegas = useServerFn(getBodegaList);
  const list = useServerFn(listBodegaSupplyProducts);
  const bodegasQ = useQuery({
    queryKey: ["bodegaList"],
    queryFn: () => listBodegas(),
  });
  const [selectedBodegaId, setSelectedBodegaId] = useState<string | null>(fixedBodegaId ?? null);

  useEffect(() => {
    if (fixedBodegaId) setSelectedBodegaId(fixedBodegaId);
    else if (!selectedBodegaId && bodegasQ.data?.[0]) {
      setSelectedBodegaId(bodegasQ.data[0].id);
    }
  }, [fixedBodegaId, bodegasQ.data, selectedBodegaId]);

  const activeBodegaId = fixedBodegaId ?? selectedBodegaId;
  const activeBodegaName =
    fixedBodegaName
    ?? bodegasQ.data?.find((b) => b.id === activeBodegaId)?.label
    ?? "Bodega";

  const { data, isLoading } = useQuery({
    queryKey: ["bodegaProducts", activeBodegaId],
    queryFn: () => list({ data: { bodega_id: activeBodegaId } }),
    enabled: !!activeBodegaId,
  });
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [editing, setEditing] = useState<BodegaProduct | null>(null);
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    return filterBySearch(data ?? [], search, (p: BodegaProduct) =>
      [p.name, p.unit, p.bodega_category].filter(Boolean).join(" "),
    );
  }, [data, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, BodegaProduct[]>();
    for (const p of filtered) {
      const cat = p.bodega_category ?? "Sin categoría";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "es"));
  }, [filtered]);

  useEffect(() => {
    if (grouped.length > 0 && openCategories.size === 0) {
      setOpenCategories(new Set(grouped.map(([cat]) => cat)));
    }
  }, [grouped, openCategories.size]);

  function toggleCategory(cat: string) {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla-bodega.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {showHeader && (
        <PageHeader
          title={`Insumos — ${activeBodegaName}`}
          description="Productos que las sucursales pueden pedir a esta bodega."
          action={
            <div className="flex flex-wrap gap-2">
              {!fixedBodegaId && (bodegasQ.data?.length ?? 0) > 1 && (
                <select
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={activeBodegaId ?? ""}
                  onChange={(e) => setSelectedBodegaId(e.target.value)}
                >
                  {(bodegasQ.data ?? []).map((b) => (
                    <option key={b.id} value={b.id}>{b.label}</option>
                  ))}
                </select>
              )}
              <Button variant="outline" onClick={downloadTemplate}>
                <Icon icon={Download01Icon} className="h-4 w-4 mr-1" /> Plantilla CSV
              </Button>
              <Button variant="outline" onClick={() => setCsvOpen(true)} disabled={!activeBodegaId}>
                <Icon icon={Upload01Icon} className="h-4 w-4 mr-1" /> Importar CSV
              </Button>
              <Button onClick={() => { setEditing(null); setOpen(true); }} disabled={!activeBodegaId}>
                <Icon icon={Add01Icon} className="h-4 w-4 mr-1" /> Agregar producto
              </Button>
            </div>
          }
        />
      )}

      <TableToolbar
        search
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar insumos…"
      />

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {!isLoading && grouped.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Sin productos de bodega. Agrega manualmente o importa un CSV.
        </div>
      )}

      <div className="space-y-3">
        {grouped.map(([category, products]) => (
          <Collapsible
            key={category}
            open={openCategories.has(category)}
            onOpenChange={() => toggleCategory(category)}
          >
            <div className="rounded-lg border bg-card overflow-hidden">
              <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-2">
                  <Icon
                    icon={ArrowDown01Icon}
                    className={`h-4 w-4 transition-transform ${openCategories.has(category) ? "rotate-0" : "-rotate-90"}`}
                  />
                  <span className="font-medium">{category}</span>
                  <TagBadge className="text-xs normal-case tracking-normal">{products.length}</TagBadge>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead>Unidad</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="w-16" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>{p.unit}</TableCell>
                        <TableCell><ActiveStatusBadge active={p.is_active} /></TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => { setEditing(p); setOpen(true); }}
                          >
                            <Icon icon={Edit01Icon} className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CollapsibleContent>
            </div>
          </Collapsible>
        ))}
      </div>

      <BodegaProductDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        bodegaId={activeBodegaId ?? ""}
        bodegas={bodegasQ.data ?? []}
      />
      <CsvImportDialog open={csvOpen} onOpenChange={setCsvOpen} bodegaId={activeBodegaId ?? ""} />
    </div>
  );
}

function BodegaProductDialog({
  open,
  onOpenChange,
  editing,
  bodegaId,
  bodegas,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: BodegaProduct | null;
  bodegaId: string;
  bodegas: { id: string; label: string }[];
}) {
  const qc = useQueryClient();
  const create = useServerFn(createBodegaProduct);
  const update = useServerFn(updateBodegaProduct);
  const remove = useServerFn(deleteBodegaProduct);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [category, setCategory] = useState("");
  const [active, setActive] = useState(true);
  const [selectedBodegaId, setSelectedBodegaId] = useState(bodegaId);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setUnit(editing?.unit ?? "");
      setCategory(editing?.bodega_category ?? "");
      setActive(editing?.is_active ?? true);
      setSelectedBodegaId(editing?.bodega_id ?? bodegaId);
      setConfirmDelete(false);
    }
  }, [open, editing, bodegaId]);

  const mut = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        unit: unit.trim(),
        bodega_category: category.trim(),
        is_active: active,
        bodega_id: selectedBodegaId,
      };
      if (editing) return update({ data: { id: editing.id, ...payload } });
      return create({ data: payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bodegaProducts"] });
      qc.invalidateQueries({ queryKey: ["bodegaCatalogProducts"] });
      toast.success(editing ? "Producto actualizado" : "Producto creado");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const deleteMut = useMutation({
    mutationFn: () => remove({ data: { id: editing!.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bodegaProducts"] });
      qc.invalidateQueries({ queryKey: ["bodegaCatalogProducts"] });
      toast.success("Producto eliminado");
      setConfirmDelete(false);
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al eliminar"),
  });

  const canSave =
    !!name.trim()
    && !!unit.trim()
    && !!category.trim()
    && !!selectedBodegaId
    && !mut.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar insumo" : "Nuevo insumo de bodega"}</DialogTitle>
            {editing && (
              <DialogDescription>
                Cambia la bodega si el producto fue asignado al catálogo incorrecto.
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-4">
            {bodegas.length > 0 && (
              <div className="space-y-1.5">
                <Label>Bodega</Label>
                <Select value={selectedBodegaId} onValueChange={setSelectedBodegaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar bodega" />
                  </SelectTrigger>
                  <SelectContent>
                    {bodegas.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5"><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Unidad</Label><Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="bulto 25 kg, caja, kg…" /></div>
            <div className="space-y-1.5"><Label>Categoría</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Panadería, Totopos…" /></div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label>Activo</Label>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2">
            {editing ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setConfirmDelete(true)}
                disabled={deleteMut.isPending}
              >
                Eliminar
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2 sm:ml-auto">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={() => mut.mutate()} disabled={!canSave}>
                {mut.isPending ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este producto?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{editing?.name}</strong> del catálogo de bodega. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMut.isPending}
              onClick={() => deleteMut.mutate()}
            >
              {deleteMut.isPending ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CsvImportDialog({
  open,
  onOpenChange,
  bodegaId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bodegaId: string;
}) {
  const qc = useQueryClient();
  const bulk = useServerFn(bulkUpsertBodegaProducts);
  const [preview, setPreview] = useState<{ name: string; unit: string; categoria: string }[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const mut = useMutation({
    mutationFn: () => bulk({ data: { bodega_id: bodegaId, rows: preview } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["bodegaProducts"] });
      qc.invalidateQueries({ queryKey: ["bodegaCatalogProducts"] });
      toast.success(`Importados: ${res.created} nuevos, ${res.updated} actualizados`);
      onOpenChange(false);
      setPreview([]);
      setErrors([]);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al importar"),
  });

  function handleFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const { rows, errors: parseErrors } = parseCsv(String(reader.result ?? ""));
      setPreview(rows);
      setErrors(parseErrors);
    };
    reader.readAsText(file, "UTF-8");
  }

  const previewGrouped = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of preview) {
      map.set(r.categoria, (map.get(r.categoria) ?? 0) + 1);
    }
    return [...map.entries()];
  }, [preview]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setPreview([]); setErrors([]); } onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar productos de bodega</DialogTitle>
          <DialogDescription>
            CSV con columnas: nombre, unidad, categoria
          </DialogDescription>
        </DialogHeader>
        <Input type="file" accept=".csv,text/csv" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
        {errors.length > 0 && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive space-y-1">
            {errors.map((e) => <p key={e}>{e}</p>)}
          </div>
        )}
        {preview.length > 0 && (
          <div className="rounded-md border p-3 text-sm space-y-2 max-h-48 overflow-y-auto">
            <p className="font-medium">{preview.length} productos listos para importar</p>
            {previewGrouped.map(([cat, count]) => (
              <div key={cat} className="flex justify-between text-muted-foreground">
                <span>{cat}</span>
                <span>{count}</span>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={preview.length === 0 || mut.isPending}
          >
            {mut.isPending ? "Importando…" : `Importar ${preview.length} productos`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
