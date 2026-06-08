import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listTodayExpenses, deleteExpense, getPhotoViewUrls } from "@/lib/api/driver.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Loader2, Receipt } from "lucide-react";
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
    queryFn: () => fetcher(),
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
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const rows = data ?? [];
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const fmt = (n: number) =>
    n.toLocaleString("es", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });

  return (
    <div className="space-y-4 pb-4">
      <h1 className="text-2xl font-bold">Gastos de hoy</h1>

      <Card>
        <CardContent className="py-4">
          <div className="text-xs text-muted-foreground">Total del día</div>
          <div className="text-3xl font-bold">{fmt(total)}</div>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          <Receipt className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Aún no registras gastos hoy.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardContent className="py-3 flex items-center gap-3">
                {r.photo_url && thumbs[r.photo_url] ? (
                  <img src={thumbs[r.photo_url]} className="h-12 w-12 rounded object-cover border" alt="" />
                ) : (
                  <div className="h-12 w-12 rounded bg-muted flex items-center justify-center">
                    <Receipt className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{r.description}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                <div className="font-semibold">{fmt(r.amount)}</div>
                <Button size="icon" variant="ghost" onClick={() => delMut.mutate(r.id)} disabled={delMut.isPending}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Button
        className="fixed bottom-20 right-4 h-14 w-14 rounded-full shadow-lg z-20"
        onClick={() => setOpen(true)}
        size="icon"
      >
        <Plus className="h-6 w-6" />
      </Button>

      <ExpenseSheet open={open} onOpenChange={setOpen} />
    </div>
  );
}
