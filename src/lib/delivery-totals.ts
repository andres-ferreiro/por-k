export type DeliveryItemLine = {
  product_id?: string;
  quantity: number;
  unit_price?: number | null;
  line_total?: number | null;
};

export type DeliveryReturnLine = {
  product_id?: string;
  quantity: number;
  unit_price?: number | null;
};

function lineAmount(item: DeliveryItemLine): number {
  if (item.line_total != null) return Number(item.line_total);
  return Number(item.quantity ?? 0) * Number(item.unit_price ?? 0);
}

function returnAmount(
  ret: DeliveryReturnLine,
  priceByProduct: Map<string, number>,
): number {
  const price =
    ret.unit_price != null
      ? Number(ret.unit_price)
      : ret.product_id
        ? priceByProduct.get(ret.product_id) ?? 0
        : 0;
  return Number(ret.quantity ?? 0) * price;
}

/** Build unit prices from sold lines (used to value customer returns). */
export function priceMapFromItems(items: DeliveryItemLine[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const i of items) {
    if (!i.product_id) continue;
    if (i.unit_price != null) {
      map.set(i.product_id, Number(i.unit_price));
    } else if (i.line_total != null && i.quantity) {
      map.set(i.product_id, Number(i.line_total) / Number(i.quantity));
    }
  }
  return map;
}

export function deliveryNetTotals(
  items: DeliveryItemLine[],
  returns: DeliveryReturnLine[],
) {
  const prices = priceMapFromItems(items);
  const grossAmount = items.reduce((s, i) => s + lineAmount(i), 0);
  const grossUnits = items.reduce((s, i) => s + Number(i.quantity ?? 0), 0);
  const returnAmountTotal = returns.reduce((s, r) => s + returnAmount(r, prices), 0);
  const returnUnits = returns.reduce((s, r) => s + Number(r.quantity ?? 0), 0);
  return {
    grossAmount,
    grossUnits,
    returnAmount: returnAmountTotal,
    returnUnits,
    netAmount: Math.max(0, grossAmount - returnAmountTotal),
    netUnits: Math.max(0, grossUnits - returnUnits),
  };
}

/** Payment linked to a delivery should reflect net sold minus customer returns. */
export function deliveryPaymentAmount(
  storedAmount: number,
  items: DeliveryItemLine[],
  returns: DeliveryReturnLine[],
): number {
  if (items.length === 0 && returns.length === 0) return storedAmount;
  return deliveryNetTotals(items, returns).netAmount;
}
