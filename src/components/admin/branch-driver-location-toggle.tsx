import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBranchLocationGate, setBranchLocationEnabled } from "@/lib/api/branches.functions";
import { useBranchScope } from "@/lib/branch-scope";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface Props {
  compact?: boolean;
}

export function BranchDriverLocationToggle({ compact }: Props) {
  const qc = useQueryClient();
  const { branchId } = useBranchScope();
  const getFn = useServerFn(getBranchLocationGate);
  const setFn = useServerFn(setBranchLocationEnabled);

  const canLoad = !!branchId;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["branch-location-gate", branchId],
    queryFn: () => getFn({ data: { branch_id: branchId } }),
    enabled: canLoad,
  });

  const mut = useMutation({
    mutationFn: (driver_location_enabled: boolean) =>
      setFn({ data: { branch_id: branchId, driver_location_enabled } }),
    onSuccess: (result) => {
      qc.setQueryData(["branch-location-gate", branchId], result);
      qc.invalidateQueries({ queryKey: ["driver", "myRouteToday"] });
      qc.invalidateQueries({ queryKey: ["admin", "live"] });
      toast.success(
        result.driver_location_enabled
          ? "Ubicación GPS se registrará al vender."
          : "Solo se mostrarán ubicaciones guardadas.",
      );
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo guardar."),
  });

  if (!canLoad) {
    return (
      <p className="text-xs text-muted-foreground">
        Selecciona una sucursal para configurar el registro de ubicación.
      </p>
    );
  }

  const enabled = data?.driver_location_enabled ?? false;

  return (
    <div
      className={
        compact
          ? "flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5"
          : "rounded-lg border bg-muted/30 px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
      }
    >
      <div className="min-w-0 space-y-0.5">
        <div className="text-sm font-medium">Ubicación al vender</div>
        <p className="text-xs text-muted-foreground">
          {isLoading
            ? "Cargando…"
            : enabled
              ? "Al registrar una venta, se guarda la ubicación GPS del repartidor en el cliente."
              : "Los pines muestran la ubicación guardada del cliente; no se actualiza al vender."}
        </p>
        {isError && <p className="text-xs text-destructive">Error al cargar configuración.</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Switch
          id="driver-location-on-sell"
          checked={enabled}
          disabled={isLoading || mut.isPending || isError}
          onCheckedChange={(v) => mut.mutate(v)}
        />
        <Label htmlFor="driver-location-on-sell" className="text-sm font-normal cursor-pointer">
          {enabled ? "Activado" : "Desactivado"}
        </Label>
      </div>
    </div>
  );
}
