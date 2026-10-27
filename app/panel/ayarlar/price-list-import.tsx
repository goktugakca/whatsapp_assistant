"use client";

import { useRef, useState, useTransition } from "react";
import type { ExtractedService } from "@/lib/service-merge";
import { importPriceList } from "../actions";

const MAX_IMAGES = 5;
const MAX_EDGE = 1800; // px; fiyat yazısını okumaya yeter, yüklemeyi küçük tutar

// Telefon fotoğrafları birkaç MB olabiliyor; yüklemeden önce tarayıcıda küçültülüp JPEG'e çevrilir.
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob"))), "image/jpeg", 0.85),
  );
}

// Fiyat listesi, tabela veya menü fotoğrafından hizmetleri forma ekler. Kaydetmez; sahibi
// listeyi kontrol edip formun Kaydet düğmesine basar.
export function PriceListImport({
  businessId,
  existingNames,
  onImported,
}: {
  businessId: string;
  existingNames: string[];
  onImported: (services: ExtractedService[], replace: boolean) => string;
}) {
  const [replace, setReplace] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (files.length > MAX_IMAGES) {
      setMessage({ ok: false, text: `En fazla ${MAX_IMAGES} fotoğraf seçebilirsiniz.` });
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.append("existing", JSON.stringify(existingNames.filter(Boolean)));
      try {
        for (const file of Array.from(files)) formData.append("images", await shrink(file), "liste.jpg");
      } catch {
        setMessage({ ok: false, text: "Bu fotoğraf açılamadı. JPG veya PNG bir fotoğraf deneyin." });
        return;
      }
      const result = await importPriceList(businessId, formData);
      if (!result.ok) {
        setMessage({ ok: false, text: result.message });
      } else {
        const summary = onImported(result.services, replace);
        setMessage({ ok: true, text: result.notes ? `${summary} Not: ${result.notes}` : summary });
      }
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <div className="rounded-xl border-2 border-dashed border-accent/40 bg-card p-4">
      <p className="text-sm font-medium">Fiyat listenizin fotoğrafını yükleyin</p>
      <p className="mt-1 text-[13px] text-muted">
        Tabela, menü veya fiyat listesi; birden fazla sayfa varsa hepsini seçin. Hizmetleri ve fiyatları biz
        çıkaralım, siz kontrol edip kaydedin.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className={`btn btn-sm ${pending ? "pointer-events-none opacity-60" : ""}`}>
          {pending ? "Fotoğraf okunuyor…" : "Fotoğraf seç"}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={pending}
            onChange={(e) => upload(e.target.files)}
          />
        </label>
        {pending && <span className="hand text-xl">biraz sürebilir, sayfadan çıkmayın</span>}
      </div>
      <label className="mt-3 flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={replace} disabled={pending} onChange={(e) => setReplace(e.target.checked)} />
        Mevcut hizmetleri bu listeyle değiştir (listede olmayanlar silinir)
      </label>
      {message && (
        <p role="status" className={`mt-2 text-sm ${message.ok ? "text-ok" : "text-red-600"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
