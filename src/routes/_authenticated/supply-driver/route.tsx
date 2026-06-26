import {
  Analytics01Icon,
  Logout01Icon,
  DeliveryTruck01Icon,
  Clock01Icon,
  MapPinIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { createFileRoute, Outlet, Link, useRouterState, useNavigate, redirect } from "@tanstack/react-router";
import { getMyContext } from "@/lib/api/context.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/supply-driver")({
  loader: async ({ context }) => {
    const ctx = await context.queryClient.fetchQuery({
      queryKey: ["myContext"],
      queryFn: () => getMyContext(),
    });
    if (ctx.primaryRole !== "transfer_driver" && !ctx.roles.includes("owner")) {
      throw redirect({ to: "/app" });
    }
    return ctx;
  },
  component: SupplyDriverShell,
});

const TABS = [
  { to: "/supply-driver", label: "Resumen", icon: Analytics01Icon, exact: true },
  { to: "/supply-driver/stops", label: "Paradas", icon: MapPinIcon },
  { to: "/supply-driver/history", label: "Historial", icon: Clock01Icon },
];

function SupplyDriverShell() {
  const ctx = Route.useLoaderData();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="sm:flex sm:min-h-dvh sm:items-start sm:justify-center sm:bg-muted/30">
      <div className="flex h-dvh flex-col overflow-x-hidden bg-background sm:w-full sm:max-w-md sm:shadow-2xl sm:border-x sm:border-border">
        <header className="sticky top-0 z-10 shrink-0 bg-primary text-primary-foreground px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-xs text-primary-foreground/80 flex items-center gap-1">
              <Icon icon={DeliveryTruck01Icon} className="h-3.5 w-3.5" />
              Abastecimiento
            </div>
            <div className="font-semibold text-lg leading-tight truncate">{ctx.fullName ?? ctx.email}</div>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut} className="shrink-0 text-primary-foreground hover:bg-white/10">
            <Icon icon={Logout01Icon} className="h-5 w-5" />
          </Button>
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-4 py-5">
          <Outlet />
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
