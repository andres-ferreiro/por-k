# Dashboard Redesign — Design Spec

**Date:** 2026-06-11  
**Status:** Approved

---

## Overview

Replace the single shared admin dashboard with four role-specific dashboards (owner, supervisor, cashier, driver). Each shows only the data relevant to that role, uses a unified period picker with % period-over-period comparison on all stat cards, and renders richer visualizations using Recharts for full-size charts and the existing Chart.js sparklines for inline mini-charts.

---

## Roles & Access

| Role | Dashboard location | Branch scope |
|---|---|---|
| `owner` | `/app` → `<OwnerDashboard>` | All company OR specific branch (via existing `BranchSwitcher`) |
| `supervisor` | `/app` → `<SupervisorDashboard>` | Their branch only (switcher hidden) |
| `cashier` | `/app` → `<CashierDashboard>` | Their branch only (switcher hidden) |
| `driver` | `/driver/overview` → enhanced | Their own data only |

The existing `useBranchScope` hook and `BranchSwitcher` component already handle scope. No changes needed there — just ensure the switcher renders only when `primaryRole === "owner"`.

---

## Shared Infrastructure

### 1. `PeriodPicker` component
**File:** `src/components/admin/period-picker.tsx`

Pill-style tab strip: **Día | Semana | Mes | Año | Personalizado**

- Week starts on Monday
- Custom shows a `FilterDateRangePicker` popover (component already exists in `data-table.tsx`)
- Exposes `{ currentRange: { from, to }, previousRange: { from, to }, label: string }`
- Default selection: **Día** (today)

### 2. `useDashboardPeriod` hook
**File:** `src/hooks/use-dashboard-period.ts`

```ts
type Period = "day" | "week" | "month" | "year" | "custom";
type DateRange = { from: string; to: string };
type UseDashboardPeriod = {
  period: Period;
  setPeriod: (p: Period) => void;
  currentRange: DateRange;
  previousRange: DateRange;
  customRange: DateRange | null;
  setCustomRange: (r: DateRange) => void;
};
```

Derives `previousRange` by shifting `currentRange` back by one period duration.

### 3. `DeltaBadge` component
**File:** `src/components/admin/delta-badge.tsx`

Accepts `current: number` and `previous: number`.  
Renders `+12%` in green or `−5%` in red. Hidden when previous is 0.  
Reused in all stat cards across all role dashboards.

### 4. Backend changes
**File:** `src/lib/api/admin.functions.ts`

**4a. Extend `getDashboardSummary`**  
Current signature: `{ date?: string, branch_id? }`  
New signature: `{ date_from: string, date_to: string, branch_id? }`

Replace single `date` with `date_from`/`date_to`. Update all internal queries:
- Dispatches/payments: `gte(startISO of date_from)` / `lt(endISO of date_to)`
- Deliveries: `gte("delivery_date", date_from)` / `lte("delivery_date", date_to)`
- Expenses: same date range

`reportSalesByDriver`, `reportSalesByProduct`, `reportSalesByCustomer` already accept `{ date_from, date_to }` — no changes needed.

**4b. New `getDailyTotals` function**  
Powers the sales trend line chart (owner & supervisor). Needed because no existing API returns day-by-day aggregated totals.

Input: `{ date_from, date_to, branch_id? }`  
Output: `Array<{ date: string; sold: number; collected: number; deliveries: number }>`

Implementation: query `deliveries` grouped by `delivery_date` in range, sum `delivery_items.line_total` minus returns, join with `payments` grouped by `paid_at::date`. Return one row per calendar day in the range (fill zeros for missing days).

**4c. Driver: extend `listTodayDeliveries`, `listTodayPayments`, `listTodayExpenses`**  
For the driver "Semana" view, these functions need optional `date_from`/`date_to` parameters (default: today). When a range is passed, aggregate the same data across the week. The driver overview calls these with the `currentRange` from the period hook.

### 5. Period-comparison pattern (all admin roles)

Each dashboard calls its data-fetching functions **twice in parallel**: once for `currentRange`, once for `previousRange`. The `DeltaBadge` on each stat card receives both values and computes the delta client-side. TanStack Query keys include both ranges so caching works correctly.

### 6. Chart library strategy

- **Recharts** (already installed, wrapped in `src/components/ui/chart.tsx`) — used for all new full-size charts (line, bar, stacked bar, donut/pie).
- **Chart.js / react-chartjs-2** — kept for existing `StatCardArea` and `StatCardBar` sparklines only.

