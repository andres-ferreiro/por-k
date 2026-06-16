/** Resize and re-encode photos as JPEG before upload. Falls back to the original file on failure. */
export async function compressImage(
  file: File,
  opts?: { maxSize?: number; quality?: number },
): Promise<File> {
  const maxSize = opts?.maxSize ?? 1280;
  const quality = opts?.quality ?? 0.82;

  if (!file.type.startsWith("image/")) return file;
  if (file.size <= 400_000 && (file.type === "image/jpeg" || file.type === "image/webp")) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
    );
    if (!blob) return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}
