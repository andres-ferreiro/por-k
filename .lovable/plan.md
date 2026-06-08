
# Panadería Ops — Plan v1 (esqueleto)

App web multi-sucursal para panaderías con reparto en rutas. Español, tema claro, fuente Manrope, color de marca `#1c2539` con texto blanco encima.

## Enfoque general

- **Stack**: TanStack Start (ya configurado) + Lovable Cloud (Supabase gestionado) para auth, base de datos, storage de fotos y RLS.
- **Aislamiento de datos por sucursal** desde el día uno, vía RLS y una tabla de roles separada (nunca rol en `profiles`).
- **Dos shells** separados según rol al hacer login:
  - `/app/*` → experiencia admin (sidebar, escritorio) para owner / supervisor / cashier.
  - `/driver/*` → experiencia móvil para driver (instalable estilo PWA-lite más adelante; por ahora layout móvil grande y táctil).
- **CRUD real solo para 3 cosas** en esta v1: Sucursales, Usuarios, Catálogo. Todo lo demás: páginas navegables con título + empty state.

## Roles y acceso

Roles (enum `app_role`): `owner`, `supervisor`, `cashier`, `driver`.

| Rol         | Ve                                          | Shell    |
|-------------|---------------------------------------------|----------|
| owner       | Toda la empresa, todas las sucursales       | admin    |
| supervisor  | Solo su sucursal                            | admin    |
| cashier     | Solo su sucursal (movimiento de producto)   | admin    |
| driver      | Solo su ruta/entregas/pagos/gastos          | móvil    |

Menú lateral del admin se adapta al rol: cashier ve Despacho/Devoluciones; supervisor ve todo de su sucursal; owner ve Sucursales y Usuarios además.

Tras login, redirección automática al shell correcto. Driver intentando entrar al admin → redirigido a `/driver`, y viceversa.

## Modelo de datos (alto nivel)

Todo en `public.*`, RLS activo, GRANTs explícitos. Fotos en Storage bucket privado `bakery-photos/` con políticas por sucursal.

- `branches` — sucursales de la empresa.
- `profiles` — 1:1 con `auth.users`, datos básicos (nombre, teléfono, `branch_id`, `is_active`). **Sin rol aquí.**
- `user_roles` — `(user_id, role)` único; usa función `has_role(uid, role)` SECURITY DEFINER para evitar recursión RLS.
- `products` — catálogo compartido por la empresa (seed: Pan dulce, Pan blanco, Tortilla de maíz, Tortilla de harina, Frijoles).
- `customers` — nombre, contacto, lat/lng, `photo_url`, `branch_id`.
- `routes` — `branch_id`, `driver_id`, nombre.
- `route_customers` — pivot orden de visita.
- `dispatches` — despacho diario (`route_id`, fecha, estado).
- `dispatch_items` — producto + cantidad que sale.
- `deliveries` — `dispatch_id`, `customer_id`, estado (`delivered`/`pending`/`failed`), comentario, `photo_url`.
- `payments` — `delivery_id`, monto, tipo (`cash`/`transfer`/`credit`/`other`), estado.
- `returns` — devoluciones por despacho/producto.
- `expenses` — `dispatch_id`/`driver_id`, monto, descripción, `photo_url`.

Solo se **crea ahora** lo necesario para v1: `branches`, `profiles`, `user_roles`, `products`, y las tablas vacías mínimas referenciadas por placeholders. Resto se modela pero se completa después.

### RLS resumen

- `has_role(uid, 'owner')` → acceso total.
- Supervisor/cashier: filtro por `branch_id = (select branch_id from profiles where id = auth.uid())`.
- Driver: filtro por sus propias rutas (`routes.driver_id = auth.uid()`).
- `products`: lectura para todos los autenticados; escritura solo owner.
- `user_roles`: lectura solo del propio usuario + owner; escritura solo owner (vía server function con `supabaseAdmin`).

## Pantallas

### Admin shell (`/app`)
Sidebar con: Sucursales (owner), Usuarios (owner), Catálogo (owner), Clientes, Rutas, Despacho, Entregas, Pagos, Gastos, Reportes. Header con nombre + logout.

- **Sucursales** (CRUD real): listar, crear, editar, activar/desactivar.
- **Usuarios** (CRUD real): listar, invitar (crear con email+password vía server fn admin), asignar rol + sucursal, activar/desactivar.
- **Catálogo** (CRUD real): listar, crear, editar, activar/desactivar productos.
- Resto: página con título + empty state ("Próximamente" / "Sin datos todavía").

### Driver shell (`/driver`)
Layout móvil (max-width, botones grandes). Tabs inferiores: Mi ruta, Entregas, Pagos, Gastos. Todas placeholder excepto el saludo + nombre del driver.

## Look & feel

- Tema claro shadcn, fuente **Manrope** cargada vía `<link>` en `__root.tsx`.
- Token de marca en `src/styles.css`: `--primary: oklch(...)` equivalente a `#1c2539`, `--primary-foreground` blanco.
- Acento usado en sidebar activo, botones primarios, header del driver.
- Resto neutral (grises/blancos shadcn por defecto).

## Detalles técnicos

- **Auth**: email/password (Lovable Cloud). Página `/auth` pública con login + (oculto tras owner) creación de usuarios. Sin password reset en v1 (placeholder).
- **Rutas protegidas**: `_authenticated/` gestionado por la integración. Subcarpetas `_authenticated/app/` y `_authenticated/driver/` con `beforeLoad` que verifica rol vía server fn y redirige al shell correcto.
- **Server functions** (`createServerFn` + `requireSupabaseAuth`):
  - `getMyContext()` → devuelve rol(es), branch_id, perfil.
  - `listBranches`, `createBranch`, `updateBranch`.
  - `listUsers`, `createUser` (usa `supabaseAdmin.auth.admin.createUser` + asigna rol + branch), `updateUserRole`, `setUserActive`.
  - `listProducts`, `createProduct`, `updateProduct`.
- **Seed**: migración inserta los 5 productos iniciales.
- **Storage**: bucket `bakery-photos` creado pero sin uploads en v1 (se usará después para customers/deliveries/expenses).

## Diagrama de navegación

```text
/auth ──login──┬─► owner/supervisor/cashier ─► /app  ─► (sidebar adaptado al rol)
               └─► driver ─────────────────► /driver ─► (tabs móviles)
```

## Criterios de "hecho" para v1

- Login → redirige al shell correcto según rol.
- Owner crea sucursales, crea usuarios con rol+sucursal, gestiona productos.
- Supervisor/cashier solo ve datos de su sucursal (verificado vía RLS).
- Driver solo accede a `/driver`.
- Todas las demás pantallas existen navegables como placeholders.
- 5 productos seed presentes.

## Fuera de alcance (para después)

Lógica real de despacho, entregas, pagos, devoluciones, gastos, reportes; subida de fotos; mapas en vivo; pasarelas de pago; notificaciones; PWA instalable real.

---

¿Procedo a construir esta v1, o quieres ajustar algo (roles, nombres de menú, alcance del CRUD inicial)?
