"use client";

import { useRef, useState, useTransition } from "react";
import type { ExtractedService } from "@/lib/service-merge";
import { shrinkImage } from "@/lib/shrink-image";
import { importPriceList, importPriceListFromUrl } from "../actions";

const MAX_IMAGES = 5;
const MAX_EDGE = 1800; // px; fiyat yazısını okumaya yeter, yüklemeyi küçük tutar

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
  const [url, setUrl] = useState("");

  function fromUrl() {
    if (!url.trim()) return;
    setMessage(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.append("url", url.trim());
      formData.append("existing", JSON.stringify(existingNames.filter(Boolean)));
      const result = await importPriceListFromUrl(businessId, formData);
      if (!result.ok) {
        setMessage({ ok: false, text: result.message });
      } else {
        const summary = onImported(result.services, replace);
        setMessage({ ok: true, text: result.notes ? `${summary} Not: ${result.notes}` : summary });
        setUrl("");
      }
    });
  }

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
        for (const file of Array.from(files)) formData.append("images", await shrinkImage(file, MAX_EDGE), "liste.jpg");
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
      <p className="text-sm font-medium">Fiyat listenizi fotoğraftan veya web sayfasından alın</p>
      <p className="mt-1 text-[13px] text-muted">
        Tabela, menü veya fiyat listesi fotoğrafı; birden fazla sayfa varsa hepsini seçin. Ya da fiyatların yazdığı
        web sayfasının adresini yapıştırın. Hizmetleri ve fiyatları biz çıkaralım, siz kontrol edip kaydedin.
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
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="url"
          inputMode="url"
          className="field min-w-0 flex-1 py-1.5 text-sm"
          placeholder="https://salonunuz.com/fiyatlar"
          aria-label="Fiyat sayfasının adresi"
          value={url}
          disabled={pending}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              fromUrl();
            }
          }}
        />
        <button type="button" className="btn btn-line btn-sm" disabled={pending || !url.trim()} onClick={fromUrl}>
          Bağlantıdan al
        </button>
      </div>
      <label className="mt-3 flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={replace} disabled={pending} onChange={(e) => setReplace(e.target.checked)} />
        Mevcut hizmetleri bu listeyle değiştir (listede olmayanlar silinir)
      </label>
      {message && (
        <p role="status" className={`mt-2 text-sm ${message.ok ? "text-ok" : "text-danger"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
