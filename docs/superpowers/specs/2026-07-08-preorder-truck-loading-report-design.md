# Preorder Truck Loading Report — Design Spec

**Date:** 2026-07-08  
**Status:** Approved  
**Project:** Ruta Dulce (TanStack Start + Supabase)

---

## Overview

Add a "Truck Report" button to the preorders admin page (`/app/preorders`) that opens a preview modal showing a PDF of aggregated product totals for all confirmed preorders on the currently selected delivery date. The user can optionally toggle a customer-level breakdown and download the PDF for printing.

---

## Requirements

- **Trigger:** Button labeled "Truck Report" in the preorders page header, near the date filter
- **Date scope:** Uses the delivery date already selected in the page (today/tomorrow/custom)
- **Order filter:** Confirmed orders only (`status = 'confirmed'`)
- **Default view:** Product name, unit, total quantity needed
- **Optional breakdown:** Toggle to show per-customer quantity beneath each product row
- **Actions:** Preview in modal → Download PDF

---

## Architecture

### Data flow

No new server function is required. The preorders page already loads all orders for the selected date via `listOrdersForDate`. The confirmed orders data is passed directly to the report component.

**Client-side aggregation:**  
Filter orders where `status === 'confirmed'`, then reduce over all `items`, grouping by `product_id`:

```ts
type ProductTotal = {
  product_id: string
  product_name: string
  unit: string
  total_quantity: number
  customers: { name: string; quantity: number }[]
}
```

Results sorted alphabetically by `product_name`.

### PDF library

**`@react-pdf/renderer`** — renders PDF using React JSX components with a flexbox layout system. Loaded client-side only (dynamic import). The `<PDFViewer>` component is embedded directly in the dialog for in-browser preview.

---

## Components

### 1. `src/components/preorders/preorder-report-dialog.tsx`

**Responsibilities:**
- Receives the list of confirmed orders (already available in page state) and the branch name + delivery date as props
- Computes `ProductTotal[]` aggregation
- Renders a `Dialog` (full-screen on mobile, large on desktop)
- Contains a "Show customer breakdown" toggle switch
- Embeds `<PDFViewer>` mounting `<PreorderReportDocument>` with current toggle state
- Contains a `<PDFDownloadLink>` button ("Download PDF") that generates filename: `truck-report-YYYY-MM-DD.pdf`
- `PDFViewer` only mounts when dialog is open (lazy) to avoid blocking the main page

**Props:**
```ts
{
  open: boolean
  onOpenChange: (open: boolean) => void
  orders: OrderSummary[]  // listOrdersForDate return type
  branchName: string
  deliveryDate: string    // ISO date string
}
```

### 2. `src/components/preorders/preorder-report-document.tsx`

**Responsibilities:**
- Pure `@react-pdf/renderer` `<Document>` — no React hooks, no Supabase calls
- Accepts `productTotals: ProductTotal[]`, `branchName`, `deliveryDate`, `showBreakdown`, `orderCount`
- Renders the full PDF layout

**PDF layout:**

```
Header section:
  - Logo placeholder / "RUTA DULCE" text (left)
  - Branch name (right)
  - "Truck Loading Report" title
  - "Delivery date: [formatted date]"
  - "Generated: [time] · [N] confirmed orders"

Table:
  Columns: Product | Unit | Total Qty
  Row (normal): product name | unit | total_quantity
  Row (breakdown, when showBreakdown=true):
    indented customer row: "↳ [Customer Name]" | | quantity

Footer:
  "[N] orders · [M] products"
  Page number: "Page 1 of 1"
```

**Styling:** Uses `@react-pdf/renderer` StyleSheet with a clean print aesthetic — white background, black text, subtle gray header row, thin borders on the table.

---

## Preorders Page Changes (`src/routes/_authenticated/app/preorders.tsx`)

- Import `PreorderReportDialog` lazily with `React.lazy` / `Suspense`
- Add `reportOpen: boolean` state
- Add "Truck Report" button in the header bar (disabled when no confirmed orders exist)
- Pass `orders`, `branchName`, `deliveryDate` to `<PreorderReportDialog>`

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No confirmed orders for selected date | "Truck Report" button is disabled; tooltip: "No confirmed orders for this date" |
| `@react-pdf/renderer` loading | `PDFViewer` shows a loading spinner while the library initializes |
| Zero products in confirmed orders | Report renders with empty table and a note: "No products in confirmed orders" |

---

## Dependencies

| Package | Version | Notes |
|---------|---------|-------|
| `@react-pdf/renderer` | latest | New — client-side only, no SSR needed |

---

## Out of Scope

- Printing directly from the app (user prints from browser after downloading)
- Filtering by driver or route within the report
- Including prices/totals in the report (product count focus only)
- Server-side PDF generation
