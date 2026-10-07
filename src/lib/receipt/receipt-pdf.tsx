import { Document, Image, Page, pdf } from "@react-pdf/renderer";
import { renderReceiptCanvas } from "./render-receipt-canvas";
import type { ReceiptData } from "./types";

/** 58 mm in PDF points. */
const PAGE_WIDTH_PT = 164;

/**
 * PDF with the same drawing that gets printed (at 2x for sharper text), so the paper and
 * the PDF always match.
 */
export async function buildReceiptPdf(data: ReceiptData): Promise<Blob> {
  const canvas = await renderReceiptCanvas(data, 2);
  const src = canvas.toDataURL("image/png");
  const height = Math.ceil((PAGE_WIDTH_PT * canvas.height) / canvas.width);

  const doc = (
    <Document title={`Recibo ${data.folio}`} author={data.businessName}>
      <Page size={[PAGE_WIDTH_PT, height]} style={{ padding: 0 }}>
        <Image src={src} style={{ width: PAGE_WIDTH_PT, height }} />
      </Page>
    </Document>
  );
  return pdf(doc).toBlob();
}

export type ShareResult = "shared" | "downloaded" | "cancelled";

/** Opens the phone's share sheet with the PDF, or downloads it if sharing files isn't supported. */
export async function shareReceiptPdf(data: ReceiptData): Promise<ShareResult> {
  const blob = await buildReceiptPdf(data);
  const filename = `recibo-${data.folio}.pdf`;
  const file = new File([blob], filename, { type: "application/pdf" });

  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: `Recibo ${data.folio}` });
      return "shared";
    } catch (e: any) {
      if (e?.name === "AbortError") return "cancelled";
      // Any other failure: fall through to a plain download.
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
