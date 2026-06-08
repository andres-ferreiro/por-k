
# Despachos — v1 (cashier)

Permitir al cajero registrar el despacho de producto que sale con un repartidor por ruta, y ver un resumen diario simple de los despachos de su sucursal. Sin devoluciones todavía.

## Base de datos (una migración)

Dos tablas nuevas en `public`, ambas con `branch_id`, RLS, GRANTs y trigger `updated_at`:

- `dispatches`
  - `id`, `branch_id` (FK branches, NOT NULL), `route_id` (FK routes, NOT NULL), `driver_id` (FK profiles, NOT NULL), `dispatched_by` (FK profiles = cajero), `dispatched_at timestamptz default now()`, `notes text`, timestamps.
  - Índices por `(branch_id, dispatched_at desc)` y `(route_id)`.
- `dispatch_items`
  - `id`, `dispatch_id` (FK dispatches ON DELETE CASCADE), `product_id` (FK products), `quantity numeric NOT NULL CHECK (quantity > 0)`, timestamps.
  - Unique (`dispatch_id`, `product_id`) para evitar líneas duplicadas del mismo producto.

**RLS** (helpers existentes `current_branch_id()` + `has_role`):
- owner: acceso total.
- supervisor y cashier: ven y crean filas con `branch_id = current_branch_id()`. Cashier además puede editar/borrar despachos de su sucursal del **día actual** (regla en server fn, no en RLS, para mantener policies simples — RLS permite update/delete por branch).
- driver: solo SELECT de despachos donde `driver_id = auth.uid()` (lectura para futura UI del repartidor).
- `dispatch_items`: gating vía `EXISTS (select 1 from dispatches where id = dispatch_id and <misma regla branch/role>)`.

## Server functions (`src/lib/api/dispatches.functions.ts`)

Todas con `requireSupabaseAuth` y cliente RLS-aware:

- `listRoutesForDispatch()` — rutas activas de la sucursal del usuario con su driver asignado (para precargar el repartidor al elegir ruta).
- `listProductsActive()` — productos activos (id, name, unit).
- `createDispatch({ route_id, driver_id, notes?, items: [{ product_id, quantity }] })` — valida con zod (cantidad > 0, items.length ≥ 1, sin productos repetidos), resuelve `branch_id` desde `current_branch_id`, inserta `dispatches` + `dispatch_items` en orden, devuelve `{ id }`.
- `listDispatchesToday({ date? })` — lista despachos de la sucursal para una fecha (default = hoy en zona local del servidor → usar rango `[date 00:00, date+1 00:00)`); incluye ruta, repartidor, cajero, total de líneas y suma de cantidades.
- `getDispatch({ id })` — encabezado + items con nombre/unit del producto. (Para detalle y futura edición.)

Validación zod estricta en el inputValidator (longitudes, uuid, cantidades).

## UI

Reemplazar el placeholder en `src/routes/_authenticated/app/dispatch.tsx`. Layout en dos columnas en desktop, apilado en mobile:

### Panel izquierdo — Nuevo despacho
- Select **Ruta** (rutas activas de la sucursal).
- Select **Repartidor** — autocompletado con el `driver_id` de la ruta seleccionada; editable por si la ruta no tiene driver asignado (lista de drivers de la sucursal vía `listBranchDrivers` ya existente).
- Tabla de líneas de producto:
  - Cada fila: select de producto + input numérico (cantidad, con unidad mostrada) + botón eliminar.
  - Botón "+ Agregar producto" añade fila vacía.
  - El select filtra productos ya elegidos para evitar duplicados.
- Campo notas opcional.
- Botón **Registrar despacho** → llama `createDispatch`, limpia el formulario, hace toast y refresca el resumen.

### Panel derecho — Resumen del día
- Selector de fecha (default hoy) — input `<input type="date">`.
- Card con totales: # despachos, # rutas distintas, suma total de unidades.
- Lista de despachos del día (orden desc por `dispatched_at`): hora, ruta, repartidor, # líneas, total de unidades, botón "ver" que abre un dialog con el detalle (items y notas) via `getDispatch`.

### Acceso
- La ruta `/app/dispatch` ya está dentro de `_authenticated/app`. Si el usuario no es cashier/supervisor/owner, mostrar mensaje "Sin acceso" (no redirige; coherente con el resto del app shell).

## Aislamiento por sucursal

- RLS hace el trabajo. Server fns nunca aceptan `branch_id` del cliente: siempre usan `current_branch_id()`.
- Cashier no puede registrar despachos en otra sucursal aunque manipule la red.

## Fuera de alcance

- Devoluciones (siguiente iteración).
- Edición/eliminación de despachos desde la UI (el server fn la permitirá pero el botón se añade luego).
- Stock / inventario.
- Pagos y entregas.

## Orden de implementación

1. Migración (tablas + RLS + GRANTs + triggers).
2. `dispatches.functions.ts` con las cinco fns y validación zod.
3. UI `/app/dispatch` (formulario + resumen + dialog de detalle).
4. Verificación manual con usuario cashier: crear despacho, ver resumen, confirmar aislamiento.
