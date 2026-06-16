# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single admin dashboard with four role-specific dashboards (owner, supervisor, cashier, driver) each with a period picker, period-over-period % deltas on stat cards, and richer charts.

**Architecture:** `/app/index.tsx` reads `primaryRole` from the TanStack Query cache (`["myContext"]`) and renders the appropriate role component. Each role component is a self-contained file that fetches only the data it needs, using the shared `useDashboardPeriod` hook for period state. Recharts (already installed) powers full-size charts; existing Chart.js sparklines in `stat-cards.tsx` are kept.

**Tech Stack:** TanStack Start, TanStack Query, Recharts, Zod, Tailwind CSS, shadcn/ui chart wrapper (`src/components/ui/chart.tsx`), existing `stat-cards.tsx` sparklines.

**Spec:** `docs/superpowers/specs/2026-06-11-dashboard-redesign-design.md`

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `src/lib/api/admin.functions.ts` | Extend `getDashboardSummary` to date ranges; add `getDailyTotals` |
| Modify | `src/lib/api/driver.functions.ts` | Extend `listTodayDeliveries`, `listTodayPayments`, `listTodayExpenses` to accept optional date range |
| Create | `src/hooks/use-dashboard-period.ts` | Period state: currentRange, previousRange, setPeriod |
| Create | `src/components/admin/period-picker.tsx` | Día/Semana/Mes/Año/Personalizado pill tabs |
| Create | `src/components/admin/delta-badge.tsx` | `+12%` / `−5%` badge for stat cards |
| Create | `src/components/admin/owner-dashboard.tsx` | Owner-specific layout: 6 KPIs, 4 charts, driver table |
| Create | `src/components/admin/supervisor-dashboard.tsx` | Supervisor layout: 5 KPIs, 2 charts, driver table |
| Create | `src/components/admin/cashier-dashboard.tsx` | Cashier layout: 4 KPIs, payment bar, 2 tables |
| Modify | `src/routes/_authenticated/app/index.tsx` | Role dispatcher — reads `primaryRole`, renders role component |
| Modify | `src/routes/_authenticated/driver/overview.tsx` | New 4-box layout: Vendido/Devuelto/Gastos/Saldo + ring progress |

---

## Task 1: Extend `getDashboardSummary` + add `getDailyTotals`

**Files:**
- Modify: `src/lib/api/admin.functions.ts`

- [ ] **Step 1: Change `getDashboardSummary` input schema from single `date` to `date_from` / `date_to`**

Replace the existing `getDashboardSummary` function (lines 22–163) with this updated version. Key changes: input schema uses `date_from`/`date_to`, dispatches/payments use the full range, deliveries use `.gte`/`.lte` on `delivery_date`.

```ts
export const getDashboardSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      date_from: dateStr,
      date_to: dateStr,
      branch_id: branchIdField,
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { startISO } = tzDayRange(data.date_from);
    const { endISO } = tzDayRange(data.date_to);
    const bid = data.branch_id ?? null;

    let dq = supabase
      .from("dispatches")
      .select("id, driver_id, dispatch_items(quantity)")
      .gte("dispatched_at", startISO)
      .lt("dispatched_at", endISO);
    if (bid) dq = dq.eq("branch_id", bid);

    let delq = supabase
      .from("deliveries")
      .select(
        "id, status, driver_id, delivery_items(product_id, quantity, unit_price, line_total), delivery_returns(product_id, quantity)",
      )
      .gte("delivery_date", data.date_from)
      .lte("delivery_date", data.date_to);
    if (bid) delq = delq.eq("branch_id", bid);

    let pq = supabase
      .from("payments")
      .select("id, amount, method, status, driver_id, delivery_id")
      .gte("paid_at", startISO)
      .lt("paid_at", endISO);
    if (bid) pq = pq.eq("branch_id", bid);

    let eq = supabase
      .from("expenses")
      .select("id, amount, driver_id")
      .gte("expense_date", data.date_from)
      .lte("expense_date", data.date_to);
    if (bid) eq = eq.eq("branch_id", bid);

    const [dispatchesRes, deliveriesRes, paymentsRes, expensesRes] = await Promise.all([
      dq, delq, pq, eq,
    ]);

    for (const r of [dispatchesRes, deliveriesRes, paymentsRes, expensesRes]) {
      if (r.error) throw new Error(r.error.message);
    }

    const dispatches = dispatchesRes.data ?? [];
    const deliveries = deliveriesRes.data ?? [];
    const payments = paymentsRes.data ?? [];
    const expenses = expensesRes.data ?? [];

    const dispatchUnits = dispatches.reduce(
      (a: number, d: any) =>
        a + (d.dispatch_items ?? []).reduce((x: number, i: any) => x + Number(i.quantity ?? 0), 0),
      0,
    );

    const delivered = deliveries.filter((d: any) => d.status === "delivered");
    const pendingDel = deliveries.filter((d: any) => d.status === "pending").length;
    const failedDel = deliveries.filter((d: any) => d.status === "failed").length;

    let soldUnits = 0;
    let soldAmount = 0;
    const deliveryNetById = new Map<string, number>();
    for (const d of delivered) {
      const totals = deliveryNetTotals(
        (d as any).delivery_items ?? [],
        (d as any).delivery_returns ?? [],
      );
      soldUnits += totals.netUnits;
      soldAmount += totals.netAmount;
      deliveryNetById.set((d as any).id, totals.netAmount);
    }

    const paymentAmount = (p: any) =>
      p.delivery_id && deliveryNetById.has(p.delivery_id)
        ? deliveryNetById.get(p.delivery_id)!
        : Number(p.amount ?? 0);

    const paid = payments.filter((p: any) => p.status === "paid");
    const collectedTotal = paid.reduce((a: number, p: any) => a + paymentAmount(p), 0);
    const byMethod: Record<string, number> = { cash: 0, transfer: 0, credit: 0, other: 0 };
    for (const p of paid) byMethod[p.method] = (byMethod[p.method] ?? 0) + paymentAmount(p);
    const pendingAmount = payments
      .filter((p: any) => p.status === "pending")
      .reduce((a: number, p: any) => a + paymentAmount(p), 0);

    const expenseTotal = expenses.reduce((a: number, e: any) => a + Number(e.amount ?? 0), 0);
    const cashNet = (byMethod.cash ?? 0) - expenseTotal;

    const driverIds = new Set<string>();
    for (const x of [...dispatches, ...deliveries, ...payments, ...expenses]) driverIds.add((x as any).driver_id);
    const names = await fetchProfileNames(Array.from(driverIds));

    const perDriver = new Map<string, { id: string; name: string | null; sold: number; collected: number; pending: number; failed: number }>();
    const ensure = (id: string) => {
      let v = perDriver.get(id);
      if (!v) {
        v = { id, name: names.get(id) ?? null, sold: 0, collected: 0, pending: 0, failed: 0 };
        perDriver.set(id, v);
      }
      return v;
    };
    for (const d of deliveries) {
      const v = ensure((d as any).driver_id);
      if ((d as any).status === "delivered") {
        const totals = deliveryNetTotals(
          (d as any).delivery_items ?? [],
          (d as any).delivery_returns ?? [],
        );
        v.sold += totals.netAmount;
      }
      if ((d as any).status === "failed") v.failed += 1;
    }
    for (const p of payments) {
      const v = ensure((p as any).driver_id);
      const amt = paymentAmount(p);
      if (p.status === "paid") v.collected += amt;
      else v.pending += amt;
    }

    return {
      date_from: data.date_from,
      date_to: data.date_to,
      dispatches: { count: dispatches.length, units: dispatchUnits },
      deliveries: {
        total: deliveries.length,
        delivered: delivered.length,
        pending: pendingDel,
        failed: failedDel,
        soldUnits,
        soldAmount,
      },
      payments: {
        collectedTotal,
        pendingAmount,
        byMethod,
        count: payments.length,
      },
      expenses: { total: expenseTotal, count: expenses.length },
      cashNet,
      drivers: Array.from(perDriver.values()).sort((a, b) => b.sold - a.sold),
    };
  });
```

