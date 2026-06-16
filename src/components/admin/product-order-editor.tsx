import { GripVerticalIcon, SaveIcon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { setProductOrder } from "@/lib/api/products.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActiveStatusBadge } from "@/components/admin/status-badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Product {
  id: string;
  name: string;
  unit: string;
  price: number;
  is_active: boolean;
  display_order?: number;
}

const fmt = (n: number) => n.toLocaleString("es", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });

export function ProductOrderEditor({ products }: { products: Product[] }) {
  const qc = useQueryClient();
  const saveOrder = useServerFn(setProductOrder);

  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const productMap = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  useEffect(() => {
    const ids = [...products]
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || a.name.localeCompare(b.name, "es"))
      .map((p) => p.id);
    setOrderedIds(ids);
    setSavedIds(ids);
  }, [products]);

  const isDirty = orderedIds.length !== savedIds.length
    || orderedIds.some((id, i) => id !== savedIds[i]);

  const mut = useMutation({
    mutationFn: () => saveOrder({ data: { product_ids: orderedIds } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      setSavedIds([...orderedIds]);
      toast.success("Orden guardado para el panel del repartidor");
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al guardar"),
  });

  function handleDrop(targetIndex: number) {
    if (dragIndex == null || dragIndex === targetIndex) {
      setDragIndex(null);
      setDropIndex(null);
      return;
    }
    const next = [...orderedIds];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    setOrderedIds(next);
    setDragIndex(null);
    setDropIndex(null);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Orden en panel del repartidor</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Arrastra los productos para definir cómo aparecen al registrar entregas.
              {isDirty && <span className="text-amber-600"> · Cambios sin guardar</span>}
            </p>
          </div>
          <Button onClick={() => mut.mutate()} disabled={!isDirty || mut.isPending}>
            <Icon icon={SaveIcon} className="h-4 w-4 mr-1" />
            {mut.isPending ? "Guardando…" : "Guardar orden"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5 max-h-[60vh] overflow-y-auto">
        {orderedIds.map((id, i) => {
          const p = productMap.get(id);
          if (!p) return null;
          const isDragging = dragIndex === i;
          const isDropTarget = dropIndex === i && dragIndex !== i;
          return (
            <div
              key={id}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragEnd={() => { setDragIndex(null); setDropIndex(null); }}
              onDragOver={(e) => { e.preventDefault(); setDropIndex(i); }}
              onDrop={(e) => { e.preventDefault(); handleDrop(i); }}
              className={cn(
                "flex items-center gap-2 rounded-lg border bg-background p-2.5 transition-shadow",
                isDragging && "opacity-50",
                isDropTarget && "border-primary ring-1 ring-primary/30",
                !p.is_active && "opacity-60",
              )}
            >
              <button
                type="button"
                className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
                aria-label="Arrastrar"
              >
                <Icon icon={GripVerticalIcon} className="h-4 w-4" />
              </button>
              <div className="w-6 shrink-0 text-center text-xs font-medium text-muted-foreground">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{p.name}</div>
                <div className="text-xs text-muted-foreground">
                  {p.unit} · {fmt(Number(p.price ?? 0))}
                </div>
              </div>
              <ActiveStatusBadge active={p.is_active} />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
