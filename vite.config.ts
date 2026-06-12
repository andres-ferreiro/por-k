// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import path from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    resolve: {
      alias: {
        "node:async_hooks": path.resolve("./src/lib/async-hooks-shim.ts"),
      },
    },
    optimizeDeps: {
      exclude: ["@tanstack/react-start"],
      include: [
        "@radix-ui/react-dialog",
        "@radix-ui/react-label",
        "@radix-ui/react-select",
        "@radix-ui/react-separator",
        "@radix-ui/react-slot",
        "@radix-ui/react-switch",
        "@radix-ui/react-tooltip",
        "@tanstack/history",
        "@tanstack/react-query",
        "@tanstack/react-router",
        "@tanstack/router-core",
        "@tanstack/router-core/ssr/client",
        "@tanstack/router-core/ssr/server",
        "@supabase/supabase-js",
        "class-variance-authority",
        "clsx",
        "h3-v2",
        "@hugeicons/react",
        "@hugeicons/core-free-icons",
        "seroval",
        "sonner",
        "tailwind-merge",
        "zod",
      ],
    },
  },
});
