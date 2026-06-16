import { Loading03Icon, TruckDeliveryIcon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { Card, CardContent } from "@/components/ui/card";

export function DispatchWaitingCard({
  routeName,
  branchName,
}: {
  routeName?: string | null;
  branchName?: string | null;
}) {
  return (
    <Card>
      <CardContent className="py-12 text-center space-y-3">
        <Icon icon={TruckDeliveryIcon} className="h-10 w-10 mx-auto text-muted-foreground" />
        <div>
          <p className="font-medium">Esperando despacho</p>
          {routeName && (
            <p className="text-sm text-muted-foreground mt-1">
              Ruta: <span className="font-medium text-foreground">{routeName}</span>
              {branchName ? ` · ${branchName}` : ""}
            </p>
          )}
        </div>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Tu panel se habilitará cuando el administrador registre el despacho del día con el producto cargado en la unidad.
        </p>
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-1">
          <Icon icon={Loading03Icon} className="h-3.5 w-3.5 animate-spin" />
          Actualizando automáticamente…
        </div>
      </CardContent>
    </Card>
  );
}
