import { createFileRoute } from "@tanstack/react-router";
import { Placeholder } from "@/components/placeholder";

export const Route = createFileRoute("/_authenticated/app/deliveries")({
  component: () => <Placeholder title="Entregas" description="Seguimiento de entregas por ruta." />,
});