- [ ] **Step 2: Add `getDailyTotals` function at the end of the DASHBOARD section in `admin.functions.ts`**

Add this new export immediately after the updated `getDashboardSummary` (before the `// ============ DELIVERIES ============` comment):

```ts
export const getDailyTotals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ date_from: dateStr, date_to: dateStr, branch_id: branchIdField }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { startISO } = tzDayRange(data.date_from);
    const { endISO } = tzDayRange(data.date_to);
    const bid = data.branch_id ?? null;

    let delQ = supabase
      .from("deliveries")
      .select("delivery_date, status, delivery_items(line_total), delivery_returns(product_id, quantity, products(name))")
      .gte("delivery_date", data.date_from)
      .lte("delivery_date", data.date_to);
    if (bid) delQ = delQ.eq("branch_id", bid);

    let payQ = supabase
      .from("payments")
      .select("paid_at, amount, status, delivery_id, deliveries(delivery_items(line_total), delivery_returns(product_id, quantity))")
      .gte("paid_at", startISO)
      .lt("paid_at", endISO)
      .eq("status", "paid");
    if (bid) payQ = payQ.eq("branch_id", bid);

    const [delRes, payRes] = await Promise.all([delQ, payQ]);
    if (delRes.error) throw new Error(delRes.error.message);
    if (payRes.error) throw new Error(payRes.error.message);

    // Build date spine
    const spine: Map<string, { date: string; sold: number; collected: number; delivered: number; failed: number; pending: number }> = new Map();
    const cur = new Date(data.date_from + "T12:00:00Z");
    const end = new Date(data.date_to + "T12:00:00Z");
    while (cur <= end) {
      const d = cur.toISOString().slice(0, 10);
      spine.set(d, { date: d, sold: 0, collected: 0, delivered: 0, failed: 0, pending: 0 });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }

    for (const row of delRes.data ?? []) {
      const entry = spine.get((row as any).delivery_date as string);
      if (!entry) continue;
      if ((row as any).status === "delivered") {
        entry.delivered += 1;
        const items = (row as any).delivery_items ?? [];
        entry.sold += items.reduce((s: number, i: any) => s + Number(i.line_total ?? 0), 0);
      } else if ((row as any).status === "failed") {
        entry.failed += 1;
      } else {
        entry.pending += 1;
      }
    }

    for (const row of payRes.data ?? []) {
      const dateKey = (row as any).paid_at.slice(0, 10);
      const entry = spine.get(dateKey);
      if (!entry) continue;
      const items = (row as any).deliveries?.delivery_items ?? [];
      const total = items.length > 0
        ? items.reduce((s: number, i: any) => s + Number(i.line_total ?? 0), 0)
        : Number((row as any).amount ?? 0);
      entry.collected += total;
    }

    return Array.from(spine.values());
  });
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/andy/Documents/Nettyo/ruta-dulce
npx tsc --noEmit
```

Expected: 0 errors (or only pre-existing errors unrelated to `admin.functions.ts`).

- [ ] **Step 4: Commit**

```bash
git add src/lib/api/admin.functions.ts
git commit -m "feat(api): extend getDashboardSummary to date ranges, add getDailyTotals"
```

---

## Task 2: Extend driver API functions for date ranges

**Files:**
- Modify: `src/lib/api/driver.functions.ts`

The three GET functions need to become POST functions with optional `date_from`/`date_to`. When omitted, they default to today.

- [ ] **Step 1: Replace `listTodayDeliveries` with a POST version accepting optional date range**

Find the existing `listTodayDeliveries` (around line 446) and replace it:

```ts
export const listTodayDeliveries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const from = data.date_from ?? todayStr();
    const to = data.date_to ?? from;
    const { data: rows, error } = await supabase
      .from("deliveries")
      .select(
        "id, status, comment, photo_url, customer_id, delivery_date, updated_at, customers(name), delivery_items(product_id, quantity, unit_price, line_total), delivery_returns(product_id, quantity)",
      )
      .eq("driver_id", userId)
      .gte("delivery_date", from)
      .lte("delivery_date", to)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => {
      const items = (r.delivery_items ?? []) as Array<{
        product_id: string;
        quantity: number;
        unit_price: number;
        line_total?: number;
      }>;
      const returns = (r.delivery_returns ?? []) as Array<{ product_id: string; quantity: number }>;
      const { netUnits, netAmount, returnAmount } = deliveryNetTotals(items, returns);
      return {
        id: r.id as string,
        status: r.status as "pending" | "delivered" | "failed",
        comment: (r.comment as string | null) ?? null,
        photo_url: (r.photo_url as string | null) ?? null,
        customer_id: r.customer_id as string,
        customer_name: (r.customers?.name as string | null) ?? null,
        delivery_date: r.delivery_date as string,
        units: netUnits,
        total: netAmount,
        return_amount: returnAmount,
      };
    });
  });
```

> **Note:** Check what `deliveryNetTotals` returns exactly (it's in `src/lib/delivery-totals.ts`). If it doesn't return `returnAmount`, keep only the fields it does return and add `return_amount: 0` as a placeholder — the existing code only used `netUnits` and `netAmount`.

- [ ] **Step 2: Replace `listTodayPayments` with a POST version accepting optional date range**

Find and replace `listTodayPayments` (around line 539):

```ts
export const listTodayPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const from = data.date_from ?? todayStr();
    const to = data.date_to ?? from;
    const { startISO } = tzDayRange(from);
    const { endISO } = tzDayRange(to);
    const { data: rows, error } = await supabase
      .from("payments")
      .select(
        "id, amount, status, method, note, paid_at, customer_id, delivery_id, customers(name), deliveries(delivery_items(product_id, quantity, unit_price, line_total), delivery_returns(product_id, quantity))",
      )
      .eq("driver_id", userId)
      .gte("paid_at", startISO)
      .lt("paid_at", endISO)
      .order("paid_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => {
      const items = (r.deliveries?.delivery_items ?? []) as Array<{
        product_id: string;
        quantity: number;
        unit_price: number;
        line_total?: number;
      }>;
      const returns = (r.deliveries?.delivery_returns ?? []) as Array<{ product_id: string; quantity: number }>;
      const { netAmount } = deliveryNetTotals(items, returns);
      const amount = items.length > 0 ? netAmount : Number(r.amount ?? 0);
      return {
        id: r.id as string,
        amount,
        status: r.status as "paid" | "pending",
        method: r.method as string,
        note: (r.note as string | null) ?? null,
        paid_at: r.paid_at as string,
        customer_id: r.customer_id as string,
        customer_name: (r.customers?.name as string | null) ?? null,
      };
    });
  });
```

- [ ] **Step 3: Replace `listTodayExpenses` with a POST version accepting optional date range**

Find and replace `listTodayExpenses` (around line 628):

```ts
export const listTodayExpenses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const from = data.date_from ?? todayStr();
    const to = data.date_to ?? from;
    const { data: rows, error } = await supabase
      .from("expenses")
      .select("id, amount, description, photo_url, expense_date, created_at")
      .eq("driver_id", userId)
      .gte("expense_date", from)
      .lte("expense_date", to)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      id: r.id as string,
      amount: Number(r.amount),
      description: r.description as string,
      photo_url: (r.photo_url as string | null) ?? null,
      expense_date: r.expense_date as string,
      created_at: r.created_at as string,
    }));
  });
```

- [ ] **Step 4: Update all existing call sites of these three functions**

Search for callers and update them from `fetchDeliveries()` → `fetchDeliveries({ data: {} })`:

```bash
grep -rn "listTodayDeliveries\|listTodayPayments\|listTodayExpenses" src/routes/
```

For each call site found (currently `driver/overview.tsx` and `driver/expenses.tsx`):
- `fetchDeliveries()` → `fetchDeliveries({ data: {} })`
- `fetchPayments()` → `fetchPayments({ data: {} })`
- `fetchExpenses()` → `fetchExpenses({ data: {} })`

Also update any query keys that include these calls.

- [ ] **Step 5: Verify build**

```bash
npx tsc --noEmit
```

Expected: 0 new errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/api/driver.functions.ts src/routes/_authenticated/driver/
git commit -m "feat(api): extend driver list functions to accept optional date ranges"
```

---

## Task 3: `useDashboardPeriod` hook

**Files:**
- Create: `src/hooks/use-dashboard-period.ts`

- [ ] **Step 1: Create the hook**

```ts
import { useState, useMemo } from "react";
import { todayInTZ } from "@/lib/tz";

export type Period = "day" | "week" | "month" | "year" | "custom";
export type DateRange = { from: string; to: string };

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}

