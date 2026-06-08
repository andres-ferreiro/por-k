import { createFileRoute, Outlet, Link, useRouterState, useNavigate, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyContext, type AppRole } from "@/lib/api/context.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Building2, Users, Package, Contact, Route as RouteIcon, Truck,
  PackageCheck, Wallet, Receipt, BarChart3, LogOut, LayoutDashboard,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app")({
  loader: async ({ context }) => {
    const ctx = await context.queryClient.fetchQuery({
      queryKey: ["myContext"],
      queryFn: () => getMyContext(),
    });
    if (ctx.primaryRole === "driver") throw redirect({ to: "/driver" });
    if (!ctx.primaryRole) throw redirect({ to: "/auth" });
    return ctx;
  },
  component: AdminShell,
});

interface NavItem {
  to: string;
  label: string;
  icon: typeof Building2;
  roles: AppRole[];
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "General",
    items: [
      { to: "/app", label: "Inicio", icon: LayoutDashboard, roles: ["owner", "supervisor", "cashier"] },
    ],
  },
  {
    group: "Administración",
    items: [
      { to: "/app/branches", label: "Sucursales", icon: Building2, roles: ["owner"] },
      { to: "/app/users", label: "Usuarios", icon: Users, roles: ["owner"] },
      { to: "/app/products", label: "Catálogo", icon: Package, roles: ["owner"] },
    ],
  },
  {
    group: "Operación",
    items: [
      { to: "/app/customers", label: "Clientes", icon: Contact, roles: ["owner", "supervisor"] },
      { to: "/app/routes", label: "Rutas", icon: RouteIcon, roles: ["owner", "supervisor"] },
      { to: "/app/dispatch", label: "Despacho", icon: Truck, roles: ["owner", "supervisor", "cashier"] },
      { to: "/app/deliveries", label: "Entregas", icon: PackageCheck, roles: ["owner", "supervisor"] },
      { to: "/app/payments", label: "Pagos", icon: Wallet, roles: ["owner", "supervisor", "cashier"] },
      { to: "/app/expenses", label: "Gastos", icon: Receipt, roles: ["owner", "supervisor", "cashier"] },
      { to: "/app/reports", label: "Reportes", icon: BarChart3, roles: ["owner", "supervisor"] },
    ],
  },
];

function roleLabel(role: AppRole | null) {
  switch (role) {
    case "owner": return "Propietario";
    case "supervisor": return "Supervisor";
    case "cashier": return "Cajero";
    case "driver": return "Repartidor";
    default: return "Sin rol";
  }
}

function AdminShell() {
  const ctx = Route.useLoaderData();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-muted/30">
        <Sidebar collapsible="icon">
          <SidebarHeader className="px-4 py-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-md bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center font-bold">P</div>
              <div className="group-data-[collapsible=icon]:hidden">
                <div className="font-semibold text-sidebar-foreground">Panadería Ops</div>
                <div className="text-xs text-sidebar-foreground/70">{ctx.branchName ?? "Empresa"}</div>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent>
            {NAV.map((group) => {
              const visible = group.items.filter((i) =>
                ctx.roles.some((r: AppRole) => i.roles.includes(r)),
              );
              if (visible.length === 0) return null;
              return (
                <SidebarGroup key={group.group}>
                  <SidebarGroupLabel>{group.group}</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {visible.map((item) => {
                        const active = item.to === "/app"
                          ? pathname === "/app"
                          : pathname.startsWith(item.to);
                        return (
                          <SidebarMenuItem key={item.to}>
                            <SidebarMenuButton asChild isActive={active}>
                              <Link to={item.to}>
                                <item.icon className="h-4 w-4" />
                                <span>{item.label}</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              );
            })}
          </SidebarContent>
          <SidebarFooter className="px-4 py-3">
            <div className="group-data-[collapsible=icon]:hidden text-xs text-sidebar-foreground/80">
              <div className="font-medium text-sidebar-foreground truncate">{ctx.fullName ?? ctx.email}</div>
              <div>{roleLabel(ctx.primaryRole)}</div>
            </div>
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="mt-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground justify-start">
              <LogOut className="h-4 w-4" />
              <span className="group-data-[collapsible=icon]:hidden">Cerrar sesión</span>
            </Button>
          </SidebarFooter>
        </Sidebar>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-2 border-b bg-background px-4">
            <SidebarTrigger />
            <div className="text-sm text-muted-foreground">{ctx.branchName ?? "Toda la empresa"}</div>
          </header>
          <main className="flex-1 p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
