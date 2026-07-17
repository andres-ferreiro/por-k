import type { getLiveOperations } from "@/lib/api/admin.functions";
import { cn } from "@/lib/utils";

export type LiveRoute = Awaited<ReturnType<typeof getLiveOperations>>["routes"][number];
export type LiveKanban = Awaited<ReturnType<typeof getLiveOperations>>["kanban"];

export function splitLiveRoutes(routes: LiveRoute[]) {
  return {
    dispatch: routes.filter((r) => !r.is_preorder),
    preorder: routes.filter((r) => r.is_preorder),
  };
}

export function filterKanbanByRoutes(kanban: LiveKanban, routeIds: Set<string>): LiveKanban {
  const match = (stop: { route_id: string }) => routeIds.has(stop.route_id);
  return {
    unvisited: kanban.unvisited.filter(match),
    pending: kanban.pending.filter(match),
    delivered: kanban.delivered.filter(match),
    failed: kanban.failed.filter(match),
  };
}

export function filterKanbanByMode(kanban: LiveKanban, isPreorder: boolean): LiveKanban {
  const match = (stop: { is_preorder?: boolean }) => (stop.is_preorder ?? false) === isPreorder;
  return {
    unvisited: kanban.unvisited.filter(match),
    pending: kanban.pending.filter(match),
    delivered: kanban.delivered.filter(match),
    failed: kanban.failed.filter(match),
  };
}

type RouteCardProps = {
  route: LiveRoute;
  selected: boolean;
  onSelect: () => void;
};

export function LiveRouteCard({ route, selected, onSelect }: RouteCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "rounded-xl border p-3 text-left transition-colors hover:bg-muted/40",
        selected && "border-primary bg-primary/5",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium text-sm truncate">{route.name}</div>
        <span className="text-xs font-bold tabular-nums text-primary">{route.progress_pct}%</span>
      </div>
      <div className="text-xs text-muted-foreground mt-0.5 truncate">
        {route.driver_name ?? "Sin repartidor"}
        {route.is_preorder ? " · Pedidos" : !route.dispatched ? " · Sin despacho" : ""}
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${route.progress_pct}%` }}
        />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
        <span className="text-emerald-600">{route.delivered} ✓</span>
        <span className="text-amber-600">{route.pending} ◷</span>
        <span className="text-rose-600">{route.failed} ✕</span>
        <span>{route.unvisited} ○</span>
        {route.failed_pct > 0 && <span className="text-rose-600">{route.failed_pct}% fallidas</span>}
      </div>
      {(route.stops_per_hour != null || route.sequence_score != null) && (
        <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] font-medium tabular-nums">
          {route.stops_per_hour != null && (
            <span className="text-primary">{route.stops_per_hour} paradas/h</span>
          )}
          {route.avg_minutes_per_stop != null && (
            <span className="text-muted-foreground">{route.avg_minutes_per_stop} min/parada</span>
          )}
          {route.sequence_score != null && (
            <span
              className={cn(
                route.sequence_score >= 80
                  ? "text-emerald-600"
                  : route.sequence_score >= 50
                    ? "text-amber-600"
                    : "text-rose-600",
              )}
            >
              Orden {route.sequence_score}%
            </span>
          )}
        </div>
      )}
    </button>
  );
}

export function LiveRouteSections({
  routes,
  selectedRouteId,
  onSelectRoute,
}: {
  routes: LiveRoute[];
  selectedRouteId: string;
  onSelectRoute: (routeId: string) => void;
}) {
  const { dispatch, preorder } = splitLiveRoutes(routes);

  const renderSection = (title: string, items: LiveRoute[]) => {
    if (items.length === 0) return null;
    return (
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-0.5">
          {title}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {items.map((route) => (
            <LiveRouteCard
              key={route.id}
              route={route}
              selected={selectedRouteId === route.id}
              onSelect={() => onSelectRoute(route.id)}
            />
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-5">
      {renderSection("Tiendas de abarrotes", dispatch)}
      {renderSection("Hoteles y restaurantes", preorder)}
    </div>
  );
}
