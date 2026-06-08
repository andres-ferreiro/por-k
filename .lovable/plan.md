
# Clientes y Rutas — v1

Construir CRUD real de **Clientes** y **Rutas** para owner y supervisor, con aislamiento estricto por sucursal vía RLS. Sin tocar entregas ni pagos.

## Base de datos (migración)

Nuevas tablas en `public.*` (todas con `branch_id`, RLS, GRANTs, `updated_at` trigger):

- `customers`
  - `id`, `branch_id` (FK branches, NOT NULL), `name`, `phone`, `address`, `lat numeric`, `lng numeric`, `photo_url text`, `notes`, `is_active`, timestamps.
- `routes`
  - `id`, `branch_id` (FK, NOT NULL), `name`, `driver_id uuid` (FK profiles, NULLable), `is_active`, timestamps.
- `route_customers` (pivot ordenado)
  - `route_id`, `customer_id`, `position int`, PK compuesta (`route_id`,`customer_id`), unique (`route_id`,`position`).

**RLS** (helper existente `current_branch_id()` + `has_role`):
- owner: acceso total.
- supervisor: solo filas con `branch_id = current_branch_id()`. Puede insertar/editar/borrar dentro de su sucursal.
- cashier/driver: sin acceso de escritura; lectura de `routes`/`route_customers` solo para driver de su propia ruta (opcional, se afina luego).
- `route_customers`: gating vía `EXISTS (select 1 from routes where id = route_id and (owner or branch))`.

**Storage**: bucket privado `customer-photos` con policies:
- INSERT/SELECT/UPDATE/DELETE permitidos a `authenticated` cuyo `branch_id` del path (primer segmento = `branch_id`) coincida con `current_branch_id()`, u owner.
- Convención de path: `{branch_id}/{customer_id}/{uuid}.jpg`.

## Server functions (`src/lib/api/`)

`customers.functions.ts`:
- `listCustomers()` — lee con RLS, ordena por nombre.
- `createCustomer({ name, phone?, address?, lat?, lng?, notes?, photo_url?, branch_id? })` — supervisor usa su branch; owner debe pasar `branch_id`.
- `updateCustomer({ id, ...patch })`.
- `deleteCustomer({ id })` — borra y limpia foto del storage.
- `getUploadUrl({ customer_id })` — devuelve signed upload URL al bucket (path determinístico) para subir desde el cliente.

`routes.functions.ts`:
- `listRoutes()` — incluye driver (`profiles.full_name`) y conteo de clientes.
- `getRoute({ id })` — incluye lista ordenada de clientes.
- `createRoute({ name, driver_id?, branch_id? })`.
- `updateRoute({ id, name?, driver_id?, is_active? })`.
- `deleteRoute({ id })`.
- `setRouteCustomers({ route_id, customer_ids: string[] })` — reemplaza pivot con orden dado (transacción sencilla: delete + insert).
- `listBranchDrivers({ branch_id? })` — lista profiles con rol `driver` de la sucursal correspondiente, para el selector.

Todas usan `requireSupabaseAuth` con cliente RLS-aware (no admin), excepto subida que firma URL con admin.

## UI

### `/app/customers` (reemplazo del placeholder)
- Tabla: foto (avatar redondo), nombre, teléfono, dirección, ubicación (✓ si tiene lat/lng), acciones.
- Botón **"Nuevo cliente"** → dialog con:
  - Nombre, teléfono, dirección, notas.
  - **Foto**: input file → subir vía signed URL → guardar `photo_url`. Preview antes de guardar.
  - **Ubicación**: mapa interactivo (Google Maps JS API con `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`). Click en mapa fija marker; campo de búsqueda con `PlaceAutocompleteElement`. Si no hay key, fallback a inputs numéricos lat/lng.
  - Si owner: select de sucursal.
- Editar = mismo dialog precargado. Eliminar = confirmación.

### `/app/routes` (reemplazo del placeholder)
- Tabla: nombre, repartidor asignado, # clientes, acciones.
- Botón **"Nueva ruta"** → dialog: nombre, select de repartidor (drivers de la sucursal), (owner: sucursal).
- Click en una ruta → vista de detalle (`/app/routes/$routeId`):
  - Encabezado editable (nombre, repartidor).
  - **Clientes en la ruta** (lista ordenada con drag-to-reorder simple usando flechas ↑↓ — sin libs externas).
  - **Agregar clientes**: panel lateral con clientes disponibles de la sucursal, checkbox para añadir.
  - Guardar → `setRouteCustomers`.

## Aislamiento por sucursal

- RLS hace el trabajo pesado: supervisor nunca ve datos de otra sucursal aunque manipule la red.
- Server fns nunca aceptan `branch_id` de supervisor (se ignora y se usa `current_branch_id`).
- Owner sí pasa `branch_id` explícito y se valida que exista.

## Mapa (detalle técnico)

Usar el conector Google Maps ya disponible. Cargar Maps JS API async con callback global, sin `mapId`, marker clásico (`google.maps.Marker`). Place Autocomplete con `AutocompleteSuggestion.fetchAutocompleteSuggestions` (API New). Componente reutilizable `<LocationPicker value={{lat,lng}} onChange={...} />` en `src/components/location-picker.tsx`.

## Fuera de alcance

- Drag&drop con librería externa (usar ↑↓ por ahora).
- Reasignación masiva de clientes entre rutas.
- Histórico de rutas/clientes.
- Entregas, pagos, gastos — intactos.

## Orden de ejecución

1. Migración (tablas + RLS + GRANTs + bucket + policies storage).
2. Server fns customers + routes.
3. Componente `LocationPicker`.
4. Página `/app/customers` (lista + dialog).
5. Página `/app/routes` (lista + dialog) + ruta detalle `/app/routes/$routeId`.
6. Verificar en preview con usuario supervisor.