---

## Owner Dashboard

**File:** `src/components/admin/owner-dashboard.tsx`  
**Route:** `/app/index.tsx` renders this when `primaryRole === "owner"`

### Header
- `PageHeader` with title "Inicio" + description
- Right side: `BranchSwitcher` (all company | branch) + `PeriodPicker`

### Row 1 — KPI stat cards (6 cards, responsive: 3-col on tablet, 6-col on desktop, 2-col on mobile)

| Card | Value | Sub | Delta |
|---|---|---|---|
| Ventas | `soldAmount` | units sold | vs previous period |
| Cobrado | `collectedTotal` | payment count | vs previous period |
| Neto en caja | `cashNet` | cash − expenses | vs previous period |
| Crédito / Pendiente | `pendingAmount + byMethod.credit` | por cobrar | vs previous period — highlight red if > 0 |
| Despachos | `dispatches.count` | units loaded | vs previous period |
| Entregas | `delivered/total` | pending · failed | vs previous period |

Each card uses the existing `StatCardSimple` extended with a `DeltaBadge` slot, or a new variant.

### Row 2 — Charts (2-col on desktop, stacked on mobile/tablet)

**Left: Sales trend (Recharts `LineChart`)**
- X axis: days (or weeks/months depending on period)
- Two lines: current period (solid primary color) + previous period (faint/muted, same color at 30% opacity)
- Data source: new `getDailyTotals` called twice (currentRange + previousRange)
- Tooltip shows both period values on hover

**Right: Driver performance (Recharts `BarChart`, horizontal)**
- One bar per driver, sorted descending by `sold`
- Data source: `reportSalesByDriver` for `currentRange`
- Shows `sold`, `collected`, `expenses` as stacked segments on each bar
- Legend at bottom

### Row 3 — Charts (2-col on desktop, stacked on mobile/tablet)

**Left: Top products (Recharts `BarChart`, vertical)**
- Top 8 products by net sales amount
- Data source: `reportSalesByProduct` for `currentRange`
- Bars show net revenue; tooltip shows units sold / returned

**Right: Payment methods (Recharts `PieChart` / donut)**
- Segments: Efectivo, Transferencia, Crédito, Otro
- Center label: total collected
- Data source: `payments.byMethod` from `getDashboardSummary`

### Row 4 — Driver status table

Reuses the existing driver list but as a proper `DataTableCard` with columns:

| Driver | Route (if available) | Entregas | Vendido | Cobrado | Pendiente | Failed |
|---|---|---|---|---|---|---|

- Source: `getDashboardSummary.drivers` + `reportSalesByDriver`
- Clicking a driver row links to `/app/deliveries?driver_id=...`
- No pagination needed (driver count is small)

---

## Supervisor Dashboard

**File:** `src/components/admin/supervisor-dashboard.tsx`  
**Route:** `/app/index.tsx` renders this when `primaryRole === "supervisor"`

### Header
- `PageHeader` title "Inicio" + description "Operaciones del período"
- Right: `PeriodPicker` (no branch switcher)

### Row 1 — KPI stat cards (5 cards, 3-col tablet / 5-col desktop / 2-col mobile)

| Card | Value | Delta |
|---|---|---|
| Entregas | `delivered/total` | vs previous period |
| Fallidas | `failed` count | vs previous period — highlight red if > 0 |
| Pendientes | `pending` count | highlight if > 0 |
| Ventas | `soldAmount` | vs previous period |
| Cobrado | `collectedTotal` | vs previous period |

### Row 2 — Charts (2-col desktop, stacked mobile)

**Left: Delivery outcomes by day (Recharts `BarChart` stacked)**
- X: dates in period, Y: count
- Stacked segments: Entregado (green), Fallido (red), Pendiente (yellow)
- Data source: `getDailyTotals` (uses the `deliveries` count field) — add `failed`/`pending` counts to the response

**Right: Driver completion bar (Recharts `BarChart` horizontal)**
- One bar per driver: delivered / assigned ratio
- Color: green above 80%, yellow 60–80%, red below 60%
- Data source: `reportSalesByDriver`

### Row 3 — Driver detail table

| Driver | Ruta | Entregadas | Vendido | Cobrado | Fallidas |
|---|---|---|---|---|---|

- Source: `reportSalesByDriver` for `currentRange`
- Clicking a row links to `/app/deliveries?driver_id=...`

