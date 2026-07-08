import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

export type ProductTotal = {
  product_id: string;
  product_name: string;
  unit: string;
  total_quantity: number;
  customers: { name: string; quantity: number }[];
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    paddingTop: 32,
    paddingBottom: 48,
    paddingHorizontal: 36,
    color: "#111",
    backgroundColor: "#fff",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  logo: {
    width: 52,
    height: 52,
    objectFit: "contain",
  },
  branchText: {
    fontSize: 10,
    color: "#555",
    textAlign: "right",
  },
  reportTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  metaText: {
    fontSize: 9,
    color: "#555",
    marginBottom: 16,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#d1d5db",
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  colProduct: { flex: 1 },
  colUnit: { width: 70, textAlign: "center" },
  colQty: { width: 60, textAlign: "right" },
  tableHeaderText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: "#374151",
  },
  productRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  productRowText: {
    fontSize: 10,
  },
  productRowBold: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },
  customerRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 6,
    paddingLeft: 18,
    borderBottomWidth: 1,
    borderColor: "#f3f4f6",
    backgroundColor: "#fafafa",
  },
  customerRowText: {
    fontSize: 9,
    color: "#555",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#9ca3af",
    borderTopWidth: 1,
    borderColor: "#e5e7eb",
    paddingTop: 4,
  },
  emptyRow: {
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderColor: "#e5e7eb",
  },
  emptyText: {
    fontSize: 10,
    color: "#9ca3af",
    fontStyle: "italic",
  },
});

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  return `${d} de ${months[m - 1]} de ${y}`;
}

export function PreorderReportDocument({
  productTotals,
  branchName,
  deliveryDate,
  showBreakdown,
  orderCount,
}: {
  productTotals: ProductTotal[];
  branchName: string;
  deliveryDate: string;
  showBreakdown: boolean;
  orderCount: number;
}) {
  const now = new Date();
  const generated = now.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? "s" : ""}`;

  return (
    <Document title={`Reporte de carga — ${deliveryDate}`}>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.headerRow}>
          <Image style={styles.logo} src="/pork-logo.png" />
          <Text style={styles.branchText}>{branchName}</Text>
        </View>
        <Text style={styles.reportTitle}>Reporte de carga para camión</Text>
        <Text style={styles.metaText}>
          {`Fecha de entrega: ${formatDate(deliveryDate)}   ·   Generado: ${generated}   ·   ${plural(orderCount, "pedido")} confirmado${orderCount !== 1 ? "s" : ""}`}
        </Text>

        {/* Table header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.colProduct, styles.tableHeaderText]}>PRODUCTO</Text>
          <Text style={[styles.colUnit, styles.tableHeaderText]}>UNIDAD</Text>
          <Text style={[styles.colQty, styles.tableHeaderText]}>TOTAL</Text>
        </View>

        {/* Rows */}
        {productTotals.length === 0 ? (
          <View style={styles.emptyRow}>
            <Text style={styles.emptyText}>Sin productos en pedidos confirmados</Text>
          </View>
        ) : (
          productTotals.map((p) => (
            <View key={p.product_id}>
              <View style={styles.productRow}>
                <Text style={[styles.colProduct, styles.productRowBold]}>{p.product_name}</Text>
                <Text style={[styles.colUnit, styles.productRowText]}>{p.unit}</Text>
                <Text style={[styles.colQty, styles.productRowBold]}>{p.total_quantity}</Text>
              </View>
              {showBreakdown &&
                p.customers
                  .sort((a, b) => a.name.localeCompare(b.name, "es"))
                  .map((c) => (
                    <View key={`${p.product_id}-${c.name}`} style={styles.customerRow}>
                      <Text style={[styles.colProduct, styles.customerRowText]}>
                        {`\u21b3 ${c.name}`}
                      </Text>
                      <Text style={[styles.colUnit, styles.customerRowText]}></Text>
                      <Text style={[styles.colQty, styles.customerRowText]}>{c.quantity}</Text>
                    </View>
                  ))}
            </View>
          ))
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>
            {`${plural(orderCount, "pedido")}  ·  ${plural(productTotals.length, "producto")}`}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) => `Página ${pageNumber} / ${totalPages}`}
            fixed
          />
        </View>
      </Page>
    </Document>
  );
}
