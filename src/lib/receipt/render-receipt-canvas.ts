import { APP_LOCALE, APP_TZ } from "@/lib/tz";
import { APP_LOGO_SRC, APP_NAME } from "@/lib/brand";
import type { ReceiptData, ReceiptPaymentMethod } from "./types";

/** The PT-210 prints 384 dots across (48 mm at 8 dots/mm). */
export const RECEIPT_WIDTH = 384;

const PAD = 8;
const CONTENT_W = RECEIPT_WIDTH - PAD * 2;
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const METHOD_LABEL: Record<ReceiptPaymentMethod, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  credit: "Crédito",
  other: "Otro",
};

const moneyFmt = new Intl.NumberFormat(APP_LOCALE, {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const qtyFmt = new Intl.NumberFormat(APP_LOCALE, { maximumFractionDigits: 3 });

const money = (n: number) => moneyFmt.format(Math.round((n + Number.EPSILON) * 100) / 100 || 0);

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(APP_LOCALE, {
    timeZone: APP_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

type Align = "left" | "center" | "right";
type TextStyle = { size?: number; bold?: boolean; align?: Align };

/**
 * Tiny layout helper. Run it twice with the same content: first with `draw=false` to
 * measure the height, then with `draw=true` on a canvas of the right size.
 */
class Painter {
  y = 0;

  constructor(
    private ctx: CanvasRenderingContext2D,
    private draw: boolean,
  ) {}

  private setFont(size: number, bold: boolean) {
    this.ctx.font = `${bold ? "700" : "400"} ${size}px ${FONT}`;
  }

  private wrap(text: string, maxWidth: number): string[] {
    const out: string[] = [];
    for (const paragraph of text.split("\n")) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (words.length === 0) {
        out.push("");
        continue;
      }
      let line = "";
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (this.ctx.measureText(candidate).width <= maxWidth) {
          line = candidate;
          continue;
        }
        if (line) out.push(line);
        // Break words that are wider than the whole line.
        let rest = word;
        while (this.ctx.measureText(rest).width > maxWidth && rest.length > 1) {
          let cut = rest.length - 1;
          while (cut > 1 && this.ctx.measureText(rest.slice(0, cut)).width > maxWidth) cut--;
          out.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        line = rest;
      }
      if (line) out.push(line);
    }
    return out;
  }

  private drawLine(text: string, x: number, align: Align) {
    if (!this.draw) return;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = "top";
    this.ctx.fillStyle = "#000";
    this.ctx.fillText(text, x, this.y);
  }

  text(text: string, { size = 22, bold = false, align = "left" }: TextStyle = {}) {
    this.setFont(size, bold);
    const lh = Math.round(size * 1.28);
    const x = align === "left" ? PAD : align === "center" ? RECEIPT_WIDTH / 2 : RECEIPT_WIDTH - PAD;
    for (const line of this.wrap(text, CONTENT_W)) {
      this.drawLine(line, x, align);
      this.y += lh;
    }
  }

  /** Left text (wraps) with a right-aligned value on the first line. */
  row(left: string, right: string, { size = 22, bold = false }: Omit<TextStyle, "align"> = {}) {
    this.setFont(size, bold);
    const lh = Math.round(size * 1.28);
    const rightW = right ? this.ctx.measureText(right).width : 0;
    const leftMax = CONTENT_W - (rightW ? rightW + 10 : 0);
    const lines = this.wrap(left, leftMax);
    if (lines.length === 0) lines.push("");
    lines.forEach((line, i) => {
      this.drawLine(line, PAD, "left");
      if (i === 0 && right) this.drawLine(right, RECEIPT_WIDTH - PAD, "right");
      this.y += lh;
    });
  }

  rule(dashed = true) {
    this.y += 5;
    if (this.draw) {
      this.ctx.strokeStyle = "#000";
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash(dashed ? [6, 5] : []);
      this.ctx.beginPath();
      this.ctx.moveTo(PAD, this.y);
      this.ctx.lineTo(RECEIPT_WIDTH - PAD, this.y);
      this.ctx.stroke();
    }
    this.y += 9;
  }

  gap(h: number) {
    this.y += h;
  }

  /** Centered image. Pass the already-loaded logo; skips drawing if it failed to load. */
  image(img: HTMLImageElement | null, width: number) {
    if (!img || !img.naturalWidth) return;
    const height = Math.round(width * (img.naturalHeight / img.naturalWidth));
    if (this.draw) {
      const x = (RECEIPT_WIDTH - width) / 2;
      this.ctx.drawImage(img, x, this.y, width, height);
    }
    this.y += height;
  }
}

function layoutReceipt(p: Painter, data: ReceiptData, logo: HTMLImageElement | null) {
  p.gap(8);
  if (logo) {
    p.image(logo, 196);
    p.gap(8);
  } else {
    p.text(data.businessName || APP_NAME, { size: 36, bold: true, align: "center" });
  }
  if (data.branchName) p.text(data.branchName, { size: 22, bold: true, align: "center" });
  if (data.branchAddress) p.text(data.branchAddress, { size: 19, align: "center" });
  if (data.branchPhone) p.text(`Tel. ${data.branchPhone}`, { size: 19, align: "center" });
  p.rule();

  p.text("NOTA DE VENTA", { size: 26, bold: true, align: "center" });
  p.gap(4);
  p.row("Folio", data.folio, { size: 21 });
  p.row("Fecha", formatDateTime(data.issuedAt), { size: 21 });
  p.gap(2);
  p.text(`Cliente: ${data.customerName}`, { size: 22, bold: true });
  if (data.driverName) p.text(`Atendió: ${data.driverName}`, { size: 20 });
  p.rule();

  for (const item of data.items) {
    p.text(item.name, { size: 22, bold: true });
    p.row(
      `${qtyFmt.format(item.quantity)} ${item.unit} x ${money(item.unitPrice)}`,
      money(item.amount),
      { size: 21 },
    );
    p.gap(4);
  }

  if (data.returns.length > 0) {
    p.gap(2);
    p.text("Devoluciones", { size: 21, bold: true });
    for (const r of data.returns) {
      p.row(`${qtyFmt.format(r.quantity)} ${r.unit} ${r.name}`, `-${money(r.amount)}`, { size: 20 });
    }
  }

  p.rule();

  if (data.returns.length > 0) {
    p.row("Subtotal", money(data.grossAmount), { size: 22 });
    p.row("Devoluciones", `-${money(data.returnAmount)}`, { size: 22 });
  }
  p.row("TOTAL", money(data.total), { size: 30, bold: true });
  p.gap(4);

  if (data.payment) {
    const pay = data.payment;
    const unpaid = pay.status === "pending" || pay.method === "credit";
    const partial = pay.status === "pending" && pay.received > 0;
    p.row("Forma de pago", METHOD_LABEL[pay.method] ?? pay.method, { size: 21 });
    p.row("Estado", partial ? "PAGO PARCIAL" : unpaid ? "PENDIENTE DE PAGO" : "PAGADO", { size: 21, bold: true });
    if (partial) {
      p.row("Recibido", money(pay.received), { size: 21 });
      p.row("Falta por pagar", money(data.total - pay.received), { size: 21, bold: true });
    }
  }

  // Account statement: what was owed before, what was paid toward it, what is owed now.
  const acc = data.account;
  if (acc && (acc.previousBalance > 0 || acc.debtPaid > 0 || acc.balanceAfter > 0)) {
    p.rule();
    p.text("ESTADO DE CUENTA", { size: 22, bold: true, align: "center" });
    p.gap(2);
    if (acc.previousBalance > 0) p.row("Saldo anterior", money(acc.previousBalance), { size: 21 });
    if (data.payment && data.total - data.payment.received > 0) {
      p.row("Esta venta pendiente", money(data.total - data.payment.received), { size: 21 });
    }
    if (acc.debtPaid > 0) p.row("Abono a saldo anterior", `-${money(acc.debtPaid)}`, { size: 21 });
    p.gap(2);
    if (acc.balanceAfter > 0) {
      p.row("SALDO ADEUDADO", money(acc.balanceAfter), { size: 26, bold: true });
    } else {
      p.text("SIN SALDO PENDIENTE", { size: 22, bold: true, align: "center" });
    }
  }

  p.rule();
  p.text("Gracias por su compra", { size: 22, bold: true, align: "center" });
  p.gap(2);
  p.text("Nota de venta. No es comprobante fiscal.", { size: 17, align: "center" });
  // Extra paper so the last line clears the tear bar.
  p.gap(96);
}

function layoutTest(p: Painter, logo: HTMLImageElement | null) {
  p.gap(8);
  if (logo) {
    p.image(logo, 196);
    p.gap(8);
  } else {
    p.text(APP_NAME, { size: 36, bold: true, align: "center" });
  }
  p.text("Prueba de impresión", { size: 24, bold: true, align: "center" });
  p.rule();
  p.text("Si puedes leer esto, la impresora está lista para imprimir recibos.", { size: 21 });
  p.gap(6);
  p.text("Acentos: á é í ó ú ñ ü ¿? ¡!", { size: 21 });
  p.row("Total de prueba", money(1234.5), { size: 22, bold: true });
  p.rule();
  p.text(formatDateTime(new Date().toISOString()), { size: 19, align: "center" });
  p.gap(96);
}

let logoPromise: Promise<HTMLImageElement | null> | null = null;

function loadLogo(): Promise<HTMLImageElement | null> {
  if (typeof Image === "undefined") return Promise.resolve(null);
  if (!logoPromise) {
    logoPromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = APP_LOGO_SRC;
    });
  }
  return logoPromise;
}

async function render(layout: (p: Painter, logo: HTMLImageElement | null) => void, scale: number): Promise<HTMLCanvasElement> {
  const logo = await loadLogo();
  // Pass 1: measure.
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) throw new Error("Canvas no disponible en este navegador.");
  const measure = new Painter(probe, false);
  layout(measure, logo);
  const height = Math.ceil(measure.y);

  // Pass 2: draw.
  const canvas = document.createElement("canvas");
  canvas.width = RECEIPT_WIDTH * scale;
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: scale === 1 });
  if (!ctx) throw new Error("Canvas no disponible en este navegador.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  layout(new Painter(ctx, true), logo);
  return canvas;
}

/**
 * Draws the receipt. Use scale = 1 for the printer (exactly 384 px wide) and a higher
 * scale for previews / PDF.
 */
export function renderReceiptCanvas(data: ReceiptData, scale = 1): Promise<HTMLCanvasElement> {
  return render((p, logo) => layoutReceipt(p, data, logo), scale);
}

export function renderTestTicketCanvas(scale = 1): Promise<HTMLCanvasElement> {
  return render((p, logo) => layoutTest(p, logo), scale);
}
