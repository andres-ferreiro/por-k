import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { getLiveOperations } from "@/lib/api/admin.functions";
import { getMyContext } from "@/lib/api/context.functions";
import { useBranchScope } from "@/lib/branch-scope";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCardSimple, StatGrid } from "@/components/admin/stat-cards";
import { LiveOperationsKanban } from "@/components/admin/live-operations-kanban";
import { LiveOperationsMap } from "@/components/admin/live-operations-map";
import { LiveOperationsFeed } from "@/components/admin/live-operations-feed";
import {
  filterKanbanByMode,
  LiveRouteSections,
  splitLiveRoutes,
} from "@/components/admin/live-route-sections";
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

  const { data, dataUpdatedAt, isLoading, isFetching, isError, error } = useQuery({
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

  const routeGroups = useMemo(() => splitLiveRoutes(data?.routes ?? []), [data?.routes]);

  const kanbanViews = useMemo(() => {
    if (!data) return null;
    if (routeId !== "all") {
      return [{ title: undefined, kanban: data.kanban }];
    }
    return [
      { title: "Tiendas de abarrotes", kanban: filterKanbanByMode(data.kanban, false) },
      { title: "Hoteles y restaurantes", kanban: filterKanbanByMode(data.kanban, true) },
    ];
  }, [data, routeId]);

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
            <SelectTrigger className="w-[200px] h-9 text-sm">
              <SelectValue placeholder="Todas las rutas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las rutas</SelectItem>
              {routeGroups.dispatch.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Tiendas de abarrotes</SelectLabel>
                  {routeGroups.dispatch.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {routeGroups.preorder.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Hoteles y restaurantes</SelectLabel>
                  {routeGroups.preorder.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
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
            <LiveRouteSections
              routes={data.routes}
              selectedRouteId={routeId}
              onSelectRoute={setRouteId}
            />
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

            <TabsContent value="kanban" className="mt-0 space-y-6">
              {kanbanViews?.map((view) => (
                <LiveOperationsKanban key={view.title ?? "single"} kanban={view.kanban} title={view.title} />
              ))}
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
      ) : isError ? (
        <div className="py-20 text-center text-sm text-destructive">
          {(error as Error)?.message ?? "No se pudieron cargar las operaciones en vivo."}
        </div>
      ) : null}
    </div>
  );
}
