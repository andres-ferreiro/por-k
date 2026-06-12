import { createFileRoute, Outlet, Link, useRouterState, useNavigate, redirect } from "@tanstack/react-router";
import { getMyContext, type AppRole } from "@/lib/api/context.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
  SidebarHeader,
} from "@/components/ui/sidebar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import {
  DashboardSquare01Icon,
  Building03Icon,
  UserGroupIcon,
  Package01Icon,
  ContactIcon,
  Route01Icon,
  DeliveryTruck01Icon,
  PackageDelivered01Icon,
  Wallet01Icon,
  ReceiptTextIcon,
  BarChartIcon,
  Logout01Icon,
  ArrowDown01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { BranchScopeProvider } from "@/lib/branch-scope";
import { BranchSwitcher } from "@/components/admin/branch-switcher";

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
  icon: IconSvgElement;
  roles: AppRole[];
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "General",
    items: [
      { to: "/app", label: "Inicio", icon: DashboardSquare01Icon, roles: ["owner", "supervisor", "cashier"] },
    ],
  },
  {
    group: "Administración",
    items: [
      { to: "/app/branches", label: "Sucursales", icon: Building03Icon, roles: ["owner"] },
      { to: "/app/users", label: "Usuarios", icon: UserGroupIcon, roles: ["owner"] },
      { to: "/app/products", label: "Catálogo", icon: Package01Icon, roles: ["owner"] },
    ],
  },
  {
    group: "Operación",
    items: [
      { to: "/app/customers", label: "Clientes", icon: ContactIcon, roles: ["owner", "supervisor"] },
      { to: "/app/routes", label: "Rutas", icon: Route01Icon, roles: ["owner", "supervisor"] },
      { to: "/app/dispatch", label: "Despacho", icon: DeliveryTruck01Icon, roles: ["owner", "supervisor", "cashier"] },
      { to: "/app/deliveries", label: "Entregas", icon: PackageDelivered01Icon, roles: ["owner", "supervisor"] },
      { to: "/app/payments", label: "Pagos", icon: Wallet01Icon, roles: ["owner", "supervisor", "cashier"] },
      { to: "/app/expenses", label: "Gastos", icon: ReceiptTextIcon, roles: ["owner", "supervisor", "cashier"] },
      { to: "/app/reports", label: "Reportes", icon: BarChartIcon, roles: ["owner", "supervisor"] },
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

function userInitials(fullName: string | null, email: string | null) {
  if (fullName) {
    return fullName
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }
  return email?.[0]?.toUpperCase() ?? "?";
}

function UserMenu({
  ctx,
  onSignOut,
}: {
  ctx: Awaited<ReturnType<typeof getMyContext>>;
  onSignOut: () => void;
}) {
  const displayName = ctx.fullName ?? ctx.email;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg px-2 py-1.5 outline-none hover:bg-muted/60 transition-colors">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
            {userInitials(ctx.fullName, ctx.email)}
          </AvatarFallback>
        </Avatar>
        <div className="hidden sm:block text-left">
          <div className="text-sm font-medium leading-none truncate max-w-[140px]">{displayName}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{roleLabel(ctx.primaryRole)}</div>
        </div>
        <Icon icon={ArrowDown01Icon} className="h-3.5 w-3.5 text-muted-foreground hidden sm:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="font-medium">{displayName}</div>
          <div className="text-xs text-muted-foreground">{ctx.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut} className="text-destructive focus:text-destructive">
          <Icon icon={Logout01Icon} className="h-4 w-4" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
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
    <BranchScopeProvider>
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <Sidebar collapsible="icon">
          <SidebarHeader className="px-4 py-5 group-data-[collapsible=icon]:px-0">
            <div className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center">
              <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold shrink-0">P</div>
              <div className="group-data-[collapsible=icon]:hidden">
                <div className="font-semibold text-foreground text-sm">Panadería Ops</div>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent className="px-2 group-data-[collapsible=icon]:px-0">
            {NAV.map((group) => {
              const visible = group.items.filter((i) =>
                ctx.roles.some((r: AppRole) => i.roles.includes(r)),
              );
              if (visible.length === 0) return null;
              return (
                <SidebarGroup key={group.group}>
                  <SidebarGroupLabel className="text-muted-foreground/70 uppercase tracking-wider text-[10px]">
                    {group.group}
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {visible.map((item) => {
                        const active = item.to === "/app"
                          ? pathname === "/app"
                          : pathname.startsWith(item.to);
                        return (
                          <SidebarMenuItem key={item.to}>
                            <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                              <Link to={item.to}>
                                <Icon icon={item.icon} className="h-4 w-4" />
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
        </Sidebar>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-3 border-b border-border/60 bg-white px-4 shrink-0">
            <SidebarTrigger className="text-muted-foreground" />
            <BranchSwitcher roles={ctx.roles} ownBranchName={ctx.branchName} />
            <div className="flex-1" />
            <UserMenu ctx={ctx} onSignOut={handleSignOut} />
          </header>
          <main className="flex-1 p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
    </BranchScopeProvider>
  );
}
