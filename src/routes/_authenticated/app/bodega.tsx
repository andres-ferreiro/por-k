import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getMyContext } from "@/lib/api/context.functions";
import { getBranchBodegaContext } from "@/lib/api/bodega.functions";
import { useBranchScope } from "@/lib/branch-scope";
import { PageHeader } from "@/components/admin/data-table";
import { BodegaOrderForm } from "@/components/admin/bodega-order-form";
import { BodegaIncomingOrders } from "@/components/admin/bodega-incoming-orders";
import { BodegaCatalogTab } from "@/components/admin/bodega-catalog-tab";
import { BodegaInterOrderForm } from "@/components/admin/bodega-inter-order-form";
import { Package01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/app/bodega")({
  loader: async ({ context }) => {
    const ctx = await context.queryClient.fetchQuery({
      queryKey: ["myContext"],
      queryFn: () => getMyContext(),
    });
    const allowed = ctx.roles.some((r) => r === "owner" || r === "supervisor" || r === "cashier");
    if (!allowed) throw redirect({ to: "/app" });
    return ctx;
  },
  component: BodegaPage,
});

function BodegaPage() {
  const { branchId } = useBranchScope();
  const getContext = useServerFn(getBranchBodegaContext);
  const [tab, setTab] = useState("incoming");

  const ctxQ = useQuery({
    queryKey: ["bodegaContext", branchId],
    queryFn: () => getContext({ data: { branch_id: branchId } }),
    enabled: !!branchId,
  });

  if (!branchId) {
    return (
      <div className="space-y-4">
        <PageHeader title="Bodega" description="Pedidos de insumos entre sucursales." />
        <div className="rounded-lg border border-dashed p-8 text-center space-y-2">
          <p className="font-medium">Selecciona una sucursal</p>
          <p className="text-sm text-muted-foreground">
            Usa el selector de sucursal arriba para pedir insumos o ver pedidos entrantes.
          </p>
        </div>
      </div>
    );
  }

  if (ctxQ.isLoading) {
    return <p className="text-muted-foreground">Cargando…</p>;
  }

  const ctx = ctxQ.data;
  if (!ctx) return null;

  if (ctx.is_bodega) {
    const bodegaLabel = ctx.bodega_display_name?.trim() || ctx.branch_name;
    return (
      <div className="space-y-4">
        <PageHeader
          title={`Bodega — ${bodegaLabel}`}
          description="Gestiona pedidos entrantes, catálogo e intercambios con otras bodegas."
        />
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="incoming">Pedidos entrantes</TabsTrigger>
            <TabsTrigger value="catalog">Catálogo</TabsTrigger>
            {ctx.other_bodegas.length > 0 && (
              <TabsTrigger value="inter">Pedidos a otra bodega</TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="incoming" className="mt-4">
            <BodegaIncomingOrders bodegaId={ctx.branch_id} bodegaName={bodegaLabel} />
          </TabsContent>
          <TabsContent value="catalog" className="mt-4">
            <BodegaCatalogTab bodegaId={ctx.branch_id} bodegaName={bodegaLabel} />
          </TabsContent>
          {ctx.other_bodegas.length > 0 && (
            <TabsContent value="inter" className="mt-4">
              <BodegaInterOrderForm
                fromBodegaId={ctx.branch_id}
                fromBodegaName={bodegaLabel}
                targetBodegas={ctx.other_bodegas}
              />
            </TabsContent>
          )}
        </Tabs>
      </div>
    );
  }

  if (ctx.bodegas.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="Bodega" description="Pedidos de insumos entre sucursales." />
        <div className="rounded-lg border border-dashed p-8 text-center space-y-2">
          <Icon icon={Package01Icon} className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="font-medium">No hay sucursales bodega configuradas</p>
          <p className="text-sm text-muted-foreground">
            El propietario debe marcar al menos una sucursal como bodega en Sucursales.
          </p>
        </div>
      </div>
    );
  }

  return (
    <BodegaOrderForm
      bodegas={ctx.bodegas}
      branchName={ctx.branch_name}
    />
  );
}
