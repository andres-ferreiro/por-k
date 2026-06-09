
# Ventas por entrega, precios y devoluciones

Objetivo: el repartidor deja de "registrar pago suelto". En cada visita captura **productos vendidos** y **productos devueltos**; el sistema calcula el total con el precio del cliente (o global) y crea el cobro automáticamente con efectivo por defecto (puede cambiar a transferencia/crédito/pendiente).

## 1. Base de datos (migración)

**products** — agregar:
- `price numeric(12,2) not null default 0` (precio global).

**customer_prices** (nueva) — precios especiales por cliente:
- `customer_id`, `product_id` (PK compuesta), `price numeric(12,2) not null`, timestamps.
- RLS: lectura para staff de la sucursal del cliente + repartidor asignado a una ruta del cliente; escritura para owner/supervisor de la sucursal.
- Configurable desde la ficha del **producto**: lista de clientes con override de precio.

**delivery_items** (nueva) — líneas de venta de la entrega:
- `delivery_id`, `product_id`, `quantity numeric>0`, `unit_price numeric(12,2)` (congelado al guardar), `line_total numeric` (generated `quantity*unit_price`).
- Único `(delivery_id, product_id)`. RLS espejo de `deliveries`.

**delivery_returns** (nueva) — devoluciones registradas en la visita:
- `delivery_id`, `product_id`, `quantity numeric>0`, timestamps. Único `(delivery_id, product_id)`. RLS espejo de `deliveries`.

**payments** — agregar `delivery_id uuid null` (FK) para enlazar el cobro auto-generado a la entrega; cuando el repartidor edita la entrega, el pago se recalcula/reemplaza.

Función helper `get_price_for(customer_id, product_id) → numeric` (security definer): regresa `customer_prices.price` si existe, si no `products.price`.

## 2. Server functions

`src/lib/api/products.functions.ts`:
- `updateProductPrice({id, price})`.
- `listProductCustomerPrices(productId)` → clientes de la sucursal del owner/supervisor + override actual.
- `upsertCustomerPrice({product_id, customer_id, price})`, `deleteCustomerPrice(...)`.

`src/lib/api/driver.functions.ts` — reemplazar `upsertDelivery`:
- `getCustomerPricedProducts(customerId)` → lista de productos activos con `effective_price` resuelto (override o global). Usado por la hoja de entrega.
- `saveDeliveryVisit({ customer_id, status, comment, photo_path?, items:[{product_id, quantity}], returns:[{product_id, quantity}], payment:{ method, status } })`:
  - Upsert `deliveries` (status, comentario, foto).
  - Reemplaza `delivery_items` y `delivery_returns` (delete + insert) con precios congelados desde `get_price_for`.
  - Recalcula total = Σ line_total. Si `status='delivered'` y total>0: upsert un único `payments` row con `delivery_id`=esta entrega, `amount=total`, `method`, `status` (paid|pending). Si total=0 o entrega no fue 'delivered': borra el payment ligado.
- `createPayment` queda solo para abonos manuales sueltos (ej. cliente paga deuda anterior); UI de Pagos sigue funcionando.

## 3. UI

### Productos (`/app/products`, owner)
- Campo **Precio** en alta/edición.
- Botón "Precios por cliente" en cada producto → dialog con lista de clientes (buscable, agrupados por sucursal) y input de precio; vacío = usa precio global.

### Repartidor — hoja de entrega (`delivery-sheet.tsx`, rediseño)
Una sola pantalla, scroll vertical, secciones colapsadas:
1. **Estado**: Entregado (default) / Pendiente / Fallido (igual que hoy).
2. **Productos vendidos** (visible si Entregado): lista de productos del cliente con precio efectivo; el repartidor pone cantidad con stepper +/−. Muestra subtotal por línea y **Total** grande abajo.
3. **Devoluciones de ayer** (colapsable, "Agregar devolución"): mismo stepper sobre productos; no afecta total cobrado, solo se registra.
4. **Cobro** (si Entregado y total>0): chips método (Efectivo default, Transferencia, Crédito, Otro) + toggle Pagado/Pendiente. Muestra "Se cobrará $X".
5. **Comentario** + **Foto** (igual que hoy).
6. **Guardar**: una sola acción que persiste todo y crea/actualiza el pago.

Tarjeta del cliente en `/driver`: el botón "Pago" se reemplaza por "Vender / Entregar" (abre la misma hoja). El FAB "+" en `/driver/payments` queda solo para abonos manuales (cobro de deuda sin entrega del día).

### Entregas/Pagos tabs del repartidor
- Tab entregas: cada fila muestra `#productos · total $X` adicional al status.
- Tab pagos: badge en pagos auto-generados ("Venta entrega"), tap reabre la hoja de entrega.

## 4. Fuera de alcance

- Inventario / stock real (solo cantidades vendidas y devueltas, sin descontar de un stock).
- Reportes agregados de ventas por producto/repartidor (vendrán después).
- Edición de precios congelados en entregas pasadas.
- Historial de cambios de precio.

## 5. Orden de trabajo

1. Migración (price en products, customer_prices, delivery_items, delivery_returns, payments.delivery_id, helper, RLS, grants).
2. Server functions (products + driver).
3. UI productos (precio + dialog overrides).
4. Rediseño `delivery-sheet` con secciones de venta/devolución/cobro.
5. Ajustes en `/driver` (botón) y tabs (info extra).
6. Verificación manual con repartidor.
