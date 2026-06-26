import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AppRole = "owner" | "supervisor" | "cashier" | "driver" | "transfer_driver";

export interface MyContext {
  userId: string;
  email: string | null;
  fullName: string | null;
  branchId: string | null;
  branchName: string | null;
  roles: AppRole[];
  primaryRole: AppRole | null;
}

export const getMyContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyContext> => {
    const { supabase, userId, claims } = context;

    const [{ data: profile }, { data: rolesData }] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, branch_id, branches(name)")
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);

    const roles = (rolesData ?? []).map((r) => r.role as AppRole);
    const order: AppRole[] = ["owner", "supervisor", "cashier", "driver", "transfer_driver"];
    const primaryRole = order.find((r) => roles.includes(r)) ?? null;

    return {
      userId,
      email: (claims.email as string | undefined) ?? null,
      fullName: profile?.full_name ?? null,
      branchId: profile?.branch_id ?? null,
      branchName: (profile as any)?.branches?.name ?? null,
      roles,
      primaryRole,
    };
  });
