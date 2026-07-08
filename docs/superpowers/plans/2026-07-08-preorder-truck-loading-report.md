# Preorder Truck Loading Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Truck Report" button to the preorders admin page that opens a PDF preview modal showing aggregated product totals for all confirmed orders on the selected delivery date, with a toggleable customer breakdown and a download button.

**Architecture:** Client-side PDF generation using `@react-pdf/renderer`. The preorders page passes its already-loaded orders data to the report dialog — no new server functions. Aggregation (sum quantities by product across confirmed orders) happens in the dialog component before rendering the PDF document.

**Tech Stack:** TanStack Start (React 19, Vite 7), `@react-pdf/renderer` (new), Tailwind CSS 4, Radix UI Dialog, shadcn-style components.

## Global Constraints

- Spanish UI copy — all user-facing text in Spanish (e.g. "Reporte de carga", "Descargar PDF", "Desglose por cliente")
- Follow existing component patterns: `Dialog`, `Button`, `Switch` from `@/components/ui/*`
- Icons from `@hugeicons/core-free-icons` with the `<Icon>` wrapper
- `@react-pdf/renderer` must only run client-side — wrap PDFViewer in a `React.lazy` + `Suspense` to avoid SSR issues in TanStack Start/Nitro
- File paths use `@/` alias for `src/`
- No new server functions — reuse `ordersQ.data` already fetched in `PreordersPage`

---

## Task 1: Install `@react-pdf/renderer`

**Files:**
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install the package**

```bash
cd /Users/andy/Documents/Nettyo/ruta-dulce
npm install @react-pdf/renderer
```

Expected output: package added to `node_modules`, `package.json` updated with `"@react-pdf/renderer": "^x.x.x"`.

- [ ] **Step 2: Verify install**

```bash
node -e "require('@react-pdf/renderer'); console.log('ok')"
```

Expected: prints `ok` with no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @react-pdf/renderer for truck loading report"
```

---

## Task 2: Create the PDF document component

**Files:**
- Create: `src/components/preorders/preorder-report-document.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type ProductTotal = {
    product_id: string
    product_name: string
    unit: string
    total_quantity: number
    customers: { name: string; quantity: number }[]
  }

  export function PreorderReportDocument(props: {
    productTotals: ProductTotal[]
    branchName: string
    deliveryDate: string   // "YYYY-MM-DD"
    showBreakdown: boolean
    orderCount: number
  }): JSX.Element  // @react-pdf/renderer Document
  ```

- [ ] **Step 1: Create the file**

```tsx
// src/components/preorders/preorder-report-document.tsx
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

export type ProductTotal = {
  product_id: string;
  product_name: string;
  unit: string;
  total_quantity: number;
  customers: { name: string; quantity: number }[];
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    paddingTop: 32,
    paddingBottom: 40,
    paddingHorizontal: 36,
    color: "#111",
    backgroundColor: "#fff",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  brandText: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: "#111",
  },
  branchText: {
    fontSize: 10,
    color: "#555",
    textAlign: "right",
  },
  reportTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  metaText: {
    fontSize: 9,
    color: "#555",
    marginBottom: 16,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#d1d5db",
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  colProduct: { flex: 1 },
  colUnit: { width: 70, textAlign: "center" },
  colQty: { width: 60, textAlign: "right" },
  tableHeaderText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: "#374151",
    textTransform: "uppercase",
  },
  productRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  productRowText: {
    fontSize: 10,
  },
  productRowBold: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },
  customerRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 6,
    paddingLeft: 16,
    borderBottomWidth: 1,
    borderColor: "#f3f4f6",
    backgroundColor: "#fafafa",
  },
  customerRowText: {
    fontSize: 9,
    color: "#555",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#9ca3af",
    borderTopWidth: 1,
    borderColor: "#e5e7eb",
    paddingTop: 4,
  },
});

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  return `${d} de ${months[m - 1]} de ${y}`;
}

