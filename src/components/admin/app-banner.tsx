import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getAppBanner, setAppBanner } from "@/lib/api/banner.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Cancel01Icon, Megaphone01Icon } from "@hugeicons/core-free-icons";

const QUERY_KEY = ["appBanner"];

function useAppBanner() {
  const fn = useServerFn(getAppBanner);
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => fn(),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}

function dismissKey(message: string) {
  return `app-banner-dismissed:${message}`;
}

/** Soft notice strip under the top bar. Dismissible per browser session; a new message shows again. */
export function AppBannerStrip() {
  const { data } = useAppBanner();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!data?.message) return;
    try {
      setDismissed(sessionStorage.getItem(dismissKey(data.message)) === "1");
    } catch {
      setDismissed(false);
    }
  }, [data?.message]);

  if (!data?.is_active || !data.message || dismissed) return null;

  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-2 border-b border-amber-200/70 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200"
    >
      <span className="min-w-0 flex-1">{data.message}</span>
      <button
        type="button"
        aria-label="Cerrar aviso"
        className="shrink-0 rounded p-1 text-amber-700/70 transition-colors hover:bg-amber-100 hover:text-amber-900 dark:text-amber-300/70 dark:hover:bg-amber-900/40"
        onClick={() => {
          try {
            sessionStorage.setItem(dismissKey(data.message), "1");
          } catch {
            /* storage unavailable: just hide for this render */
          }
          setDismissed(true);
        }}
      >
        <Icon icon={Cancel01Icon} className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Header button + dialog to edit the banner. Renders nothing unless the server says this user can edit. */
export function AppBannerEditor() {
  const qc = useQueryClient();
  const { data } = useAppBanner();
  const saveFn = useServerFn(setAppBanner);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (open && data) {
      setMessage(data.message);
      setActive(data.is_active);
    }
  }, [open, data]);

  const mut = useMutation({
    mutationFn: () => saveFn({ data: { message, is_active: active } }),
    onSuccess: () => {
      toast.success(active ? "Aviso publicado" : "Aviso guardado (oculto)");
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data?.can_edit) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground"
        aria-label="Editar aviso"
        title="Editar aviso"
        onClick={() => setOpen(true)}
      >
        <Icon icon={Megaphone01Icon} className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aviso en el panel</DialogTitle>
            <DialogDescription>
              Se muestra arriba del panel a todo el equipo. Cada persona puede cerrarlo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="banner-message">Mensaje</Label>
              <Textarea
                id="banner-message"
                rows={3}
                maxLength={300}
                value={message}
                placeholder="Ej. Pago pendiente del mes: quedan 2 días."
                onChange={(e) => setMessage(e.target.value)}
              />
              <div className="text-right text-xs text-muted-foreground">{message.length}/300</div>
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <Label htmlFor="banner-active" className="cursor-pointer">Mostrar aviso</Label>
              <Switch id="banner-active" checked={active} onCheckedChange={setActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
              {mut.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
