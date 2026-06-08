# Driver Mobile Experience (PWA)

Build a fast, phone-first experience for the driver role, installable from the browser. Reuses the existing `/driver` shell (bottom-tab nav, max-w-md, already gated by role).

## What the driver gets

### 1. "Mi ruta" (`/driver`)
- Header: today's date + assigned route name + branch.
- Big card showing route progress: `X / N entregadas` with a progress bar.
- Ordered list of customers (by `route_customers.position`), each as a tappable card showing:
  - Name, phone (tap to call), address.
  - Status badge: pendiente / entregado / fallido (color-coded).
  - "Ubicación" link → opens Google Maps with `lat,lng` (or address fallback).
  - Quick action buttons: **Entregar**, **Pago**, **Gasto** (the last opens the expenses tab pre-filled with today).
- Empty state when driver has no route assigned.

### 2. Entrega (delivery) flow
Triggered from a customer card → opens a bottom sheet (`Drawer`):
- Status: Entregado (default) / Pendiente / Fallido — large segmented buttons.
- Comentario (textarea, optional).
- Foto de evidencia (optional): one-tap camera button using `<input type="file" accept="image/*" capture="environment">`. Preview thumbnail + remove. Uploaded to a new private `delivery-photos` bucket at `{driver_id}/{delivery_id}.jpg`.
- Guardar → upserts on `(route_id, customer_id, delivery_date)`; closes sheet, customer card reflects new status, progress bar updates.

### 3. Pago (`/driver/payments`)
- Sheet flow opened from a customer card OR a "+" FAB on the payments tab (select customer from route list).
- Fields: monto (number), estado (Pagado default / Pendiente), método radio (**Efectivo** preselected, Transferencia, Crédito, Otro), nota (optional).
- Payments tab body: today's totals (por método) + list of today's payments grouped by customer with edit/delete.

### 4. Gasto (`/driver/expenses`)
- "+" FAB opens sheet with: monto, descripción, foto del recibo (same camera input pattern, uploaded to `expense-photos` bucket).
- Tab body: today's total + list of today's expenses with thumbnail.

### 5. Entregas tab (`/driver/deliveries`)
- Today's deliveries grouped by status with counters. Tap any row to re-open its sheet to edit.

## Installable PWA (manifest-only)
- Add `public/manifest.webmanifest` with name, short_name, theme_color matching primary, `display: "standalone"`, `start_url: "/driver"`, icons.
- Generate two app icons (192, 512) in `public/`.
- Add `<link rel="manifest">`, `<meta name="theme-color">`, `<link rel="apple-touch-icon">` in `__root.tsx` head.
- No service worker (no offline requested) — follows the PWA-minimum guidance.

## Technical details

### New tables (migration)
- `deliveries`: `id`, `branch_id`, `route_id`, `customer_id`, `driver_id`, `delivery_date date`, `status` (enum `delivery_status`: pending|delivered|failed), `comment`, `photo_url`, timestamps. Unique `(route_id, customer_id, delivery_date)`.
- `payments`: `id`, `branch_id`, `route_id`, `customer_id`, `driver_id`, `amount numeric`, `status` (paid|pending), `method` (cash|transfer|credit|other), `note`, `paid_at`, timestamps.
- `expenses`: `id`, `branch_id`, `route_id` (nullable), `driver_id`, `amount numeric`, `description`, `photo_url`, `expense_date date`, timestamps.

All tables: `ENABLE RLS`, `GRANT` to `authenticated` + `service_role`. Policies:
- Driver can insert/select/update own rows (`driver_id = auth.uid()`).
- Branch staff (cashier/supervisor) and owner can view rows in their branch via `current_branch_id()`.

### Storage buckets
- `delivery-photos` (private), `expense-photos` (private). RLS on `storage.objects`:
  - Driver can insert/select objects under path prefix `{auth.uid()}/...`.
  - Branch staff can select for their branch (via joined row lookup — simplified to "authenticated of same branch can read all" via a helper, or keep driver-scoped only and signed-URL the photo through a server fn). Simpler: driver-only RW; reads for other roles go through `getDeliveryPhotoUrl` server fn using `supabaseAdmin` + signed URL.

### Server functions (`src/lib/api/driver.functions.ts`)
- `getMyRouteToday()` → route + ordered customers + today's delivery status map.
- `upsertDelivery({ customer_id, status, comment, photo_path? })`.
- `listTodayDeliveries()` / `listTodayPayments()` / `listTodayExpenses()`.
- `createPayment({...})`, `createExpense({...})`.
- `getSignedPhotoUrl({ bucket, path })` (for re-display in edit sheet).
- All use `requireSupabaseAuth`; resolve `branch_id` from `profiles`.

### UI files
- Rewrite `src/routes/_authenticated/driver/index.tsx` (Mi ruta).
- Rewrite `src/routes/_authenticated/driver/deliveries.tsx`, `payments.tsx`, `expenses.tsx`.
- New shared sheets: `src/components/driver/delivery-sheet.tsx`, `payment-sheet.tsx`, `expense-sheet.tsx`, `photo-capture.tsx`.
- Use `vaul` `Drawer` (already installed) for bottom sheets; `Input`, `Textarea`, `RadioGroup`, `Badge`, `Button`.

### Order of work
1. Migration (tables, enums, RLS, grants).
2. Storage buckets (tool call) + storage RLS policies.
3. Server functions.
4. PWA manifest + icons + head tags.
5. UI: Mi ruta + delivery sheet → payments → expenses → deliveries tab.
6. Manual verification with a driver account.

## Out of scope
- Offline mode / service worker (only manifest installability).
- Returns, inventory adjustments.
- Push notifications.
- Editing past-day records (only today is mutable from driver UI).
