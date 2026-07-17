import { useState } from "react";

export type DashboardChannel = "all" | "dispatch" | "preorder";

export function useDashboardChannel(defaultChannel: DashboardChannel = "all") {
  const [channel, setChannel] = useState<DashboardChannel>(defaultChannel);
  const routeMode = channel === "all" ? null : channel;
  return { channel, setChannel, routeMode };
}

export const DASHBOARD_CHANNEL_LABELS: Record<DashboardChannel, string> = {
  all: "Todo",
  dispatch: "Tiendas de abarrotes",
  preorder: "Hoteles y restaurantes",
};
