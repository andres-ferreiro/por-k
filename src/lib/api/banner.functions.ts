import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Only this account can edit the banner. Compared against the verified JWT claim. */
const BANNER_EDITOR_EMAIL = "nettyo.solutions@gmail.com";

function canEditBanner(claims: { email?: unknown }): boolean {
  return typeof claims.email === "string" && claims.email.toLowerCase() === BANNER_EDITOR_EMAIL;
}

export type AppBanner = {
  message: string;
  is_active: boolean;
  can_edit: boolean;
};

export const getAppBanner = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AppBanner> => {
    const can_edit = canEditBanner(context.claims);
    // Table is created by a migration; never let a missing table or read error break the shell.
    const { data, error } = await (context.supabase as any)
      .from("app_banner")
      .select("message, is_active")
      .maybeSingle();
    if (error || !data) return { message: "", is_active: false, can_edit };
    return {
      message: (data.message as string) ?? "",
      is_active: Boolean(data.is_active),
      can_edit,
    };
  });

export const setAppBanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        message: z.string().trim().max(300),
        is_active: z.boolean(),
      })
      .refine((v) => !v.is_active || v.message.length > 0, {
        message: "Escribe un mensaje para mostrar el aviso.",
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!canEditBanner(context.claims)) {
      throw new Error("No tienes permiso para editar el aviso.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("app_banner").upsert({
      id: true,
      message: data.message,
      is_active: data.is_active,
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
