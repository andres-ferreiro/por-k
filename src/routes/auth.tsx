import { ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bootstrapStatus, bootstrapOwner } from "@/lib/api/bootstrap.functions";
import { BrandLogo } from "@/components/brand-logo";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/brand";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/post-login" });
  },
  component: AuthPage,
});

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E\")";

function AuthPage() {
  const status = useServerFn(bootstrapStatus);
  const { data: bs } = useQuery({ queryKey: ["bootstrap"], queryFn: () => status() });

  const isBootstrap = bs?.needsBootstrap;
  const subtitle = isBootstrap
    ? "Crea la cuenta del propietario para comenzar"
    : "Inicia sesión con tu cuenta";

  return (
    <>
      {/* ── Mobile layout (< md) ── */}
      <div
        className="md:hidden min-h-svh flex flex-col"
        style={{ background: "linear-gradient(160deg, #1E2D47 0%, #0a4a52 100%)" }}
      >
        {/* Grain overlay */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{ backgroundImage: GRAIN, backgroundSize: "200px 200px", opacity: 0.035 }}
        />

        {/* Brand section */}
        <div className="relative flex-1 flex flex-col items-center justify-center px-6 pt-safe pb-6 animate-auth-brand">
          <BrandLogo size="lg" className="mb-4 drop-shadow-lg" />
          <h1 className="text-white text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
          <p className="mt-1 text-white/50 text-xs tracking-widest uppercase">
            {APP_DESCRIPTION.split("—")[0].trim()}
          </p>
        </div>

        {/* Sliding form panel */}
        <div className="relative animate-auth-panel rounded-t-[2rem] bg-white shadow-2xl">
          <div className="px-7 pt-7 pb-4">
            <h2 className="text-base font-semibold text-foreground">
              {isBootstrap ? "Crear propietario" : "Bienvenido"}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <div className="px-7 pb-safe">
            {isBootstrap ? <BootstrapForm /> : <LoginForm />}
          </div>
          {/* Bottom notch fill */}
          <div className="h-[env(safe-area-inset-bottom,0px)] bg-white" />
        </div>
      </div>

      {/* ── Desktop layout (≥ md) ── */}
      <div className="hidden md:flex min-h-screen items-center justify-center bg-muted/40 p-4">
        <div className="w-full max-w-sm">
          {/* Logo + name above card */}
          <div className="mb-6 flex flex-col items-center gap-2 animate-auth-brand">
            <BrandLogo size="lg" />
            <h1 className="text-lg font-semibold tracking-tight text-foreground">{APP_NAME}</h1>
          </div>

          <div className="rounded-2xl border border-border bg-card shadow-sm animate-auth-panel">
            <div className="px-7 pt-7 pb-2">
              <h2 className="text-sm font-semibold text-foreground">
                {isBootstrap ? "Crear propietario" : "Iniciar sesión"}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
            </div>
            <div className="px-7 pb-7 pt-4">
              {isBootstrap ? <BootstrapForm /> : <LoginForm />}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
        tabIndex={-1}
        aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
      >
        {show ? (
          <Icon icon={ViewOffIcon} className="h-4 w-4" />
        ) : (
          <Icon icon={ViewIcon} className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

function LoginForm() {
  const navigate = useNavigate();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await router.invalidate();
    navigate({ to: "/post-login" });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Correo</Label>
        <Input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          inputMode="email"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <PasswordInput
          id="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
      </div>
      <Button type="submit" className="w-full mt-2" disabled={loading}>
        {loading ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}

function BootstrapForm() {
  const fn = useServerFn(bootstrapOwner);
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fn({ data: { full_name: fullName, email, password } });
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Cuenta creada");
      navigate({ to: "/post-login" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Nombre completo</Label>
        <Input
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="name"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Correo</Label>
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          inputMode="email"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Contraseña</Label>
        <PasswordInput
          value={password}
          onChange={setPassword}
          placeholder="Mínimo 6 caracteres"
          autoComplete="new-password"
        />
      </div>
      <Button type="submit" className="w-full mt-2" disabled={loading}>
        {loading ? "Creando…" : "Crear propietario"}
      </Button>
    </form>
  );
}