---

## Cashier Dashboard

**File:** `src/components/admin/cashier-dashboard.tsx`  
**Route:** `/app/index.tsx` renders this when `primaryRole === "cashier"`

### Header
- `PageHeader` title "Inicio" + description "Operaciones del día"
- Right: `PeriodPicker` (defaults to Día; no branch switcher)

### Row 1 — KPI stat cards (4 cards, 2-col tablet / 4-col desktop / 2-col mobile)

| Card | Value | Sub | Delta |
|---|---|---|---|
| Despachos | count | units loaded | vs previous period |
| Cobrado | `collectedTotal` | cash + transfer | vs previous period |
| Pendiente / Crédito | `pendingAmount + credit` | por cobrar | highlight red if > 0 |
| Gastos | `expenseTotal` | record count | vs previous period |

### Row 2 — Payment breakdown

Horizontal segmented bar (existing CSS-bar pattern from driver overview, enhanced with % labels):
- Efectivo · Transferencia · Crédito · Otro
- Each segment shows amount + percentage of total

### Row 3 — Two compact tables (2-col desktop, stacked mobile)

**Left: Cobros pendientes**
- Columns: Cliente, Monto, Método, Ruta
- Source: `listPaymentsAdmin` filtered to `status=pending` for `currentRange`
- Max 10 rows; "Ver todos →" link to `/app/payments`

**Right: Despachos del período**
- Columns: Ruta, Chofer, Unidades, Estado
- Source: `listDispatchesToday` (or `listDeliveriesAdmin` grouped by route)
- Max 10 rows; "Ver todos →" link to `/app/deliveries`

---

## Driver Dashboard (enhanced)

**File:** `src/routes/_authenticated/driver/overview.tsx` — rewritten in place  
**Period:** Día | Semana (only these two make sense for a driver's route-day context)

### Header
- Period selector: **Día | Semana** (pill tabs, not the full PeriodPicker)
- No branch switcher

### Row 1 — 4-box stat grid (2×2, full-width on mobile)

| Box | Value |
|---|---|
| Vendido | gross sales amount |
| Devuelto | returns amount (from `delivery_returns`) |
| Gastos | expense total |
| **Saldo a liquidar** | `Vendido − Devuelto − Gastos` — highlighted, this is what driver hands back |

Each box shows `DeltaBadge` vs yesterday (Día mode) or same weekday last week (Semana mode).

### Row 2 — Delivery progress

Circular progress ring (CSS/SVG, no chart library needed) showing `delivered / total` with percentage in center. Below: `X entregadas · Y pendientes · Z fallidas`.

### Row 3 — Payment method bar

Existing horizontal CSS segmented bar (Efectivo / Transferencia / Crédito / Otro) — kept as-is, slightly enhanced with amount labels on each segment.

### Row 4 — Activity list

Existing delivery cards — kept as-is. Cards are tappable and reopen `DeliverySheet`.

---

## File Structure

```
src/
  components/
    admin/
      period-picker.tsx          (new)
      delta-badge.tsx            (new)
      owner-dashboard.tsx        (new)
      supervisor-dashboard.tsx   (new)
      cashier-dashboard.tsx      (new)
      stat-cards.tsx             (extend with DeltaBadge slot)
      data-table.tsx             (no changes)
  hooks/
    use-dashboard-period.ts      (new)
  lib/
    api/
      admin.functions.ts         (extend getDashboardSummary for date ranges)
  routes/
    _authenticated/
      app/
        index.tsx                (role-switch dispatcher, minimal changes)
      driver/
        overview.tsx             (rewritten)
```

---

## Mobile Layout

| Component | Mobile behavior |
|---|---|
| Owner KPI row | 2 cards per row |
| Owner charts | Full-width stacked |
| Owner driver table | Horizontal scroll |
| Supervisor KPI row | 2 cards per row |
| Supervisor charts | Full-width stacked |
| Cashier KPI row | 2 cards per row |
| Cashier tables | Full-width stacked |
| Driver overview | Native mobile layout, no changes needed |

All dashboards use Tailwind responsive prefixes (`sm:`, `md:`, `lg:`). No separate mobile components.

---

## Out of Scope

- No real-time auto-refresh (existing manual refetch on date change is sufficient)
- No export functionality on the dashboard (existing Reports page handles that)
- No goals/targets system (driver progress shows completeness, not a target %)
- No push notifications
