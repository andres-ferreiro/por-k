import { createFileRoute } from "@tanstack/react-router";
import { Placeholder } from "@/components/placeholder";

export const Route = createFileRoute("/_authenticated/app/payments")({
  component: () => <Placeholder title="Pagos" description="Cobros y pagos pendientes." />,
});
