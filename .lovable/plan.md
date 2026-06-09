# Branch Switcher in Admin Navbar

Add a dropdown in the admin shell's top header that lets the user switch between **"Toda la empresa"** (all branches combined) and a specific branch. All admin pages (Inicio, Despacho, Entregas, Pagos, Gastos, Reportes) re-query using the selected branch.

## Who sees it

- **Owner**: full switcher (All + every branch). Owners have unrestricted RLS, so filtering is done server-side by `branch_id` when a branch is selected.
- **Supervisor / Cashier**: switcher hidden; instead show a read-only chip with their own branch name (their RLS already scopes them — no choice to make).
- **Driver**: not applicable (lives in `/driver`).

## UX

In `src/routes/_authenticated/app/route.tsx` header (replaces the current static branch text):

```text
[≡] [ Sucursal: ▾ Toda la empresa ]      (owner)
[≡] [ Sucursal: Centro ]                  (supervisor/cashier — read-only)
```

- Component: shadcn `Select` (Toda la empresa + branches from `listBranches`).
- Selection persisted to `localStorage("app.viewBranchId")` so it survives reloads/navigation.
- Exposed app-wide via a tiny `BranchScopeContext` (`{ branchId: string | null, setBranchId }`).
- Changing it invalidates the React Query cache so every page refetches.

## Server-side scoping

Add an optional `branchId: string | null` input to every admin server fn so owners can narrow results. RLS already covers staff.

Functions to update in `src/lib/api/admin.functions.ts`:
- `getDashboardSummary`
- `listDeliveriesAdmin`, `getDeliveryDetailAdmin`
- `listPaymentsAdmin`
- `listExpensesAdmin`
- `reportSalesByProduct`, `reportSalesByDriver`, `reportSalesByCustomer`

Also update `getTruckReconciliation` in `src/lib/api/dispatches.functions.ts`.

Implementation: when `branchId` is provided, add `.eq("branch_id", branchId)` to each base query (dispatches, deliveries, payments, expenses). When `null`, no extra filter (owners see all; staff are RLS-scoped anyway).

## Client wiring

- New `src/lib/branch-scope.tsx` — React context + `useBranchScope()` hook + `<BranchScopeProvider>` that reads/writes localStorage.
- Wrap the admin `<Outlet />` in `BranchScopeProvider` inside `_authenticated/app/route.tsx`.
- New `src/components/admin/branch-switcher.tsx` — renders the Select for owners, plain chip for staff. Uses `listBranches` via `useQuery`.
- Update every admin page's `useQuery` to include `branchId` in the query key and pass it as input. Pattern:

```ts
const { branchId } = useBranchScope();
const { data } = useQuery({
  queryKey: ["dashboard", date, branchId],
  queryFn: () => fetchSummary({ data: { date, branchId } }),
});
```

## Out of scope

- No DB migrations (RLS unchanged).
- Branch switcher does NOT affect Sucursales/Usuarios/Catálogo/Clientes/Rutas admin pages (those are entity-management screens, not data dashboards).
- No multi-branch comparison view (just All vs single).

## Files touched

- new: `src/lib/branch-scope.tsx`, `src/components/admin/branch-switcher.tsx`
- edit: `src/routes/_authenticated/app/route.tsx` (header + provider)
- edit: `src/lib/api/admin.functions.ts` (add `branchId` param to 7 fns)
- edit: `src/lib/api/dispatches.functions.ts` (add `branchId` to `getTruckReconciliation`)
- edit: `src/routes/_authenticated/app/{index,deliveries,payments,expenses,reports,dispatch}.tsx` (consume `useBranchScope`, add to query keys)
