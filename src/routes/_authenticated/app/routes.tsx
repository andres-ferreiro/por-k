import { createFileRoute } from "@tanstack/react-router";
import { Placeholder } from "@/components/placeholder";

export const Route = createFileRoute("/_authenticated/app/routes")({
  component: () => <Placeholder title="Rutas" description="Define rutas asignando clientes y un repartidor." />,
});
