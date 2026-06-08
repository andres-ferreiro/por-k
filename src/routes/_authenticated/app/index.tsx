import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/app/")({
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inicio</h1>
        <p className="text-muted-foreground">Resumen de actividad — próximamente con datos reales.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { t: "Despachos hoy", v: "—" },
          { t: "Entregas completadas", v: "—" },
          { t: "Cobros del día", v: "—" },
        ].map((c) => (
          <Card key={c.t}>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{c.t}</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-semibold">{c.v}</div></CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
