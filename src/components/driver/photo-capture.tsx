import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, X, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getPhotoUploadUrl } from "@/lib/api/driver.functions";
import { toast } from "sonner";

interface PhotoCaptureProps {
  bucket: "delivery-photos" | "expense-photos";
  value: string | null; // uploaded path
  onChange: (path: string | null) => void;
}

export function PhotoCapture({ bucket, value, onChange }: PhotoCaptureProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const getUploadUrl = useServerFn(getPhotoUploadUrl);

  async function handleFile(file: File) {
    if (file.size > 8 * 1024 * 1024) {
      toast.error("La foto es muy grande (máx 8 MB).");
      return;
    }
    setUploading(true);
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    try {
      const { path, signedUrl } = await getUploadUrl({ data: { bucket, filename: file.name } });
      const res = await fetch(signedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "image/jpeg" },
      });
      if (!res.ok) throw new Error("Falló la carga de la foto.");
      onChange(path);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo subir la foto.");
      setPreview(null);
    } finally {
      setUploading(false);
    }
  }

  function clear() {
    setPreview(null);
    onChange(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const hasPhoto = !!preview || !!value;

  return (
    <div className="space-y-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      {hasPhoto && preview ? (
        <div className="relative">
          <img
            src={preview}
            alt="Evidencia"
            className="w-full rounded-md max-h-64 object-cover border"
          />
          <button
            type="button"
            onClick={clear}
            className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1"
            aria-label="Quitar foto"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : hasPhoto ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          Foto subida.
          <button type="button" onClick={clear} className="underline">Quitar</button>
        </div>
      ) : null}
      <Button
        type="button"
        variant="outline"
        className="w-full h-12"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        {hasPhoto ? "Cambiar foto" : "Tomar foto"}
      </Button>
    </div>
  );
}
