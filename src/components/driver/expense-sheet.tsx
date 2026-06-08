import { useEffect, useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PhotoCapture } from "@/components/driver/photo-capture";
import { useServerFn } from "@tanstack/react-start";
import { createExpense } from "@/lib/api/driver.functions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExpenseSheet({ open, onOpenChange }: Props) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const qc = useQueryClient();
  const create = useServerFn(createExpense);

  useEffect(() => {
    if (open) {
      setAmount("");
      setDescription("");
      setPhotoPath(null);
    }
  }, [open]);

  const mut = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("Monto inválido.");
      if (!description.trim()) throw new Error("Agrega una descripción.");
      return create({ data: { amount: amt, description: description.trim(), photo_path: photoPath } });
    },
    onSuccess: () => {
      toast.success("Gasto registrado.");
      qc.invalidateQueries({ queryKey: ["driver"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo registrar."),
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh]">
        <DrawerHeader>
          <DrawerTitle>Registrar gasto</DrawerTitle>
        </DrawerHeader>
        <div className="p-4 space-y-4 overflow-y-auto">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Monto</label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="h-14 text-2xl font-semibold text-center"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Descripción</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: gasolina, peaje, almuerzo"
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Foto del recibo (opcional)</label>
            <PhotoCapture bucket="expense-photos" value={photoPath} onChange={setPhotoPath} />
          </div>
        </div>
        <div className="p-4 border-t flex gap-2">
          <Button variant="outline" className="flex-1 h-12" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Cancelar
          </Button>
          <Button className="flex-1 h-12" onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
