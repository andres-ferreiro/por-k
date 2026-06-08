import { useEffect, useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PhotoCapture } from "@/components/driver/photo-capture";
import { useServerFn } from "@tanstack/react-start";
import { upsertDelivery, getPhotoViewUrls } from "@/lib/api/driver.functions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

type Status = "delivered" | "pending" | "failed";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: { id: string; name: string } | null;
  initial: { status: Status; comment: string | null; photo_url: string | null } | null;
}

const STATUSES: { value: Status; label: string; icon: any; cls: string }[] = [
  { value: "delivered", label: "Entregado", icon: CheckCircle2, cls: "bg-emerald-600 text-white border-emerald-600" },
  { value: "pending", label: "Pendiente", icon: Clock, cls: "bg-amber-500 text-white border-amber-500" },
  { value: "failed", label: "Fallido", icon: XCircle, cls: "bg-rose-600 text-white border-rose-600" },
];

export function DeliverySheet({ open, onOpenChange, customer, initial }: Props) {
  const [status, setStatus] = useState<Status>("delivered");
  const [comment, setComment] = useState("");
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const qc = useQueryClient();
  const upsert = useServerFn(upsertDelivery);
  const viewUrls = useServerFn(getPhotoViewUrls);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStatus(initial?.status ?? "delivered");
      setComment(initial?.comment ?? "");
      setPhotoPath(initial?.photo_url ?? null);
      setExistingPhotoUrl(null);
      if (initial?.photo_url) {
        viewUrls({ data: { bucket: "delivery-photos", paths: [initial.photo_url] } })
          .then((m) => setExistingPhotoUrl(m[initial.photo_url!] ?? null))
          .catch(() => {});
      }
    }
  }, [open, initial, viewUrls]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!customer) return;
      return upsert({
        data: {
          customer_id: customer.id,
          status,
          comment: comment.trim() || null,
          photo_path: photoPath,
        },
      });
    },
    onSuccess: () => {
      toast.success("Entrega guardada.");
      qc.invalidateQueries({ queryKey: ["driver"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo guardar."),
  });

  if (!customer) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh]">
        <DrawerHeader>
          <DrawerTitle>Registrar entrega</DrawerTitle>
          <DrawerDescription>{customer.name}</DrawerDescription>
        </DrawerHeader>
        <div className="p-4 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-3 gap-2">
            {STATUSES.map((s) => {
              const active = status === s.value;
              const Icon = s.icon;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStatus(s.value)}
                  className={`flex flex-col items-center justify-center gap-1 py-3 rounded-lg border-2 text-xs font-medium transition ${
                    active ? s.cls : "border-input bg-background text-foreground"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {s.label}
                </button>
              );
            })}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Comentario (opcional)</label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Ej: dejado con la vecina"
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Foto de evidencia (opcional)</label>
            {existingPhotoUrl && !photoPath?.startsWith(`${initial?.photo_url}`) ? null : null}
            {existingPhotoUrl && photoPath === initial?.photo_url ? (
              <img src={existingPhotoUrl} alt="Foto previa" className="w-full max-h-64 object-cover rounded-md border" />
            ) : null}
            <PhotoCapture bucket="delivery-photos" value={photoPath} onChange={setPhotoPath} />
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
