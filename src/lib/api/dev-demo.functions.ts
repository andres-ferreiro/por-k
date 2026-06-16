import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  clearDevDemoData,
  getDevDemoStatus,
  seedDevDemoData,
} from "@/lib/dev-demo";

function assertDevEnvironment() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Los datos de demostración solo están disponibles en desarrollo.");
  }
}

async function requireOwner(supabase: { from: (t: string) => any }, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "owner")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Solo el propietario puede usar datos de demostración.");
}

async function resolveDemoBranchId(
  supabase: { from: (t: string) => any },
  inputBranchId: string | null | undefined,
): Promise<string> {
  if (inputBranchId) return inputBranchId;

  const { data: branches, error } = await supabase
    .from("branches")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(error.message);
  const branchId = branches?.[0]?.id as string | undefined;
  if (!branchId) {
    throw new Error("Selecciona una sucursal o crea al menos una sucursal.");
  }
  return branchId;
}

export const getDevDemoStatusFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertDevEnvironment();
    await requireOwner(context.supabase, context.userId);
    return getDevDemoStatus(context.supabase);
  });

export const seedDevDemoDataFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ branch_id: z.string().uuid().nullable().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    assertDevEnvironment();
    await requireOwner(context.supabase, context.userId);
    const branchId = await resolveDemoBranchId(context.supabase, data.branch_id);
    return seedDevDemoData(context.supabase, branchId, context.userId);
  });

export const clearDevDemoDataFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertDevEnvironment();
    await requireOwner(context.supabase, context.userId);
    return clearDevDemoData(context.supabase);
  });
