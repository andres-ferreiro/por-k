import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { getLiveOperations } from "@/lib/api/admin.functions";
import { getMyContext } from "@/lib/api/context.functions";
import { useBranchScope } from "@/lib/branch-scope";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatCardSimple, StatGrid } from "@/components/admin/stat-cards";
import { LiveOperationsKanban } from "@/components/admin/live-operations-kanban";
import { LiveOperationsMap } from "@/components/admin/live-operations-map";
import { LiveOperationsFeed } from "@/components/admin/live-operations-feed";
import { BranchDriverLocationToggle } from "@/components/admin/branch-driver-location-toggle";
import { PageHeader } from "@/components/admin/data-table";
import { APP_LOCALE, APP_TZ } from "@/lib/tz";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/live")({
  loader: async ({ context }) => {
    const ctx = await context.queryClient.fetchQuery({
      queryKey: ["myContext"],
      queryFn: () => getMyContext(),
    });
    const allowed = ctx.roles.some((r) => r === "owner" || r === "supervisor");
    if (!allowed) throw redirect({ to: "/app" });
    return ctx;
  },
  component: LiveOperationsPage,
});

const tabTriggerClass =
  "rounded-none border-b-2 border-transparent bg-transparent py-2.5 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none";

function LiveOperationsPage() {
  const { branchId } = useBranchScope();
  const [routeId, setRouteId] = useState<string>("all");
  const fetchLive = useServerFn(getLiveOperations);

  const { data, dataUpdatedAt, isLoading, isFetching } = useQuery({
    queryKey: ["admin", "live", branchId, routeId],
    queryFn: () =>
      fetchLive({
        data: {
          branch_id: branchId,
          route_id: routeId === "all" ? null : routeId,
        },
      }),
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
  });

  const lastUpdate = useMemo(() => {
    if (!dataUpdatedAt) return null;
    return new Date(dataUpdatedAt).toLocaleTimeString(APP_LOCALE, {
      timeZone: APP_TZ,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }, [dataUpdatedAt]);

  const dateLabel = data?.date
    ? new Date(`${data.date}T12:00:00Z`).toLocaleDateString(APP_LOCALE, {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: APP_TZ,
      })
    : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Operaciones en vivo"
          description={`Seguimiento del día · ${dateLabel}`}
        />
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                isFetching ? "bg-amber-500 animate-pulse" : "bg-emerald-500",
              )}
            />
            {isFetching ? "Actualizando…" : "En vivo"}
            {lastUpdate && <span className="hidden sm:inline">· {lastUpdate}</span>}
          </div>
          <Select value={routeId} onValueChange={setRouteId}>
            <SelectTrigger className="w-[180px] h-9 text-sm">
              <SelectValue placeholder="Todas las rutas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las rutas</SelectItem>
              {(data?.routes ?? []).map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading && !data ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Cargando operaciones…</div>
      ) : data ? (
        <>
          <StatGrid>
            <StatCardSimple
              label="Rutas activas"
              value={data.summary.active_routes}
              sub={`${data.summary.dispatched_routes} despachadas`}
            />
            <StatCardSimple
              label="Progreso entregas"
              value={data.summary.delivered + data.summary.failed}
              displayValue={`${data.summary.delivered + data.summary.failed}/${data.summary.total_stops}`}
              sub={`${data.summary.unvisited} sin visitar · ${data.summary.pending} pendientes`}
            />
            <StatCardSimple
              label="Paradas / hora (prom.)"
              value={data.summary.avg_stops_per_hour ?? 0}
              displayValue={data.summary.avg_stops_per_hour != null ? `${data.summary.avg_stops_per_hour}` : "—"}
              sub={
                data.summary.avg_sequence_score != null
                  ? `Orden prom. ${data.summary.avg_sequence_score}%`
                  : "Sin visitas completadas"
              }
            />
            <StatCardSimple label="Cobrado hoy" value={data.summary.collected} mode="money" />
            <StatCardSimple label="Gastos hoy" value={data.summary.expenses} mode="money" />
          </StatGrid>

          {data.routes.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {data.routes.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRouteId(r.id)}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors hover:bg-muted/40",
                    routeId === r.id && "border-primary bg-primary/5",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm truncate">{r.name}</div>
                    <span className="text-xs font-bold tabular-nums text-primary">{r.progress_pct}%</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {r.driver_name ?? "Sin repartidor"}
                    {!r.dispatched && " · Sin despacho"}
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-500"
                      style={{ width: `${r.progress_pct}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                    <span className="text-emerald-600">{r.delivered} ✓</span>
                    <span className="text-amber-600">{r.pending} ◷</span>
                    <span className="text-rose-600">{r.failed} ✕</span>
                    <span>{r.unvisited} ○</span>
                    {r.failed_pct > 0 && <span className="text-rose-600">{r.failed_pct}% fallidas</span>}
                  </div>
                  {(r.stops_per_hour != null || r.sequence_score != null) && (
                    <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] font-medium tabular-nums">
                      {r.stops_per_hour != null && (
                        <span className="text-primary">{r.stops_per_hour} paradas/h</span>
                      )}
                      {r.avg_minutes_per_stop != null && (
                        <span className="text-muted-foreground">{r.avg_minutes_per_stop} min/parada</span>
                      )}
                      {r.sequence_score != null && (
                        <span
                          className={cn(
                            r.sequence_score >= 80
                              ? "text-emerald-600"
                              : r.sequence_score >= 50
                                ? "text-amber-600"
                                : "text-rose-600",
                          )}
                        >
                          Orden {r.sequence_score}%
                        </span>
                      )}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          <Tabs defaultValue="kanban" className="space-y-4">
            <TabsList className="grid h-auto w-full max-w-md grid-cols-3 gap-0 rounded-none border-b bg-transparent p-0">
              <TabsTrigger value="kanban" className={tabTriggerClass}>
                Kanban
              </TabsTrigger>
              <TabsTrigger value="map" className={tabTriggerClass}>
                Mapa
              </TabsTrigger>
              <TabsTrigger value="activity" className={tabTriggerClass}>
                Actividad
              </TabsTrigger>
            </TabsList>

            <TabsContent value="kanban" className="mt-0">
              <LiveOperationsKanban data={data} />
            </TabsContent>
            <TabsContent value="map" className="mt-0 space-y-3">
              <BranchDriverLocationToggle compact />
              <LiveOperationsMap data={data} routeId={routeId === "all" ? null : routeId} />
            </TabsContent>
            <TabsContent value="activity" className="mt-0">
              <LiveOperationsFeed data={data} />
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </div>
  );
}
