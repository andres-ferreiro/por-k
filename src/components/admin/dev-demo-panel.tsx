import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, FlaskConical, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useBranchScope } from "@/lib/branch-scope";
import {
  clearDevDemoDataFn,
  getDevDemoStatusFn,
  seedDevDemoDataFn,
} from "@/lib/api/dev-demo.functions";

const MINIMIZED_KEY = "devDemoPanel.minimized";

export function DevDemoPanel() {
  if (!import.meta.env.DEV) return null;

  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    try {
      setMinimized(localStorage.getItem(MINIMIZED_KEY) === "1");
    } catch {
      // ignore
    }
  }, []);

  function toggleMinimized(next?: boolean) {
    const value = next ?? !minimized;
    setMinimized(value);
    try {
      localStorage.setItem(MINIMIZED_KEY, value ? "1" : "0");
    } catch {
      // ignore
    }
  }

  const { branchId } = useBranchScope();
  const queryClient = useQueryClient();
  const statusFn = useServerFn(getDevDemoStatusFn);
  const seedFn = useServerFn(seedDevDemoDataFn);
  const clearFn = useServerFn(clearDevDemoDataFn);

  const { data: status, isLoading } = useQuery({
    queryKey: ["devDemo", "status"],
    queryFn: () => statusFn(),
    staleTime: 5_000,
  });

  const invalidateDashboard = () => {
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["devDemo"] });
  };

  const seedMut = useMutation({
    mutationFn: () => seedFn({ data: { branch_id: branchId } }),
    onSuccess: (result) => {
      toast.success(
        `Demo cargada: ${result.days} días, ${result.routes} ruta${result.routes === 1 ? "" : "s"}.`,
      );
      invalidateDashboard();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearMut = useMutation({
    mutationFn: () => clearFn(),
    onSuccess: (result) => {
      toast.success(`Demo eliminada (${result.removed} registros).`);
      invalidateDashboard();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = seedMut.isPending || clearMut.isPending;

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => toggleMinimized(false)}
        title="Mostrar panel demo"
        className="fixed bottom-4 right-4 z-50 relative flex h-9 w-9 items-center justify-center rounded-full border border-amber-300/80 bg-amber-50/95 text-amber-800 shadow-md backdrop-blur-sm transition-colors hover:bg-amber-100 dark:border-amber-700/60 dark:bg-amber-950/90 dark:text-amber-200 dark:hover:bg-amber-900"
      >
        <FlaskConical className="h-4 w-4" />
        {!isLoading && status?.active && (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-teal-600 ring-2 ring-amber-50 dark:ring-amber-950" />
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-xs flex-col gap-2 rounded-xl border border-amber-300/80 bg-amber-50/95 p-3 shadow-lg backdrop-blur-sm dark:border-amber-700/60 dark:bg-amber-950/90">
      <div className="flex items-start gap-2">
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-100">Datos demo (dev)</p>
          <p className="mt-0.5 text-[11px] leading-snug text-amber-800/90 dark:text-amber-200/80">
            Crea despachos, ventas, devoluciones y pagos de los últimos 7 días. No modifica catálogo, rutas ni clientes.
          </p>
          {!isLoading && status?.active && (
            <p className="mt-1 text-[11px] tabular-nums text-amber-900/80 dark:text-amber-100/80">
              Activa: {status.counts.dispatches} despachos · {status.counts.deliveries} entregas ·{" "}
              {status.counts.payments} pagos · {status.counts.expenses} gastos
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-amber-700 hover:bg-amber-100/80 hover:text-amber-900 dark:text-amber-300 dark:hover:bg-amber-900/50"
          onClick={() => toggleMinimized(true)}
          title="Minimizar"
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="default"
          className="h-8 flex-1"
          disabled={busy}
          onClick={() => seedMut.mutate()}
        >
          {seedMut.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <FlaskConical className="mr-1.5 h-3.5 w-3.5" />
          )}
          Cargar demo
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-amber-300/80 bg-transparent hover:bg-amber-100/80 dark:border-amber-700 dark:hover:bg-amber-900/50"
              disabled={busy || !status?.active}
            >
              {clearMut.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Borrar
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar datos demo?</AlertDialogTitle>
              <AlertDialogDescription>
                Se borrarán todos los despachos, entregas, pagos y gastos generados por la demo.
                Catálogo, rutas, clientes y usuarios no se tocan.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => clearMut.mutate()}>Eliminar demo</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
