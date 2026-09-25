import { tzDayRange } from "@/lib/tz";

export type DriverRoute = {
  id: string;
  name: string;
  branch_id: string;
  route_mode: "dispatch" | "preorder";
  branches: { name: string | null } | null;
};

// Finds the route a driver was ad-hoc dispatched onto *today*, regardless of
// which route they're permanently assigned to (routes.driver_id). This covers
// substitute/floater drivers who cover a different route than their usual one.
async function getTodayDispatchRouteForDriver(
  supabase: any,
  driverId: string,
  today: string,
): Promise<DriverRoute | null> {
  const { startISO, endISO } = tzDayRange(today);
  const { data, error } = await supabase
    .from("dispatches")
    .select(
      "route_id, dispatched_at, routes(id, name, branch_id, route_mode, is_active, branches!routes_branch_id_fkey(name))",
    )
    .eq("driver_id", driverId)
    .gte("dispatched_at", startISO)
    .lt("dispatched_at", endISO)
    .order("dispatched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const route = (data as any)?.routes;
  return route?.is_active ? route : null;
}

// Resolves the route a driver should work with *today*: prefer a same-day
// ad-hoc dispatch (dispatches.driver_id) over the driver's permanent route
// assignment (routes.driver_id), since a supervisor may reassign a driver to
// cover a different route for a single day without changing their permanent
// assignment.
export async function resolveDriverActiveRoute(
  supabase: any,
  userId: string,
  today: string,
  opts: { routeMode?: "dispatch" | "preorder" } = {},
): Promise<DriverRoute | null> {
  const dispatchedRoute = await getTodayDispatchRouteForDriver(supabase, userId, today);
  if (dispatchedRoute && (!opts.routeMode || dispatchedRoute.route_mode === opts.routeMode)) {
    return dispatchedRoute;
  }

  let query = supabase
    .from("routes")
    .select("id, name, branch_id, route_mode, branches!routes_branch_id_fkey(name)")
    .eq("driver_id", userId)
    .eq("is_active", true);
  if (opts.routeMode) query = query.eq("route_mode", opts.routeMode);
  const { data: routes, error } = await query.order("updated_at", { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  return ((routes ?? [])[0] as DriverRoute | undefined) ?? null;
}
