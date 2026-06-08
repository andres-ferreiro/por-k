import { createFileRoute, redirect } from "@tanstack/react-router";
import { getMyContext } from "@/lib/api/context.functions";

export const Route = createFileRoute("/_authenticated/post-login")({
  loader: async () => {
    const ctx = await getMyContext();
    if (ctx.primaryRole === "driver") throw redirect({ to: "/driver" });
    throw redirect({ to: "/app" });
  },
  component: () => null,
});