function addMonths(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  return isoDate(d);
}

function addYears(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() + n);
  return isoDate(d);
}

/** Return Monday of the week containing dateStr (weeks start Mon) */
function weekStart(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = d.getUTCDay(); // 0=Sun 1=Mon ... 6=Sat
  const diff = dow === 0 ? -6 : 1 - dow; // shift to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return isoDate(d);
}

function computeRanges(period: Period, today: string, custom: DateRange | null): { current: DateRange; previous: DateRange } {
  if (period === "day") {
    return {
      current: { from: today, to: today },
      previous: { from: addDays(today, -1), to: addDays(today, -1) },
    };
  }
  if (period === "week") {
    const mon = weekStart(today);
    const sun = addDays(mon, 6);
    return {
      current: { from: mon, to: sun },
      previous: { from: addDays(mon, -7), to: addDays(sun, -7) },
    };
  }
  if (period === "month") {
    const [y, m] = today.split("-").map(Number);
    const firstDay = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
    const nextMonthFirst = addMonths(firstDay, 1);
    const lastDay = addDays(nextMonthFirst, -1);
    const prevFirst = addMonths(firstDay, -1);
    const prevLast = addDays(firstDay, -1);
    return {
      current: { from: firstDay, to: lastDay },
      previous: { from: prevFirst, to: prevLast },
    };
  }
  if (period === "year") {
    const y = today.slice(0, 4);
    return {
      current: { from: `${y}-01-01`, to: `${y}-12-31` },
      previous: { from: `${Number(y) - 1}-01-01`, to: `${Number(y) - 1}-12-31` },
    };
  }
  // custom
  if (custom) {
    const durMs = new Date(custom.to + "T12:00:00Z").getTime() - new Date(custom.from + "T12:00:00Z").getTime();
    const durDays = Math.round(durMs / 86_400_000);
    return {
      current: custom,
      previous: { from: addDays(custom.from, -(durDays + 1)), to: addDays(custom.from, -1) },
    };
  }
  return { current: { from: today, to: today }, previous: { from: addDays(today, -1), to: addDays(today, -1) } };
}

