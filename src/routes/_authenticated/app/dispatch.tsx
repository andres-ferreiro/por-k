import { createFileRoute } from "@tanstack/react-router";
import { Placeholder } from "@/components/placeholder";

export const Route = createFileRoute("/_authenticated/app/dispatch")({
  component: () => <Placeholder title="Despacho" description="Registra el producto que sale con cada repartidor." />,
});
