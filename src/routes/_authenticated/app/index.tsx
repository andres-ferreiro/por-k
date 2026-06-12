import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyContext } from "@/lib/api/context.functions";
import { OwnerDashboard } from "@/components/admin/owner-dashboard";
import { SupervisorDashboard } from "@/components/admin/supervisor-dashboard";
import { CashierDashboard } from "@/components/admin/cashier-dashboard";

export const Route = createFileRoute("/_authenticated/app/")({
  component: Dashboard,
});

function Dashboard() {
  const fn = useServerFn(getMyContext);
  const { data: ctx } = useQuery({
    queryKey: ["myContext"],
    queryFn: () => fn(),
    staleTime: Infinity,
  });

  const role = ctx?.primaryRole;

  if (role === "owner") return <OwnerDashboard roles={ctx!.roles} ownBranchName={ctx!.branchName} />;
  if (role === "supervisor") return <SupervisorDashboard />;
  return <CashierDashboard />;
}
