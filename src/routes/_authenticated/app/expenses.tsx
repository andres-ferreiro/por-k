import { createFileRoute } from "@tanstack/react-router";
import { Placeholder } from "@/components/placeholder";

export const Route = createFileRoute("/_authenticated/app/expenses")({
  component: () => <Placeholder title="Gastos" description="Gastos registrados por repartidor o ruta." />,
});
