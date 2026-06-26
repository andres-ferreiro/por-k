import { createFileRoute } from "@tanstack/react-router";
import { TransferStopList } from "@/components/supply-driver/stop-list";

export const Route = createFileRoute("/_authenticated/supply-driver/stops")({
  component: TransferStopList,
});
