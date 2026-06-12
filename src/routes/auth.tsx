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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { bootstrapStatus, bootstrapOwner } from "@/lib/api/bootstrap.functions";
import { toast } from "sonner";


export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/post-login" });
  },
  component: AuthPage,
});

function AuthPage() {
  const status = useServerFn(bootstrapStatus);
  const { data: bs } = useQuery({ queryKey: ["bootstrap"], queryFn: () => status() });

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 h-12 w-12 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold">P</div>
          <CardTitle>Panadería Ops</CardTitle>
          <CardDescription>
            {bs?.needsBootstrap ? "Crea la cuenta del propietario para empezar" : "Inicia sesión con tu cuenta"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {bs?.needsBootstrap ? <BootstrapForm /> : <LoginForm />}
        </CardContent>
      </Card>
    </div>
  );
}

function PasswordInput({ id, value, onChange, autoComplete, placeholder }: {
  id?: string; value: string; onChange: (v: string) => void;
  autoComplete?: string; placeholder?: string;
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
      >
        {show ? <Icon icon={ViewOffIcon} className="h-4 w-4" /> : <Icon icon={ViewIcon} className="h-4 w-4" />}
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
    if (error) { toast.error(error.message); return; }
    await router.invalidate();
    navigate({ to: "/post-login" });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Correo</Label>
        <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="current-password" />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "Entrando…" : "Entrar"}</Button>
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
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Nombre completo</Label>
        <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Correo</Label>
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Contraseña</Label>
        <PasswordInput value={password} onChange={setPassword} placeholder="Mínimo 6 caracteres" autoComplete="new-password" />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "Creando…" : "Crear propietario"}</Button>
    </form>
  );
}