export function useDashboardPeriod(defaultPeriod: Period = "day") {
  const today = todayInTZ();
  const [period, setPeriod] = useState<Period>(defaultPeriod);
  const [custom, setCustom] = useState<DateRange | null>(null);

  const { current, previous } = useMemo(
    () => computeRanges(period, today, custom),
    [period, today, custom],
  );

  return { period, setPeriod, currentRange: current, previousRange: previous, customRange: custom, setCustomRange: setCustom };
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-dashboard-period.ts
git commit -m "feat(hooks): add useDashboardPeriod for period-over-period comparison"
```

---

## Task 4: `PeriodPicker` component

**Files:**
- Create: `src/components/admin/period-picker.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { type Period, type DateRange } from "@/hooks/use-dashboard-period";
import { cn } from "@/lib/utils";
import { FilterDateRangePicker } from "@/components/admin/data-table";

const PERIODS: { id: Period; label: string }[] = [
  { id: "day", label: "Día" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mes" },
  { id: "year", label: "Año" },
  { id: "custom", label: "Personalizado" },
];

export function PeriodPicker({
  period,
  onPeriodChange,
  customRange,
  onCustomRangeChange,
  exclude,
}: {
  period: Period;
  onPeriodChange: (p: Period) => void;
  customRange: DateRange | null;
  onCustomRangeChange: (r: DateRange) => void;
  /** Period ids to hide, e.g. ["month","year"] for driver */
  exclude?: Period[];
}) {
  const visible = PERIODS.filter((p) => !exclude?.includes(p.id));

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex rounded-lg border bg-muted p-0.5 gap-0.5">
        {visible.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onPeriodChange(id)}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium transition-colors",
              period === id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {period === "custom" && (
        <FilterDateRangePicker
          from={customRange?.from ?? null}
          to={customRange?.to ?? null}
          onChange={(from, to) => {
            if (from && to) onCustomRangeChange({ from, to });
          }}
        />
      )}
    </div>
  );
}
```

> **Note:** Check the exact props of `FilterDateRangePicker` in `src/components/admin/data-table.tsx` — it may use different prop names (`value`, `onChange`, etc.). Adapt accordingly.

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/period-picker.tsx
git commit -m "feat(ui): add PeriodPicker component (Día/Semana/Mes/Año/Personalizado)"
```

---

## Task 5: `DeltaBadge` component

**Files:**
- Create: `src/components/admin/delta-badge.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { cn } from "@/lib/utils";

export function DeltaBadge({ current, previous, inverted = false }: {
  current: number;
  previous: number;
  /** If true, a positive delta is red (e.g. "failed" count) */
  inverted?: boolean;
}) {
  if (previous === 0) return null;

  const raw = ((current - previous) / Math.abs(previous)) * 100;
  const pct = Math.round(raw);
  if (pct === 0) return <span className="text-xs text-muted-foreground">Sin cambio</span>;

  const isUp = pct > 0;
  const good = inverted ? !isUp : isUp;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums",
        good
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
          : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
      )}
    >
      {isUp ? "↑" : "↓"} {Math.abs(pct)}%
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/delta-badge.tsx
git commit -m "feat(ui): add DeltaBadge for period-over-period % display"
```

---

## Task 6: Owner Dashboard component

**Files:**
- Create: `src/components/admin/owner-dashboard.tsx`

This is the most complex component. It uses `getDashboardSummary` (×2), `getDailyTotals` (×2), `reportSalesByDriver`, and `reportSalesByProduct`.

- [ ] **Step 1: Create the component**

```tsx
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useDashboardPeriod } from "@/hooks/use-dashboard-period";
import { useBranchScope } from "@/lib/branch-scope";
import { PeriodPicker } from "@/components/admin/period-picker";
import { DeltaBadge } from "@/components/admin/delta-badge";
import { BranchSwitcher } from "@/components/admin/branch-switcher";
import { PageHeader } from "@/components/admin/data-table";
import { StatGrid, StatCardSimple } from "@/components/admin/stat-cards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  getDashboardSummary,
  getDailyTotals,
  reportSalesByDriver,
  reportSalesByProduct,
} from "@/lib/api/admin.functions";
import { fmtMoney, fmtQty } from "@/lib/format";

const METHOD_COLORS: Record<string, string> = {
  cash: "hsl(var(--chart-1))",
  transfer: "hsl(var(--chart-2))",
  credit: "hsl(var(--chart-3))",
  other: "hsl(var(--chart-4))",
};
const METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  credit: "Crédito",
  other: "Otro",
};

export function OwnerDashboard() {
  const { period, setPeriod, currentRange, previousRange, customRange, setCustomRange } = useDashboardPeriod("day");
  const { branchId } = useBranchScope();

  const fnSummary = useServerFn(getDashboardSummary);
  const fnDaily = useServerFn(getDailyTotals);
  const fnByDriver = useServerFn(reportSalesByDriver);
  const fnByProduct = useServerFn(reportSalesByProduct);

  const commonParams = { branch_id: branchId };

  const { data: cur } = useQuery({
    queryKey: ["dashboard", "owner", "cur", currentRange, branchId],
    queryFn: () => fnSummary({ data: { date_from: currentRange.from, date_to: currentRange.to, ...commonParams } }),
  });
  const { data: prev } = useQuery({
    queryKey: ["dashboard", "owner", "prev", previousRange, branchId],
    queryFn: () => fnSummary({ data: { date_from: previousRange.from, date_to: previousRange.to, ...commonParams } }),
  });
  const { data: dailyCur } = useQuery({
    queryKey: ["dashboard", "daily", "cur", currentRange, branchId],
    queryFn: () => fnDaily({ data: { date_from: currentRange.from, date_to: currentRange.to, ...commonParams } }),
  });
  const { data: dailyPrev } = useQuery({
    queryKey: ["dashboard", "daily", "prev", previousRange, branchId],
    queryFn: () => fnDaily({ data: { date_from: previousRange.from, date_to: previousRange.to, ...commonParams } }),
  });
  const { data: byDriver } = useQuery({
    queryKey: ["dashboard", "byDriver", currentRange, branchId],
    queryFn: () => fnByDriver({ data: { date_from: currentRange.from, date_to: currentRange.to, ...commonParams } }),
  });
  const { data: byProduct } = useQuery({
    queryKey: ["dashboard", "byProduct", currentRange, branchId],
    queryFn: () => fnByProduct({ data: { date_from: currentRange.from, date_to: currentRange.to, ...commonParams } }),
  });

  // Merge daily current + previous for trend chart (align by offset index)
  const trendData = (dailyCur ?? []).map((d, i) => ({
    label: d.date.slice(5), // MM-DD
    current: d.sold,
    previous: dailyPrev?.[i]?.sold ?? 0,
  }));

  // Top 8 products
  const topProducts = (byProduct ?? []).slice(0, 8).map((p) => ({
    name: p.product_name ?? p.product_id.slice(0, 8),
    amount: p.amount,
  }));

  // Payment method pie
  const pieData = cur
    ? Object.entries(cur.payments.byMethod)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({ name: METHOD_LABEL[k] ?? k, value: v, key: k }))
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inicio"
        description="Resumen del período."
        action={
          <div className="flex items-center gap-3 flex-wrap">
            <BranchSwitcher />
            <PeriodPicker
              period={period}
              onPeriodChange={setPeriod}
              customRange={customRange}
              onCustomRangeChange={setCustomRange}
            />
          </div>
        }
      />

      {/* KPI Cards — 6 across desktop, 2-col mobile */}
      <StatGrid columns={4} className="sm:grid-cols-3 lg:grid-cols-6">
        <StatCardSimple
          label="Ventas"
          value={cur?.deliveries.soldAmount ?? 0}
          mode="money"
          sub={cur ? `${fmtQty(cur.deliveries.soldUnits)} u` : ""}
          badge={cur && prev ? undefined : undefined}
        />
        <div className="stat-card stat-card-simple">
          <div className="stat-card-label">Ventas</div>
          <span className="stat-card-value">{fmtMoney(cur?.deliveries.soldAmount ?? 0)}</span>
          {cur && prev && <DeltaBadge current={cur.deliveries.soldAmount} previous={prev.deliveries.soldAmount} />}
        </div>
        {/* ... etc — see note below */}
      </StatGrid>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sales trend */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Tendencia de ventas</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={{ current: { label: "Período actual", color: "hsl(var(--chart-1))" }, previous: { label: "Período anterior", color: "hsl(var(--chart-1))" } }} className="h-52">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtMoney(v)} width={60} />
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Line type="monotone" dataKey="current" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} name="Actual" />
                <Line type="monotone" dataKey="previous" stroke="hsl(var(--chart-1))" strokeWidth={1.5} strokeOpacity={0.3} dot={false} name="Anterior" strokeDasharray="4 2" />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Driver performance */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Ventas por repartidor</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={{ sold: { label: "Vendido", color: "hsl(var(--chart-1))" } }} className="h-52">
              <BarChart data={(byDriver ?? []).slice(0, 8).map((d) => ({ name: d.driver_name ?? "—", sold: d.sold, collected: d.collected, expenses: d.expenses }))} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtMoney(v)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Bar dataKey="sold" fill="hsl(var(--chart-1))" radius={[0, 3, 3, 0]} name="Vendido" />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top products */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Productos principales</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={{ amount: { label: "Ventas", color: "hsl(var(--chart-2))" } }} className="h-52">
              <BarChart data={topProducts}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtMoney(v)} width={60} />
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Bar dataKey="amount" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} name="Ventas" />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Payment methods */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Métodos de cobro</CardTitle></CardHeader>
          <CardContent className="flex items-center justify-center">
            <ChartContainer config={Object.fromEntries(Object.entries(METHOD_COLORS).map(([k, v]) => [k, { label: METHOD_LABEL[k], color: v }]))} className="h-52 w-full">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" nameKey="name">
                  {pieData.map((entry) => (
                    <Cell key={entry.key} fill={METHOD_COLORS[entry.key] ?? "hsl(var(--chart-4))"} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Legend iconType="circle" iconSize={10} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Driver status table */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Repartidores</CardTitle></CardHeader>
        <CardContent>
          {(!cur?.drivers || cur.drivers.length === 0) && (
            <p className="text-sm text-muted-foreground">Sin actividad en el período.</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="text-left py-2 pr-4 font-medium">Repartidor</th>
                  <th className="text-right py-2 px-3 font-medium">Entregas</th>
                  <th className="text-right py-2 px-3 font-medium">Vendido</th>
                  <th className="text-right py-2 px-3 font-medium">Cobrado</th>
                  <th className="text-right py-2 px-3 font-medium">Pendiente</th>
                  <th className="text-right py-2 px-3 font-medium">Fallidas</th>
                </tr>
              </thead>
              <tbody>
                {(cur?.drivers ?? []).map((d) => {
                  const driverReport = (byDriver ?? []).find((r) => r.driver_id === d.id);
                  return (
                    <tr key={d.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2 pr-4 font-medium">
                        <Link to="/app/deliveries" search={{ driver_id: d.id }} className="hover:underline text-primary">
                          {d.name ?? d.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="text-right py-2 px-3 tabular-nums text-muted-foreground">—</td>
                      <td className="text-right py-2 px-3 tabular-nums">{fmtMoney(d.sold)}</td>
                      <td className="text-right py-2 px-3 tabular-nums">{fmtMoney(d.collected)}</td>
                      <td className={`text-right py-2 px-3 tabular-nums ${d.pending > 0 ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
                        {fmtMoney(d.pending)}
                      </td>
                      <td className={`text-right py-2 px-3 tabular-nums ${d.failed > 0 ? "text-rose-600 font-medium" : "text-muted-foreground"}`}>
                        {d.failed}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex gap-3 text-sm">
            <Link to="/app/deliveries" className="text-primary hover:underline">Ver entregas →</Link>
            <Link to="/app/payments" className="text-primary hover:underline">Ver pagos →</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

> **Important implementation note on KPI cards:** The code above has a placeholder for the KPI stat cards section (marked with a comment). Replace the placeholder `StatGrid` + the hardcoded `div` block with this pattern repeated for each of the 6 KPIs. Use a helper `StatKpiCard` defined locally at the top of the file to avoid repetition:
>
> ```tsx
> function StatKpiCard({ label, value, prevValue, mode = "qty", sub, highlight, inverted }: {
>   label: string; value: number; prevValue?: number; mode?: "qty" | "money";
>   sub?: string; highlight?: boolean; inverted?: boolean;
> }) {
>   return (
>     <div className={cn("stat-card stat-card-simple", highlight && "stat-card-highlight")}>
>       <div className="stat-card-label">{label}</div>
>       <span className="stat-card-value">
>         {mode === "money" ? fmtMoney(value) : fmtQty(value)}
>       </span>
>       {sub && <div className="stat-card-sub">{sub}</div>}
>       {prevValue !== undefined && (
>         <DeltaBadge current={value} previous={prevValue} inverted={inverted} />
>       )}
>     </div>
>   );
> }
> ```
>
> Then the 6 KPI cards:
> ```tsx
> <StatGrid columns={4} className="sm:grid-cols-3 lg:grid-cols-6">
>   <StatKpiCard label="Ventas" value={cur?.deliveries.soldAmount ?? 0} prevValue={prev?.deliveries.soldAmount} mode="money" sub={`${fmtQty(cur?.deliveries.soldUnits ?? 0)} u`} />
>   <StatKpiCard label="Cobrado" value={cur?.payments.collectedTotal ?? 0} prevValue={prev?.payments.collectedTotal} mode="money" />
>   <StatKpiCard label="Neto en caja" value={cur?.cashNet ?? 0} prevValue={prev?.cashNet} mode="money" highlight={(cur?.cashNet ?? 0) < 0} />
>   <StatKpiCard label="Crédito/Pendiente" value={(cur?.payments.pendingAmount ?? 0) + (cur?.payments.byMethod.credit ?? 0)} prevValue={(prev?.payments.pendingAmount ?? 0) + (prev?.payments.byMethod.credit ?? 0)} mode="money" highlight={((cur?.payments.pendingAmount ?? 0) + (cur?.payments.byMethod.credit ?? 0)) > 0} inverted />
>   <StatKpiCard label="Despachos" value={cur?.dispatches.count ?? 0} prevValue={prev?.dispatches.count} sub={`${fmtQty(cur?.dispatches.units ?? 0)} u`} />
>   <StatKpiCard label="Entregas" value={cur?.deliveries.delivered ?? 0} prevValue={prev?.deliveries.delivered} displayValue={`${cur?.deliveries.delivered ?? 0}/${cur?.deliveries.total ?? 0}`} sub={`${cur?.deliveries.pending ?? 0} pend. · ${cur?.deliveries.failed ?? 0} fall.`} />
> </StatGrid>
> ```
> Note: `StatCardSimple` doesn't have a `displayValue` prop variant with DeltaBadge — use the `StatKpiCard` helper for consistency.

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

Fix any type errors (most commonly: missing imports, wrong prop names on Recharts components).

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/owner-dashboard.tsx
git commit -m "feat(dashboard): add OwnerDashboard with 6 KPIs, 4 charts, driver table"
```

---

## Task 7: Supervisor Dashboard component

**Files:**
- Create: `src/components/admin/supervisor-dashboard.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useDashboardPeriod } from "@/hooks/use-dashboard-period";
import { useBranchScope } from "@/lib/branch-scope";
import { PeriodPicker } from "@/components/admin/period-picker";
import { DeltaBadge } from "@/components/admin/delta-badge";
import { PageHeader } from "@/components/admin/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { getDashboardSummary, getDailyTotals, reportSalesByDriver } from "@/lib/api/admin.functions";
import { fmtMoney, fmtQty } from "@/lib/format";
import { cn } from "@/lib/utils";

function StatKpiCard({ label, value, prevValue, mode = "qty", sub, highlight, inverted, displayValue }: {
  label: string; value: number; prevValue?: number; mode?: "qty" | "money";
  sub?: string; highlight?: boolean; inverted?: boolean; displayValue?: string;
}) {
  return (
    <div className={cn("stat-card stat-card-simple", highlight && "stat-card-highlight")}>
      <div className="stat-card-label">{label}</div>
      <span className="stat-card-value">{displayValue ?? (mode === "money" ? fmtMoney(value) : fmtQty(value))}</span>
      {sub && <div className="stat-card-sub">{sub}</div>}
      {prevValue !== undefined && <DeltaBadge current={value} previous={prevValue} inverted={inverted} />}
    </div>
  );
}

export function SupervisorDashboard() {
  const { period, setPeriod, currentRange, previousRange, customRange, setCustomRange } = useDashboardPeriod("day");
  const { branchId } = useBranchScope();

  const fnSummary = useServerFn(getDashboardSummary);
  const fnDaily = useServerFn(getDailyTotals);
  const fnByDriver = useServerFn(reportSalesByDriver);

  const cp = { branch_id: branchId };

  const { data: cur } = useQuery({
    queryKey: ["dashboard", "sup", "cur", currentRange, branchId],
    queryFn: () => fnSummary({ data: { date_from: currentRange.from, date_to: currentRange.to, ...cp } }),
  });
  const { data: prev } = useQuery({
    queryKey: ["dashboard", "sup", "prev", previousRange, branchId],
    queryFn: () => fnSummary({ data: { date_from: previousRange.from, date_to: previousRange.to, ...cp } }),
  });
  const { data: dailyCur } = useQuery({
    queryKey: ["dashboard", "daily", "cur", currentRange, branchId],
    queryFn: () => fnDaily({ data: { date_from: currentRange.from, date_to: currentRange.to, ...cp } }),
  });
  const { data: byDriver } = useQuery({
    queryKey: ["dashboard", "byDriver", currentRange, branchId],
    queryFn: () => fnByDriver({ data: { date_from: currentRange.from, date_to: currentRange.to, ...cp } }),
  });

  const outcomeData = (dailyCur ?? []).map((d) => ({
    label: d.date.slice(5),
    Entregado: d.delivered,
    Fallido: d.failed,
    Pendiente: d.pending,
  }));

  const driverCompletionData = (byDriver ?? []).slice(0, 10).map((d) => ({
    name: d.driver_name ?? "—",
    Vendido: d.sold,
    Cobrado: d.collected,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inicio"
        description="Operaciones del período."
        action={
          <PeriodPicker
            period={period}
            onPeriodChange={setPeriod}
            customRange={customRange}
            onCustomRangeChange={setCustomRange}
          />
        }
      />

      {/* 5 KPI cards */}
      <div className="stat-grid sm:grid-cols-3 lg:grid-cols-5">
        <StatKpiCard
          label="Entregas"
          value={cur?.deliveries.delivered ?? 0}
          prevValue={prev?.deliveries.delivered}
          displayValue={`${cur?.deliveries.delivered ?? 0}/${cur?.deliveries.total ?? 0}`}
          sub={`${cur?.deliveries.pending ?? 0} pendientes`}
        />
        <StatKpiCard label="Fallidas" value={cur?.deliveries.failed ?? 0} prevValue={prev?.deliveries.failed} highlight={(cur?.deliveries.failed ?? 0) > 0} inverted />
        <StatKpiCard label="Pendientes" value={cur?.deliveries.pending ?? 0} prevValue={prev?.deliveries.pending} highlight={(cur?.deliveries.pending ?? 0) > 0} inverted />
        <StatKpiCard label="Ventas" value={cur?.deliveries.soldAmount ?? 0} prevValue={prev?.deliveries.soldAmount} mode="money" />
        <StatKpiCard label="Cobrado" value={cur?.payments.collectedTotal ?? 0} prevValue={prev?.payments.collectedTotal} mode="money" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Resultados de entregas por día</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={{ Entregado: { color: "hsl(var(--chart-1))" }, Fallido: { color: "hsl(var(--chart-3))" }, Pendiente: { color: "hsl(var(--chart-4))" } }} className="h-52">
              <BarChart data={outcomeData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend iconType="circle" iconSize={10} />
                <Bar dataKey="Entregado" stackId="a" fill="hsl(var(--chart-1))" />
                <Bar dataKey="Fallido" stackId="a" fill="hsl(var(--chart-3))" />
                <Bar dataKey="Pendiente" stackId="a" fill="hsl(var(--chart-4))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Repartidores — ventas vs cobrado</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={{ Vendido: { color: "hsl(var(--chart-1))" }, Cobrado: { color: "hsl(var(--chart-2))" } }} className="h-52">
              <BarChart data={driverCompletionData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtMoney(v)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Legend iconType="circle" iconSize={10} />
                <Bar dataKey="Vendido" fill="hsl(var(--chart-1))" radius={[0, 3, 3, 0]} />
                <Bar dataKey="Cobrado" fill="hsl(var(--chart-2))" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Driver table */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Detalle por repartidor</CardTitle></CardHeader>
        <CardContent>
          {(!byDriver || byDriver.length === 0) && (
            <p className="text-sm text-muted-foreground">Sin actividad en el período.</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="text-left py-2 pr-4 font-medium">Repartidor</th>
                  <th className="text-right py-2 px-3 font-medium">Vendido</th>
                  <th className="text-right py-2 px-3 font-medium">Cobrado</th>
                  <th className="text-right py-2 px-3 font-medium">Pendiente</th>
                  <th className="text-right py-2 px-3 font-medium">Gastos</th>
                </tr>
              </thead>
              <tbody>
                {(byDriver ?? []).map((d) => (
                  <tr key={d.driver_id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-2 pr-4 font-medium">
                      <Link to="/app/deliveries" search={{ driver_id: d.driver_id }} className="hover:underline text-primary">
                        {d.driver_name ?? d.driver_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="text-right py-2 px-3 tabular-nums">{fmtMoney(d.sold)}</td>
                    <td className="text-right py-2 px-3 tabular-nums">{fmtMoney(d.collected)}</td>
                    <td className={`text-right py-2 px-3 tabular-nums ${d.pending > 0 ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>{fmtMoney(d.pending)}</td>
                    <td className="text-right py-2 px-3 tabular-nums text-muted-foreground">{fmtMoney(d.expenses)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/supervisor-dashboard.tsx
git commit -m "feat(dashboard): add SupervisorDashboard with 5 KPIs, outcome chart, driver table"
```

---

## Task 8: Cashier Dashboard component

**Files:**
- Create: `src/components/admin/cashier-dashboard.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useDashboardPeriod } from "@/hooks/use-dashboard-period";
import { useBranchScope } from "@/lib/branch-scope";
import { PeriodPicker } from "@/components/admin/period-picker";
import { DeltaBadge } from "@/components/admin/delta-badge";
import { PageHeader } from "@/components/admin/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardSummary, listPaymentsAdmin, listDispatchesToday } from "@/lib/api/admin.functions";
import { fmtMoney, fmtQty } from "@/lib/format";
import { cn } from "@/lib/utils";

// NOTE: listDispatchesToday does not exist yet in admin.functions.ts.
// Replace with listDeliveriesAdmin grouped, or use getDashboardSummary's dispatches count only.
// For the dispatch table, use: listDispatchesToday → import from dispatches.functions.ts (listDispatchesToday already exists there)
import { listDispatchesToday as listDispatches } from "@/lib/api/dispatches.functions";

const METHOD_LABEL: Record<string, string> = { cash: "Efectivo", transfer: "Transferencia", credit: "Crédito", other: "Otro" };
const METHOD_ORDER = ["cash", "transfer", "credit", "other"];

function StatKpiCard({ label, value, prevValue, mode = "qty", sub, highlight, inverted }: {
  label: string; value: number; prevValue?: number; mode?: "qty" | "money";
  sub?: string; highlight?: boolean; inverted?: boolean;
}) {
  return (
    <div className={cn("stat-card stat-card-simple", highlight && "stat-card-highlight")}>
      <div className="stat-card-label">{label}</div>
      <span className="stat-card-value">{mode === "money" ? fmtMoney(value) : fmtQty(value)}</span>
      {sub && <div className="stat-card-sub">{sub}</div>}
      {prevValue !== undefined && <DeltaBadge current={value} previous={prevValue} inverted={inverted} />}
    </div>
  );
}

export function CashierDashboard() {
  const { period, setPeriod, currentRange, previousRange, customRange, setCustomRange } = useDashboardPeriod("day");
  const { branchId } = useBranchScope();

  const fnSummary = useServerFn(getDashboardSummary);
  const fnPayments = useServerFn(listPaymentsAdmin);
  const fnDispatches = useServerFn(listDispatches);

  const cp = { branch_id: branchId };

  const { data: cur } = useQuery({
    queryKey: ["dashboard", "cashier", "cur", currentRange, branchId],
    queryFn: () => fnSummary({ data: { date_from: currentRange.from, date_to: currentRange.to, ...cp } }),
  });
  const { data: prev } = useQuery({
    queryKey: ["dashboard", "cashier", "prev", previousRange, branchId],
    queryFn: () => fnSummary({ data: { date_from: previousRange.from, date_to: previousRange.to, ...cp } }),
  });
  const { data: pendingPayments } = useQuery({
    queryKey: ["dashboard", "cashier", "pending-pays", currentRange, branchId],
    queryFn: () => fnPayments({ data: { date_from: currentRange.from, date_to: currentRange.to, status: "pending", branch_id: branchId } }),
  });
  const { data: dispatches } = useQuery({
    queryKey: ["dashboard", "cashier", "dispatches", currentRange.from, branchId],
    queryFn: () => fnDispatches({ data: { branch_id: branchId } }),
  });

  const totalCollected = cur?.payments.collectedTotal ?? 0;
  const byMethod = cur?.payments.byMethod ?? {};

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inicio"
        description="Operaciones del período."
        action={
          <PeriodPicker
            period={period}
            onPeriodChange={setPeriod}
            customRange={customRange}
            onCustomRangeChange={setCustomRange}
          />
        }
      />

      {/* 4 KPI cards */}
      <div className="stat-grid sm:grid-cols-2 lg:grid-cols-4">
        <StatKpiCard label="Despachos" value={cur?.dispatches.count ?? 0} prevValue={prev?.dispatches.count} sub={`${fmtQty(cur?.dispatches.units ?? 0)} u cargadas`} />
        <StatKpiCard label="Cobrado" value={cur?.payments.collectedTotal ?? 0} prevValue={prev?.payments.collectedTotal} mode="money" />
        <StatKpiCard
          label="Pendiente / Crédito"
          value={(cur?.payments.pendingAmount ?? 0) + (cur?.payments.byMethod.credit ?? 0)}
          prevValue={(prev?.payments.pendingAmount ?? 0) + (prev?.payments.byMethod.credit ?? 0)}
          mode="money"
          highlight={((cur?.payments.pendingAmount ?? 0) + (cur?.payments.byMethod.credit ?? 0)) > 0}
          inverted
        />
        <StatKpiCard label="Gastos" value={cur?.expenses.total ?? 0} prevValue={prev?.expenses.total} mode="money" sub={`${cur?.expenses.count ?? 0} registros`} />
      </div>

      {/* Payment method breakdown */}
      {totalCollected > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Cobros por método</CardTitle></CardHeader>
          <CardContent className="space-y-2.5">
            {METHOD_ORDER.filter((m) => (byMethod[m] ?? 0) > 0).map((method) => {
              const amount = byMethod[method] ?? 0;
              const pct = totalCollected > 0 ? (amount / totalCollected) * 100 : 0;
              return (
                <div key={method} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{METHOD_LABEL[method]}</span>
                    <span className="font-semibold tabular-nums">
                      {fmtMoney(amount)} <span className="text-muted-foreground font-normal">({Math.round(pct)}%)</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Two tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pending payments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Cobros pendientes</CardTitle>
            <Link to="/app/payments" className="text-xs text-primary hover:underline">Ver todos →</Link>
          </CardHeader>
          <CardContent>
            {(!pendingPayments || pendingPayments.length === 0) ? (
              <p className="text-sm text-muted-foreground">Sin cobros pendientes.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs">
                      <th className="text-left py-2 pr-3 font-medium">Cliente</th>
                      <th className="text-right py-2 px-3 font-medium">Monto</th>
                      <th className="text-right py-2 px-3 font-medium">Método</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingPayments.slice(0, 10).map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 truncate max-w-[120px]">{p.customer_name ?? "—"}</td>
                        <td className="text-right py-2 px-3 tabular-nums font-medium text-amber-600">{fmtMoney(p.amount)}</td>
                        <td className="text-right py-2 px-3 text-muted-foreground">{METHOD_LABEL[p.method] ?? p.method}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Today's dispatches */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Despachos del período</CardTitle>
            <Link to="/app/dispatch" className="text-xs text-primary hover:underline">Ver todos →</Link>
          </CardHeader>
          <CardContent>
            {(!dispatches || dispatches.length === 0) ? (
              <p className="text-sm text-muted-foreground">Sin despachos registrados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs">
                      <th className="text-left py-2 pr-3 font-medium">Ruta</th>
                      <th className="text-right py-2 px-3 font-medium">Unidades</th>
                      <th className="text-right py-2 px-3 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dispatches.slice(0, 10).map((d: any) => (
                      <tr key={d.id} className="border-b last:border-0">
                        <td className="py-2 pr-3">{d.route_name ?? "—"}</td>
                        <td className="text-right py-2 px-3 tabular-nums">{fmtQty(d.total_units ?? 0)}</td>
                        <td className="text-right py-2 px-3">
                          <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">Activo</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

> **Note on dispatches data:** `listDispatchesToday` from `dispatches.functions.ts` returns today's dispatches and has its own API shape. Check its return type and adapt the table columns (`d.route_name`, `d.total_units`, etc.) to match what it actually returns. If the field names differ, map them accordingly.

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/cashier-dashboard.tsx
git commit -m "feat(dashboard): add CashierDashboard with 4 KPIs, payment bar, pending tables"
```

---

## Task 9: Wire up the role dispatcher in `/app/index.tsx`

**Files:**
- Modify: `src/routes/_authenticated/app/index.tsx`

- [ ] **Step 1: Replace the entire file with the role dispatcher**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyContext } from "@/lib/api/context.functions";
import { OwnerDashboard } from "@/components/admin/owner-dashboard";
import { SupervisorDashboard } from "@/components/admin/supervisor-dashboard";
import { CashierDashboard } from "@/components/admin/cashier-dashboard";

export const Route = createFileRoute("/_authenticated/app/")({
  component: Dashboard,
});

function Dashboard() {
  const fn = useServerFn(getMyContext);
  const { data: ctx } = useQuery({
    queryKey: ["myContext"],
    queryFn: () => fn(),
    staleTime: Infinity,
  });

  const role = ctx?.primaryRole;

  if (role === "owner") return <OwnerDashboard />;
  if (role === "supervisor") return <SupervisorDashboard />;
  // cashier and any other admin role
  return <CashierDashboard />;
}
```

> The `["myContext"]` query was already fetched by the parent route's loader (`route.tsx` line 36–38), so this read is instant from cache — no extra network call.

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Smoke test in browser**

Open `/app` in the browser as owner, supervisor, and cashier accounts. Verify:
- Owner sees 6 KPI cards + 4 charts + driver table
- Supervisor sees 5 KPI cards + 2 charts + driver table
- Cashier sees 4 KPI cards + payment bar + 2 tables
- Period picker works for all 5 options
- Branch switcher is only visible for owner

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authenticated/app/index.tsx
git commit -m "feat(dashboard): wire role dispatcher — owner/supervisor/cashier get distinct dashboards"
```

---

## Task 10: Enhanced Driver Overview

**Files:**
- Modify: `src/routes/_authenticated/driver/overview.tsx`

- [ ] **Step 1: Replace the driver overview with the new 4-box layout**

```tsx
import {
  ArrowLeftRightIcon,
  BanknoteIcon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  CreditCardIcon,
  Loading03Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  listTodayDeliveries,
  listTodayPayments,
  listTodayExpenses,
  getMyRouteToday,
} from "@/lib/api/driver.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { DeliverySheet } from "@/components/driver/delivery-sheet";
import { fmtMoney } from "@/lib/format";
import { type Period, type DateRange, useDashboardPeriod } from "@/hooks/use-dashboard-period";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/driver/overview")({
  component: Page,
});

const STATUS_META = {
  delivered: { label: "Entregado", cls: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: CheckmarkCircle02Icon },
  pending: { label: "Pendiente", cls: "bg-amber-100 text-amber-800 border-amber-200", icon: Clock01Icon },
  failed: { label: "Fallido", cls: "bg-rose-100 text-rose-800 border-rose-200", icon: CancelCircleIcon },
};

const METHOD_LABEL: Record<string, string> = { cash: "Efectivo", transfer: "Transfer.", credit: "Crédito", other: "Otro" };
const METHOD_ICON: Record<string, typeof BanknoteIcon> = { cash: BanknoteIcon, transfer: ArrowLeftRightIcon, credit: CreditCardIcon, other: MoreHorizontalIcon };

/** Simple pill tab strip for Día / Semana only */
function DriverPeriodPicker({ period, onPeriodChange }: { period: Period; onPeriodChange: (p: Period) => void }) {
  return (
    <div className="flex rounded-lg border bg-muted p-0.5 gap-0.5 w-fit">
      {(["day", "week"] as Period[]).map((p) => (
        <button
          key={p}
          onClick={() => onPeriodChange(p)}
          className={cn(
            "rounded-md px-3 py-1 text-sm font-medium transition-colors",
            period === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {p === "day" ? "Día" : "Semana"}
        </button>
      ))}
    </div>
  );
}

/** Circular SVG progress ring */
function ProgressRing({ value, max, size = 80 }: { value: number; max: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const dash = circ * pct;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} className="stroke-muted" strokeWidth={6} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke="hsl(var(--primary))" strokeWidth={6} fill="none"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <span className="absolute text-sm font-bold tabular-nums">
        {max > 0 ? `${Math.round(pct * 100)}%` : "—"}
      </span>
    </div>
  );
}

function Page() {
  const { period, setPeriod, currentRange } = useDashboardPeriod("day");

  const fetchDeliveries = useServerFn(listTodayDeliveries);
  const fetchPayments = useServerFn(listTodayPayments);
  const fetchExpenses = useServerFn(listTodayExpenses);
  const fetchRoute = useServerFn(getMyRouteToday);

  const rangeData = { data: { date_from: currentRange.from, date_to: currentRange.to } };

  const { data: deliveries, isLoading: loadingDel } = useQuery({
    queryKey: ["driver", "deliveries", currentRange],
    queryFn: () => fetchDeliveries(rangeData),
  });
  const { data: payments, isLoading: loadingPay } = useQuery({
    queryKey: ["driver", "payments", currentRange],
    queryFn: () => fetchPayments(rangeData),
  });
  const { data: expenses, isLoading: loadingExp } = useQuery({
    queryKey: ["driver", "expenses", currentRange],
    queryFn: () => fetchExpenses(rangeData),
  });
  const { data: route } = useQuery({
    queryKey: ["driver", "myRouteToday"],
    queryFn: () => fetchRoute(),
  });

  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);

  const isLoading = loadingDel || loadingPay || loadingExp;

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Icon icon={Loading03Icon} className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const rows = deliveries ?? [];
  const pays = payments ?? [];
  const exps = expenses ?? [];

  const delivered = rows.filter((r) => r.status === "delivered");
  const failed = rows.filter((r) => r.status === "failed");
  const totalRoute = route?.customers.length ?? 0;

  // Financials
  const totalSold = delivered.reduce((s, r) => s + r.total, 0);
  const totalReturned = delivered.reduce((s, r) => s + (r.return_amount ?? 0), 0);
  const totalExpenses = exps.reduce((s, e) => s + e.amount, 0);
  const saldoALiquidar = totalSold - totalReturned - totalExpenses;

  const totalPaid = pays.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const byMethod: Record<string, number> = {};
  for (const p of pays) {
    if (p.status === "paid") byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;
  }

  const canEdit = (customerId: string) => !!route?.customers.find((c) => c.id === customerId);

  return (
    <div className="space-y-4 pb-4">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold">
          {period === "day" ? "Resumen de hoy" : "Resumen de la semana"}
        </h1>
        <DriverPeriodPicker period={period} onPeriodChange={setPeriod} />
      </div>

      {/* 4-box financials */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground mb-0.5">Vendido</div>
            <div className="text-2xl font-bold tabular-nums text-primary">{fmtMoney(totalSold)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground mb-0.5">Devuelto</div>
            <div className={cn("text-2xl font-bold tabular-nums", totalReturned > 0 ? "text-amber-600" : "")}>
              {fmtMoney(totalReturned)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground mb-0.5">Gastos</div>
            <div className={cn("text-2xl font-bold tabular-nums", totalExpenses > 0 ? "text-rose-600" : "")}>
              {fmtMoney(totalExpenses)}
            </div>
          </CardContent>
        </Card>
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4">
            <div className="text-xs font-medium text-primary mb-0.5">Saldo a liquidar</div>
            <div className="text-2xl font-bold tabular-nums text-primary">{fmtMoney(saldoALiquidar)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">vendido − devuelto − gastos</div>
          </CardContent>
        </Card>
      </div>

      {/* Progress ring */}
      {totalRoute > 0 && (
        <Card>
          <CardContent className="py-4 flex items-center gap-4">
            <ProgressRing value={delivered.length} max={totalRoute} size={72} />
            <div>
              <div className="font-semibold text-sm">{delivered.length} de {totalRoute} entregas</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {totalRoute - delivered.length - failed.length} pendientes · {failed.length} fallidas
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment method bar */}
      {pays.length > 0 && (
        <Card>
          <CardContent className="py-4 space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cobros por método</div>
            <div className="space-y-1.5">
              {Object.entries(byMethod).map(([method, amount]) => {
                const pct = totalPaid > 0 ? (amount / totalPaid) * 100 : 0;
                return (
                  <div key={method} className="space-y-0.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Icon icon={METHOD_ICON[method] ?? BanknoteIcon} className="h-4 w-4" />
                        {METHOD_LABEL[method] ?? method}
                      </span>
                      <span className="font-semibold tabular-nums">
                        {fmtMoney(amount)} <span className="text-muted-foreground font-normal text-xs">({Math.round(pct)}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity list */}
      <div className="space-y-1">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">Actividad</div>
        {rows.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {period === "day" ? "Aún no registras entregas hoy." : "Sin entregas esta semana."}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const meta = STATUS_META[r.status] ?? STATUS_META.pending;
              const pay = pays.find((p) => p.customer_id === r.customer_id);
              const editable = canEdit(r.customer_id);
              return (
                <Card
                  key={r.id}
                  className={editable ? "cursor-pointer hover:bg-accent/40 transition-colors" : ""}
                  onClick={() => editable && setSelected({ id: r.customer_id, name: r.customer_name ?? "" })}
                >
                  <CardContent className="py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{r.customer_name}</span>
                        <Badge variant="outline" className={`${meta.cls} shrink-0`}>
                          <Icon icon={meta.icon} className="h-3 w-3 mr-1" />
                          {meta.label}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                        {r.units > 0 && (
                          <span className="tabular-nums">{r.units} u · {fmtMoney(r.total)}</span>
                        )}
                        {pay && (
                          <span className="flex items-center gap-1">
                            <Icon icon={METHOD_ICON[pay.method] ?? BanknoteIcon} className="h-3 w-3" />
                            {METHOD_LABEL[pay.method] ?? pay.method}
                            {pay.status === "pending" && <span className="ml-1 text-amber-600 font-medium">· Pendiente</span>}
                          </span>
                        )}
                        {r.comment && <span className="line-clamp-1 italic text-muted-foreground/70">{r.comment}</span>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <DeliverySheet
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        customer={selected}
      />
    </div>
  );
}
```

> **Note on `return_amount`:** The `listTodayDeliveries` function was updated in Task 2 to return `return_amount`. If the `deliveryNetTotals` function doesn't expose `returnAmount`, set `return_amount: 0` in Task 2's implementation and add a separate pass to compute it from `delivery_returns`. Check `src/lib/delivery-totals.ts` to see what `deliveryNetTotals` actually returns.

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Smoke test driver in browser**

Open `/driver/overview` as a driver. Verify:
- 4-box grid shows Vendido / Devuelto / Gastos / Saldo a liquidar
- Progress ring shows delivery count
- Day/Semana toggle works and refetches data
- Activity list still works and DeliverySheet opens

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authenticated/driver/overview.tsx
git commit -m "feat(driver): redesign overview with financial breakdown, progress ring, period picker"
```

---

## Final Verification

- [ ] **Full build check**

```bash
npm run build
```

Expected: 0 errors, successful build output.

- [ ] **Manual QA checklist**

| Check | Pass? |
|---|---|
| Owner: 6 KPI cards visible with % deltas |  |
| Owner: Sales trend line chart shows 2 lines |  |
| Owner: Driver bar chart shows horizontal bars |  |
| Owner: Products bar chart shows top 8 |  |
| Owner: Payment methods donut renders |  |
| Owner: Driver table links to `/app/deliveries` |  |
| Owner: Branch switcher changes all data |  |
| Owner: Period picker — all 5 options work |  |
| Supervisor: 5 KPI cards visible |  |
| Supervisor: Stacked bar shows Entregado/Fallido/Pendiente |  |
| Supervisor: Driver comparison chart renders |  |
| Cashier: 4 KPI cards visible |  |
| Cashier: Payment method bars show % labels |  |
| Cashier: Pending payments table shows data |  |
| Driver: 4-box grid shows Vendido/Devuelto/Gastos/Saldo |  |
| Driver: Progress ring renders with correct % |  |
| Driver: Día/Semana toggle refetches correctly |  |
| Mobile: All admin dashboards stack correctly |  |
| Mobile: Driver layout unchanged and works |  |

- [ ] **Final commit if needed**

```bash
git add -A
git commit -m "feat: dashboard redesign — role-specific layouts with period comparison"
```
