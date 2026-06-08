import { createFileRoute } from "@tanstack/react-router";
import { Placeholder } from "@/components/placeholder";

export const Route = createFileRoute("/_authenticated/app/reports")({
  component: () => <Placeholder title="Reportes" description="Reportes consolidados por sucursal y empresa." />,
});
