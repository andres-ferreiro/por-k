import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getMyContext } from "@/lib/api/context.functions";

export const Route = createFileRoute("/_authenticated/app/routes")({
  loader: async ({ context }) => {
    const ctx = await context.queryClient.fetchQuery({
      queryKey: ["myContext"],
      queryFn: () => getMyContext(),
    });
    const allowed = ctx.roles.some((r) => r === "owner" || r === "supervisor");
    if (!allowed) throw redirect({ to: "/app" });
    return ctx;
  },
  component: () => <Outlet />,
});
