import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/driver/")({
  component: Page,
});

function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Mi ruta</h1>
      <p className="text-muted-foreground">Hoy verás aquí los clientes asignados a tu ruta.</p>
      <Card><CardContent className="py-12 text-center text-muted-foreground">
        Aún no hay datos.
      </CardContent></Card>
    </div>
  );
}