export function PreorderReportDocument({
  productTotals,
  branchName,
  deliveryDate,
  showBreakdown,
  orderCount,
}: {
  productTotals: ProductTotal[];
  branchName: string;
  deliveryDate: string;
  showBreakdown: boolean;
  orderCount: number;
}) {
  const now = new Date();
  const generated = now.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

  return (
    <Document title={`Reporte de carga — ${deliveryDate}`}>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.brandText}>RUTA DULCE</Text>
          <Text style={styles.branchText}>{branchName}</Text>
        </View>
        <Text style={styles.reportTitle}>Reporte de carga para camión</Text>
        <Text style={styles.metaText}>
          Fecha de entrega: {formatDate(deliveryDate)}{"   "}·{"   "}
          Generado: {generated}{"   "}·{"   "}
          {orderCount} pedido{orderCount !== 1 ? "s" : ""} confirmado{orderCount !== 1 ? "s" : ""}
        </Text>

        {/* Table header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.colProduct, styles.tableHeaderText]}>Producto</Text>
          <Text style={[styles.colUnit, styles.tableHeaderText]}>Unidad</Text>
          <Text style={[styles.colQty, styles.tableHeaderText]}>Total</Text>
        </View>

        {/* Rows */}
        {productTotals.length === 0 ? (
          <View style={styles.productRow}>
            <Text style={[styles.colProduct, styles.productRowText]}>
              Sin productos en pedidos confirmados
            </Text>
          </View>
        ) : (
          productTotals.map((p) => (
            <View key={p.product_id}>
              <View style={styles.productRow}>
                <Text style={[styles.colProduct, styles.productRowBold]}>{p.product_name}</Text>
                <Text style={[styles.colUnit, styles.productRowText]}>{p.unit}</Text>
                <Text style={[styles.colQty, styles.productRowBold]}>{p.total_quantity}</Text>
              </View>
              {showBreakdown &&
                p.customers.map((c) => (
                  <View key={c.name} style={styles.customerRow}>
                    <Text style={[styles.colProduct, styles.customerRowText]}>↳ {c.name}</Text>
                    <Text style={[styles.colUnit, styles.customerRowText]}></Text>
                    <Text style={[styles.colQty, styles.customerRowText]}>{c.quantity}</Text>
                  </View>
                ))}
            </View>
          ))
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>
            {orderCount} pedido{orderCount !== 1 ? "s" : ""}{"  "}·{"  "}
            {productTotals.length} producto{productTotals.length !== 1 ? "s" : ""}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/preorders/preorder-report-document.tsx
git commit -m "feat: add PreorderReportDocument PDF component"
```

---

## Task 3: Create the report dialog component

**Files:**
- Create: `src/components/preorders/preorder-report-dialog.tsx`

**Interfaces:**
- Consumes:
  - `ProductTotal` from `./preorder-report-document`
  - `PreorderReportDocument` (dynamically imported inside a lazy wrapper)
  - Order data shape from `listOrdersForDate`:
    ```ts
    type OrderSummary = {
      id: string
      customer_name: string
      status: string
      items: { product_id: string; product_name: string; unit: string; quantity: number }[]
    }
    ```
- Produces:
  ```ts
  export function PreorderReportDialog(props: {
    open: boolean
    onOpenChange: (open: boolean) => void
    orders: OrderSummary[]
    branchName: string
    deliveryDate: string
  }): JSX.Element
  ```

- [ ] **Step 1: Create the file**

```tsx
// src/components/preorders/preorder-report-dialog.tsx
import { useMemo, useState, Suspense, lazy } from "react";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { type ProductTotal, PreorderReportDocument } from "./preorder-report-document";

// Lazy-load PDFViewer to avoid SSR issues (TanStack Start / Nitro)
const PDFViewer = lazy(() =>
  import("@react-pdf/renderer").then((m) => ({ default: m.PDFViewer })),
);

type OrderSummary = {
  id: string;
  customer_name: string;
  status: string;
  items: {
    product_id: string;
    product_name: string;
    unit: string;
    quantity: number;
  }[];
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

  const productTotals = useMemo(
    () => aggregateProductTotals(orders),
    [orders],
  );

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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/preorders/preorder-report-dialog.tsx
git commit -m "feat: add PreorderReportDialog with PDF preview and download"
```

---

## Task 4: Wire the button into the preorders page

**Files:**
- Modify: `src/routes/_authenticated/app/preorders.tsx`

**Interfaces:**
- Consumes:
  - `PreorderReportDialog` from `@/components/preorders/preorder-report-dialog`
  - `routeInfoQ.data.route?.name` for `branchName` (use route name as fallback; branch name not currently in routeInfoQ but route name is the best available label)
  - `ordersQ.data` for orders
  - `deliveryDate` state already present
  - Existing `Truck01Icon` or `FileDownload01Icon` from `@hugeicons/core-free-icons` — use `FileDownload01Icon` if available, otherwise `Package01Icon`

**Changes needed:**

1. Add import for `PreorderReportDialog` and the icon
2. Add `reportOpen` boolean state
3. Add "Reporte" button in the date-filter row (after the date input), disabled when no confirmed orders
4. Render `<PreorderReportDialog>` below `<OrderDialog>`

- [ ] **Step 1: Add import for PreorderReportDialog**

In `src/routes/_authenticated/app/preorders.tsx`, add after the existing imports:

```tsx
import { PreorderReportDialog } from "@/components/preorders/preorder-report-dialog";
```

- [ ] **Step 2: Add the icon import**

In the existing hugeicons import line, add `FileDownload01Icon` (or if unavailable, use `Package01Icon` already imported):

```tsx
import { Add01Icon, Cancel01Icon, Edit01Icon, FileDownload01Icon, Package01Icon, Search01Icon } from "@hugeicons/core-free-icons";
```

- [ ] **Step 3: Add reportOpen state in PreordersPage**

After the existing `const [orderFor, setOrderFor] = useState(...)` line:

```tsx
const [reportOpen, setReportOpen] = useState(false);
```

- [ ] **Step 4: Compute confirmedCount for the button disabled state**

After the `stats` useMemo, add:

```tsx
const confirmedCount = useMemo(
  () => (ordersQ.data ?? []).filter((o) => o.status === "confirmed").length,
  [ordersQ.data],
);
```

- [ ] **Step 5: Add the button to the date-filter row**

The current date-filter row is:
```tsx
<div className="flex flex-wrap gap-2">
  <Button variant={deliveryDate === today ? "default" : "outline"} ...>Hoy</Button>
  <Button variant={deliveryDate === tomorrow ? "default" : "outline"} ...>Mañana</Button>
  <Input type="date" ... />
</div>
```

Replace it with (adding the report button at the end with a `ml-auto` spacer):
```tsx
<div className="flex flex-wrap gap-2 items-center">
  <Button
    variant={deliveryDate === today ? "default" : "outline"}
    size="sm"
    onClick={() => setDeliveryDate(today)}
  >
    Hoy
  </Button>
  <Button
    variant={deliveryDate === tomorrow ? "default" : "outline"}
    size="sm"
    onClick={() => setDeliveryDate(tomorrow)}
  >
    Mañana
  </Button>
  <Input
    type="date"
    value={deliveryDate}
    onChange={(e) => setDeliveryDate(e.target.value)}
    className="w-auto"
  />
  <Button
    variant="outline"
    size="sm"
    className="ml-auto"
    onClick={() => setReportOpen(true)}
    disabled={confirmedCount === 0}
    title={confirmedCount === 0 ? "Sin pedidos confirmados para esta fecha" : undefined}
  >
    <Icon icon={FileDownload01Icon} className="h-4 w-4 mr-1" />
    Reporte
  </Button>
</div>
```

- [ ] **Step 6: Render PreorderReportDialog after OrderDialog**

After the closing `/>` of `<OrderDialog .../>`:

```tsx
<PreorderReportDialog
  open={reportOpen}
  onOpenChange={setReportOpen}
  orders={ordersQ.data ?? []}
  branchName={routeInfoQ.data?.route?.name ?? "Sucursal"}
  deliveryDate={deliveryDate}
/>
```

- [ ] **Step 7: Check for linter errors**

Run TypeScript check:
```bash
cd /Users/andy/Documents/Nettyo/ruta-dulce
npx tsc --noEmit 2>&1 | head -30
```

Fix any type errors (most likely: `FileDownload01Icon` not in hugeicons free tier — if so, use `Package01Icon` instead).

- [ ] **Step 8: Commit**

```bash
git add src/routes/_authenticated/app/preorders.tsx
git commit -m "feat: add truck loading report button to preorders page"
```

---

## Task 5: Verify the build compiles

**Files:** None modified — verification only.

- [ ] **Step 1: Run build**

```bash
cd /Users/andy/Documents/Nettyo/ruta-dulce
npm run build 2>&1 | tail -20
```

Expected: build completes without errors. If `@react-pdf/renderer` causes SSR-related build errors (e.g. `window is not defined`), add a Vite SSR exclude:

In `vite.config.ts` (or `app.config.ts` / wherever Vite is configured), add:

```ts
ssr: {
  noExternal: [],
  external: ["@react-pdf/renderer"],
}
```

If that config file doesn't exist as `vite.config.ts`, check `app.config.ts`:

```ts
// In the vinxi/nitro config, add to the server config:
server: {
  experimental: {
    asyncContext: true,
  },
  // ... existing config
}
// AND in vite plugins section:
optimizeDeps: {
  exclude: ["@react-pdf/renderer"],
},
ssr: {
  external: ["@react-pdf/renderer"],
},
```

- [ ] **Step 2: Commit if config changes were needed**

```bash
git add app.config.ts  # or vite.config.ts
git commit -m "chore: exclude @react-pdf/renderer from SSR bundle"
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Uses currently selected delivery date
- ✅ Confirmed orders only (filter in `aggregateProductTotals` and `confirmedCount`)
- ✅ Product name + total quantity as default
- ✅ Toggleable customer breakdown (`showBreakdown` switch)
- ✅ Button → preview modal → download PDF
- ✅ Button disabled when no confirmed orders
- ✅ `@react-pdf/renderer` lazy-loaded (PDFViewer in Suspense)
- ✅ Spanish UI copy throughout
- ✅ Two new focused files, minimal change to page

**Type consistency check:**
- `ProductTotal` defined in `preorder-report-document.tsx`, re-exported and consumed by `preorder-report-dialog.tsx` ✅
- `OrderSummary` is an inline type in the dialog matching `listOrdersForDate` return shape ✅
- `ordersQ.data ?? []` typed correctly as the `listOrdersForDate` return type which includes all needed fields ✅
