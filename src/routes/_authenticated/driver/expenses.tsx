import { Add01Icon, Delete02Icon, Loading03Icon, ReceiptTextIcon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listTodayExpenses, deleteExpense, getPhotoViewUrls } from "@/lib/api/driver.functions";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/admin/data-table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExpenseSheet } from "@/components/driver/expense-sheet";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/driver/expenses")({
  component: Page,
});

function Page() {
  const fetcher = useServerFn(listTodayExpenses);
  const del = useServerFn(deleteExpense);
  const viewUrls = useServerFn(getPhotoViewUrls);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["driver", "expensesToday"],
    queryFn: () => fetcher({ data: {} }),
  });

  useEffect(() => {
    const paths = (data ?? []).map((r) => r.photo_url).filter(Boolean) as string[];
    if (paths.length === 0) return;
    viewUrls({ data: { bucket: "expense-photos", paths } })
      .then((m) => setThumbs(m))
      .catch(() => {});
  }, [data, viewUrls]);

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Gasto eliminado.");
      qc.invalidateQueries({ queryKey: ["driver"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo eliminar."),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Icon icon={Loading03Icon} className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const rows = data ?? [];
  const pagination = usePagination(rows);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const fmt = (n: number) =>
    n.toLocaleString("es", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });

  return (
    <div className="space-y-4 pb-4">
      <h1>Gastos de hoy</h1>

      {/* Total card */}
      <Card className="border-0 bg-primary text-primary-foreground">
        <CardContent className="py-5 px-5">
          <div className="text-xs text-primary-foreground/70 uppercase tracking-wide font-medium">Total del día</div>
          <div className="text-4xl font-bold tabular-nums mt-1">{fmt(total)}</div>
          {rows.length > 0 && (
            <div className="text-xs text-primary-foreground/60 mt-1">
              {rows.length} gasto{rows.length !== 1 ? "s" : ""} registrado{rows.length !== 1 ? "s" : ""}
            </div>
          )}
        </CardContent>
      </Card>

      {/* List */}
      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center space-y-2">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto">
              <Icon icon={ReceiptTextIcon} className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-medium text-sm">Sin gastos registrados</p>
            <p className="text-xs text-muted-foreground">Toca el botón + para agregar un gasto.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {pagination.paginatedItems.map((r) => (
            <Card key={r.id} className="overflow-hidden">
              <CardContent className="py-0 px-0 flex items-stretch">
                {/* Thumbnail */}
                {r.photo_url && thumbs[r.photo_url] ? (
                  <img
                    src={thumbs[r.photo_url]}
                    className="h-16 w-16 object-cover shrink-0"
                    alt=""
                  />
                ) : (
                  <div className="h-16 w-16 bg-muted flex items-center justify-center shrink-0">
                    <Icon icon={ReceiptTextIcon} className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0 px-3 flex items-center">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-sm">{r.description}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleTimeString("es-MX", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "America/Ciudad_Juarez",
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="font-bold tabular-nums text-sm">{fmt(r.amount)}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => delMut.mutate(r.id)}
                      disabled={delMut.isPending}
                    >
                      <Icon icon={Delete02Icon} className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {rows.length > pagination.pageSize && (
        <TablePagination {...pagination.controls} className="border rounded-lg bg-card" />
      )}

      {/* FAB */}
      <Button
        className="fixed right-4 z-20 h-14 w-14 rounded-full shadow-lg bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))]"
        onClick={() => setOpen(true)}
        size="icon"
      >
        <Icon icon={Add01Icon} className="h-6 w-6" />
      </Button>

      <ExpenseSheet open={open} onOpenChange={setOpen} />
    </div>
  );
}
