import { createFileRoute } from "@tanstack/react-router";
import { TransferDaySummary } from "@/components/supply-driver/day-summary";

export const Route = createFileRoute("/_authenticated/supply-driver/")({
  component: TransferDaySummary,
});
