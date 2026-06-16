import { Camera01Icon, Cancel01Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

import { useServerFn } from "@tanstack/react-start";
import { getPhotoUploadUrl } from "@/lib/api/driver.functions";
import { getCustomerPhotoUploadUrl } from "@/lib/api/customers.functions";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/compress-image";
import { toast } from "sonner";

interface PhotoCaptureProps {
  bucket: "delivery-photos" | "expense-photos";
  value: string | null;
  onChange: (path: string | null) => void;
  label?: string;
  previewUrl?: string | null;
}

interface CustomerPhotoCaptureProps {
  bucket: "customer-photos";
  branchId?: string | null;
  value: string | null;
  onChange: (path: string | null) => void;
  label?: string;
  previewUrl?: string | null;
}

type Props = PhotoCaptureProps | CustomerPhotoCaptureProps;

export function PhotoCapture(props: Props) {
  const { value, onChange, label, previewUrl } = props;
  const bucket = props.bucket;
  const branchId = props.bucket === "customer-photos" ? props.branchId : undefined;
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const getUploadUrl = useServerFn(getPhotoUploadUrl);
  const getCustomerUploadUrl = useServerFn(getCustomerPhotoUploadUrl);

  async function handleFile(file: File) {
    if (file.size > 8 * 1024 * 1024) {
      toast.error("La foto es muy grande (máx 8 MB).");
      return;
    }
    setCompressing(true);
    let uploadFile: File;
    try {
      uploadFile = await compressImage(file);
    } finally {
      setCompressing(false);
    }
    setUploading(true);
    const localUrl = URL.createObjectURL(uploadFile);
    setPreview(localUrl);
    try {
      const { path, token } =
        bucket === "customer-photos"
          ? await getCustomerUploadUrl({ data: { branch_id: branchId ?? null, filename: uploadFile.name } })
          : await getUploadUrl({ data: { bucket, filename: uploadFile.name } });
      const { error } = await supabase.storage
        .from(bucket)
        .uploadToSignedUrl(path, token, uploadFile, { contentType: uploadFile.type || "image/jpeg" });
      if (error) throw error;
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
  const displayPreview = preview ?? (value && previewUrl ? previewUrl : null);
  const busy = compressing || uploading;

  return (
    <div className="space-y-2">
      {label ? <div className="text-sm font-medium">{label}</div> : null}
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
      {displayPreview ? (
        <div className="relative">
          <img
            src={displayPreview}
            alt="Evidencia"
            className="w-full rounded-md max-h-64 object-cover border"
          />
          <button
            type="button"
            onClick={clear}
            className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1"
            aria-label="Quitar foto"
            disabled={busy}
          >
            <Icon icon={Cancel01Icon} className="h-4 w-4" />
          </button>
        </div>
      ) : hasPhoto ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          Foto subida.
          <button type="button" onClick={clear} className="underline" disabled={busy}>Quitar</button>
        </div>
      ) : null}
      <Button
        type="button"
        variant="outline"
        className="w-full h-12"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
      >
        {busy ? <Icon icon={Loading03Icon} className="h-4 w-4 animate-spin" /> : <Icon icon={Camera01Icon} className="h-4 w-4" />}
        {compressing ? "Comprimiendo…" : uploading ? "Subiendo…" : hasPhoto ? "Cambiar foto" : "Tomar foto"}
      </Button>
    </div>
  );
}
