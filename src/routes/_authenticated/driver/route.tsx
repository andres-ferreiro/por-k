import { Analytics01Icon, Logout01Icon, MapPinIcon, ReceiptTextIcon, Loading03Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { createFileRoute, Outlet, Link, useRouterState, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyContext } from "@/lib/api/context.functions";
import { getMyRouteToday, publishDriverLocation } from "@/lib/api/driver.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DispatchWaitingCard } from "@/components/driver/dispatch-waiting";


export const Route = createFileRoute("/_authenticated/driver")({
  loader: async ({ context }) => {
    const ctx = await context.queryClient.fetchQuery({
      queryKey: ["myContext"],
      queryFn: () => getMyContext(),
    });
    if (ctx.primaryRole !== "driver") throw redirect({ to: "/app" });
    return ctx;
  },
  component: DriverShell,
});

const TABS = [
  { to: "/driver", label: "Mi ruta", icon: MapPinIcon, exact: true },
  { to: "/driver/overview", label: "Resumen", icon: Analytics01Icon },
  { to: "/driver/expenses", label: "Gastos", icon: ReceiptTextIcon },
];

function DriverShell() {
  const ctx = Route.useLoaderData();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const fetchRoute = useServerFn(getMyRouteToday);
  const publishLocation = useServerFn(publishDriverLocation);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: routeData, isLoading: routeLoading } = useQuery({
    queryKey: ["driver", "myRouteToday"],
    queryFn: () => fetchRoute(),
    refetchInterval: (query) => {
      const d = query.state.data;
      return d?.dispatch && d.dispatch.require_dispatch && !d.dispatch.can_work ? 15_000 : false;
    },
  });

  // Publish GPS location every 60s when driver can work
  useEffect(() => {
    if (!routeData?.can_work) {
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
        locationIntervalRef.current = null;
      }
      return;
    }
    const publish = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          publishLocation({
            data: {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy ?? null,
            },
          }).catch(() => {});
        },
        () => {},
        { enableHighAccuracy: false, timeout: 10_000 },
      );
    };
    publish();
    locationIntervalRef.current = setInterval(publish, 60_000);
    return () => {
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
        locationIntervalRef.current = null;
      }
    };
  }, [routeData?.can_work, publishLocation]);

  const hasPreorderWork = (routeData?.preorder?.customers ?? []).some(
    (c) => c.order || c.delivery,
  );
  const waitingForDispatch =
    !!routeData?.dispatch
    && routeData.dispatch.require_dispatch
    && !routeData.dispatch.can_work
    && !hasPreorderWork;

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="sm:flex sm:min-h-dvh sm:items-start sm:justify-center sm:bg-muted/30">
      <div className="flex h-dvh flex-col overflow-x-hidden bg-background sm:w-full sm:max-w-md sm:shadow-2xl sm:border-x sm:border-border">
        <header className="sticky top-0 z-10 shrink-0 bg-primary text-primary-foreground px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-xs text-primary-foreground/80">Repartidor</div>
            <div className="font-semibold text-lg leading-tight truncate">{ctx.fullName ?? ctx.email}</div>
            {ctx.branchName && <div className="text-xs text-primary-foreground/80 truncate">{ctx.branchName}</div>}
          </div>
          <Button variant="ghost" size="icon" onClick={signOut} className="shrink-0 text-primary-foreground hover:bg-white/10">
            <Icon icon={Logout01Icon} className="h-5 w-5" />
          </Button>
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-4 py-5">
          {routeLoading ? (
            <div className="flex items-center justify-center py-20">
              <Icon icon={Loading03Icon} className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : waitingForDispatch && pathname === "/driver" ? (
            <DispatchWaitingCard
              routeName={routeData?.dispatch?.route?.name}
              branchName={routeData?.dispatch?.route?.branch_name}
            />
          ) : (
            <Outlet />
          )}
        </main>

        <nav className="shrink-0 grid grid-cols-3 border-t bg-background pb-[env(safe-area-inset-bottom,0px)]">
          {TABS.map((t) => {
            const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] transition-colors ${
                  active ? "text-primary font-medium" : "text-muted-foreground"
                }`}
              >
                <Icon icon={t.icon} className="h-5 w-5" />
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
