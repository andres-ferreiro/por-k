import { createFileRoute, Outlet, Link, useRouterState, useNavigate, redirect } from "@tanstack/react-router";
import { getMyContext } from "@/lib/api/context.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { MapPin, PackageCheck, Wallet, Receipt, LogOut } from "lucide-react";

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
  { to: "/driver", label: "Mi ruta", icon: MapPin, exact: true },
  { to: "/driver/deliveries", label: "Entregas", icon: PackageCheck },
  { to: "/driver/payments", label: "Pagos", icon: Wallet },
  { to: "/driver/expenses", label: "Gastos", icon: Receipt },
];

function DriverShell() {
  const ctx = Route.useLoaderData();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col max-w-md mx-auto shadow-xl">
      <header className="bg-primary text-primary-foreground px-5 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <div className="text-xs opacity-80">Repartidor</div>
          <div className="font-semibold text-lg leading-tight">{ctx.fullName ?? ctx.email}</div>
          {ctx.branchName && <div className="text-xs opacity-80">{ctx.branchName}</div>}
        </div>
        <Button variant="ghost" size="icon" onClick={signOut} className="text-primary-foreground hover:bg-white/10">
          <LogOut className="h-5 w-5" />
        </Button>
      </header>

      <main className="flex-1 overflow-auto p-5 pb-24">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 mx-auto max-w-md bg-background border-t grid grid-cols-4">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`flex flex-col items-center justify-center py-3 gap-1 text-xs ${
                active ? "text-primary font-semibold" : "text-muted-foreground"
              }`}
            >
              <t.icon className="h-5 w-5" />
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
