import { useMemo, useState, Suspense, lazy } from "react";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { type ProductTotal, PreorderReportDocument } from "./preorder-report-document";

// Lazy-load PDFViewer to avoid SSR issues in TanStack Start / Nitro
const PDFViewer = lazy(() =>
  import("@react-pdf/renderer").then((m) => ({ default: m.PDFViewer })),
);

type OrderItem = {
  product_id: string;
  product_name: string;
  unit: string;
  quantity: number;
};

type OrderSummary = {
  id: string;
  customer_name: string;
  status: string;
  items: OrderItem[];
};

function aggregateProductTotals(orders: OrderSummary[]): ProductTotal[] {
  const confirmed = orders.filter((o) => o.status === "confirmed");
  const map = new Map<string, ProductTotal>();

  for (const order of confirmed) {
    for (const item of order.items) {
      if (item.quantity <= 0) continue;
      const existing = map.get(item.product_id);
      if (existing) {
        existing.total_quantity += item.quantity;
        const cIdx = existing.customers.findIndex((c) => c.name === order.customer_name);
        if (cIdx >= 0) {
          existing.customers[cIdx].quantity += item.quantity;
        } else {
          existing.customers.push({ name: order.customer_name, quantity: item.quantity });
        }
      } else {
        map.set(item.product_id, {
          product_id: item.product_id,
          product_name: item.product_name,
          unit: item.unit,
          total_quantity: item.quantity,
          customers: [{ name: order.customer_name, quantity: item.quantity }],
        });
      }
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.product_name.localeCompare(b.product_name, "es"),
  );
}

export function PreorderReportDialog({
  open,
  onOpenChange,
  orders,
  branchName,
  deliveryDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: OrderSummary[];
  branchName: string;
  deliveryDate: string;
}) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  const confirmedOrders = useMemo(
    () => orders.filter((o) => o.status === "confirmed"),
    [orders],
  );

  const productTotals = useMemo(() => aggregateProductTotals(orders), [orders]);

  const doc = (
    <PreorderReportDocument
      productTotals={productTotals}
      branchName={branchName}
      deliveryDate={deliveryDate}
      showBreakdown={showBreakdown}
      orderCount={confirmedOrders.length}
    />
  );

  const filename = `reporte-carga-${deliveryDate}.pdf`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <DialogTitle>Reporte de carga — {deliveryDate}</DialogTitle>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Switch
                  id="breakdown-toggle"
                  checked={showBreakdown}
                  onCheckedChange={setShowBreakdown}
                />
                <Label htmlFor="breakdown-toggle" className="text-sm cursor-pointer">
                  Desglose por cliente
                </Label>
              </div>
              <PDFDownloadLink document={doc} fileName={filename}>
                {({ loading }) => (
                  <Button size="sm" disabled={loading}>
                    {loading ? "Generando…" : "Descargar PDF"}
                  </Button>
                )}
              </PDFDownloadLink>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 bg-gray-100">
          {open && (
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  Cargando vista previa…
                </div>
              }
            >
              <PDFViewer width="100%" height="100%" showToolbar={false}>
                {doc}
              </PDFViewer>
            </Suspense>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
