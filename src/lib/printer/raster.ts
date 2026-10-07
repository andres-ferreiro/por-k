export type Raster = {
  /** 1 bit per pixel, MSB first, rows packed to whole bytes. 1 = black. */
  data: Uint8Array;
  width: number;
  height: number;
  bytesPerRow: number;
};

/** Converts a canvas to the 1-bit bitmap the printer expects. */
export function canvasToRaster(canvas: HTMLCanvasElement, threshold = 150): Raster {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible.");
  const { width, height } = canvas;
  const bytesPerRow = Math.ceil(width / 8);
  const data = new Uint8Array(bytesPerRow * height);
  const pixels = ctx.getImageData(0, 0, width, height).data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const alpha = pixels[i + 3] / 255;
      // Treat transparent pixels as white paper.
      const lum =
        (0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]) * alpha + 255 * (1 - alpha);
      if (lum < threshold) data[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { data, width, height, bytesPerRow };
}
