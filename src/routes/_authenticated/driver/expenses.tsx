import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/driver/expenses")({
  component: Page,
});

function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Gastos</h1>
      <p className="text-muted-foreground">Registra gastos del día con foto del recibo.</p>
      <Card><CardContent className="py-12 text-center text-muted-foreground">
        Aún no hay datos.
      </CardContent></Card>
    </div>
  );
}
