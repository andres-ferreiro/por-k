
# Páginas faltantes + auditoría por rol

Hoy hay 5 páginas del panel admin que solo muestran un placeholder, y el dashboard de Inicio tiene "—" en todos los KPIs. Voy a construirlas con datos reales y de paso revisar que cada rol vea lo que le corresponde.

## 1. Páginas a construir (admin: `/app/*`)

### `/app` — Inicio (dashboard del día)
KPIs del día (timezone Cd. Juárez), filtrados por sucursal del usuario (owner ve todas):
- Despachos hoy · unidades cargadas
- Entregas: entregadas / pendientes / fallidas
- Ventas del día ($) y unidades vendidas
- Cobros del día ($) por método (efectivo/transferencia/crédito)
- Gastos del día ($)
- **Neto en caja** = cobros efectivo − gastos
- Lista corta de repartidores activos hoy con su mini-resumen (vendido / cobrado / pendiente)

### `/app/deliveries` — Entregas
Tabla con filtros: fecha (default hoy), ruta, repartidor, estado.
Columnas: hora, cliente, ruta, repartidor, estado, #productos, total $, cobro (método/estado).
Click en fila → diálogo con detalle (items vendidos, devoluciones, foto, comentario, pago ligado).
Acceso: owner + supervisor.

### `/app/payments` — Pagos
Tabla con filtros: fecha (default hoy), ruta, repartidor, método, estado, origen (venta-entrega vs abono manual).
Columnas: hora, cliente, ruta, repartidor, monto, método, estado, badge "Venta entrega" si tiene `delivery_id`.
Totales arriba: total cobrado, por método, pendientes.
Acceso: owner + supervisor + cashier.

### `/app/expenses` — Gastos
Tabla con filtros: fecha, ruta, repartidor.
Columnas: fecha, repartidor, ruta, descripción, monto, foto (miniatura).
Total del periodo arriba.
Acceso: owner + supervisor + cashier.

### `/app/reports` — Reportes
Selector de rango (hoy / ayer / últimos 7 / mes actual / custom) + filtros opcionales por ruta/repartidor:
1. **Ventas por producto** — unidades vendidas, devueltas a clientes, monto $.
2. **Ventas por repartidor** — vendido $, cobrado $, pendiente $, gastos $, neto.
3. **Ventas por cliente** — top clientes por monto y visitas.
4. **Reconciliación del rango** — mismo cálculo `cargado − vendido + devuelto = en camión` agregado al rango (el card diario ya vive en Despacho).
Botón "Exportar CSV" por cada sección.
Acceso: owner + supervisor.

## 2. Server functions nuevas (`src/lib/api/admin.functions.ts`)

Todas con `requireSupabaseAuth`, validación zod, scope a `current_branch_id()` salvo owner sin sucursal.

- `getDashboardSummary({ date })`
- `listDeliveriesAdmin({ date_from, date_to, route_id?, driver_id?, status? })`
- `getDeliveryDetailAdmin({ id })`
- `listPaymentsAdmin({ date_from, date_to, route_id?, driver_id?, method?, status?, origin? })`
- `listExpensesAdmin({ date_from, date_to, route_id?, driver_id? })`
- `reportSalesByProduct({ date_from, date_to, route_id?, driver_id? })`
- `reportSalesByDriver({ date_from, date_to })`
- `reportSalesByCustomer({ date_from, date_to, limit })`

Reusar `tzDayRange` para conversión de fecha local→UTC.

## 3. Auditoría de funcionalidad (lo que reviso y corrijo si falla)

### Cálculos
- Total entrega = Σ `delivery_items.line_total` (ya está como columna generated). Confirmar.
- Pago auto-generado solo si `status='delivered'` y total>0. Si el repartidor cambia a fallido, se borra el pago ligado.
- "Pendientes" = `payments.status='pending'` + entregas entregadas sin pago.
- Reconciliación: `cargado − vendido + devuelto_clientes = en camión` (negativo = descuadre, marcado en rojo).
- Neto en caja = Σ `payments where method='cash' and status='paid'` − Σ `expenses`.

### Acceso por rol (sidebar + rutas)
Comprobación contra `src/routes/_authenticated/app/route.tsx`:
- **Owner**: todo.
- **Supervisor**: todo menos Sucursales/Usuarios/Catálogo.
- **Cashier**: Inicio, Despacho, Pagos, Gastos. NO Entregas, NO Reportes (configuración actual). → **Lo dejo así** salvo que pidas distinto.
- **Driver**: redirige a `/driver`, nunca entra a `/app`.

### Driver app
Verifico que: pago automático se cree al guardar venta entregada; tabs de entregas/pagos/gastos cargan correctamente; foto sube; devoluciones se guardan; timezone Cd. Juárez en fechas/horas.

### Despacho
La reconciliación diaria ya está. Confirmo que cashier la ve.

## 4. Detalles técnicos

- Patrón datos: `createServerFn` + `useServerFn` + `useQuery` (no `useEffect` + fetch). Loaders quedan vacíos para evitar fetch en SSR de rutas autenticadas.
- Fechas con `<Input type="date">` y `todayInTZ()` como default.
- Tablas con `@/components/ui/table`. Filtros en barra superior.
- Botones Exportar CSV usan `Blob` + `URL.createObjectURL` en cliente, generados a partir del resultado de la query.
- Sin nuevas migraciones; toda la data ya existe.

## 5. Fuera de alcance

- Edición de entregas/pagos/gastos desde admin (solo lectura + ver detalle). El repartidor sigue siendo la fuente.
- Gráficas (todo en tablas y stat cards por ahora).
- Reportes por sucursal cruzados para owner multi-sucursal: filtro por sucursal solo si pides explícitamente.

## 6. Orden de trabajo

1. `admin.functions.ts` con las 8 funciones.
2. `/app` dashboard.
3. `/app/payments` (más simple, valida patrón).
4. `/app/expenses`.
5. `/app/deliveries` + diálogo de detalle.
6. `/app/reports` con 4 secciones + export CSV.
7. Recorrido manual: login como cashier, supervisor, owner, driver — confirmar accesos y números.
