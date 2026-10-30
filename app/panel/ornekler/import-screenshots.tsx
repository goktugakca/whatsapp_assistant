"use client";

import { useState } from "react";
import { toExportMessages, type ScreenshotRead } from "@/lib/screenshot-messages";
import { blobToBase64, shrinkImage } from "@/lib/shrink-image";
import { extractExamples } from "@/lib/whatsapp-export";
import { importExamples } from "./actions";
import { readScreenshots } from "./screenshot-actions";

const MAX_EDGE = 1600; // yazı ve küçük fotoğraf okunsun
const READ_BATCH = 3;
const SAVE_BATCH = 4;

// Dosya adlarını doğal sırayla (IMG_9 < IMG_10) sıralar; aynı sohbetin ekranları art arda gelir.
const byName = new Intl.Collator("tr", { numeric: true });

// Ekran görüntülerinden içe aktarma: tarayıcıda küçült → sunucu okur ve fotoğrafı kırpar →
// aynı sohbetin ekranları birleşir → fotoğraf + fiyat örnekleri kaydedilir.
export function ImportScreenshots({ businessId }: { businessId: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function run(fileList: FileList | null) {
    if (!fileList?.length) return;
    setResult(null);
    const files = Array.from(fileList)
      .filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type))
      .sort((a, b) => byName.compare(a.name, b.name));
    if (files.length === 0) {
      setResult("Seçilen dosyalar arasında JPG/PNG ekran görüntüsü yok (HEIC ise önce JPG'ye çevirin).");
      return;
    }
    const reads: ScreenshotRead[] = [];
    let unreadable = 0;
    try {
      for (let i = 0; i < files.length; i += READ_BATCH) {
        setBusy(`Ekranlar okunuyor… ${Math.min(i + READ_BATCH, files.length)}/${files.length}`);
        const batch = await Promise.all(
          files.slice(i, i + READ_BATCH).map(async (f) => ({
            mediaType: "image/jpeg" as const,
            data: await blobToBase64(await shrinkImage(f, MAX_EDGE)),
          })),
        );
        const out = await readScreenshots(businessId, batch);
        for (const r of out) if (r.messages.length === 0) unreadable++;
        reads.push(...out);
      }
    } catch (e) {
      setBusy(null);
      setResult(`Okuma yarıda kesildi: ${(e as Error).message.slice(0, 200)}. Kalan dosyaları tekrar seçebilirsiniz.`);
      return;
    }

    // Aynı sohbetin ekranları: başlık adı aynı ve dosya sırasında art arda.
    const groups: ScreenshotRead[][] = [];
    for (const r of reads) {
      const last = groups.at(-1);
      if (last && r.chatKey && last[0].chatKey === r.chatKey) last.push(r);
      else groups.push([r]);
    }

    let added = 0;
    let duplicates = 0;
    let found = 0;
    let priced = 0;
    for (const [gi, group] of groups.entries()) {
      setBusy(`Örnekler kaydediliyor… sohbet ${gi + 1}/${groups.length}`);
      const { messages, photos } = toExportMessages(group);
      const examples = extractExamples(messages, ["salon"], new Set(photos.keys()));
      found += examples.length;
      priced += examples.filter((e) => e.price).length;
      const items = examples.map((e) => ({
        photos: e.photos.map((name) => photos.get(name)!).filter(Boolean),
        customerText: e.customerText,
        staffReply: e.staffReply,
        priceText: e.price?.text,
        priceMin: e.price?.min,
        priceMax: e.price?.max,
        at: e.at,
      }));
      for (let k = 0; k < items.length; k += SAVE_BATCH) {
        try {
          const r = await importExamples(businessId, items.slice(k, k + SAVE_BATCH));
          added += r.added;
          duplicates += r.duplicates;
        } catch {
          setBusy(null);
          setResult(`Kayıt yarıda kesildi (${added} örnek eklendi). Aynı dosyaları tekrar seçebilirsiniz; eklenenler tekrar eklenmez.`);
          return;
        }
      }
    }
    setBusy(null);
    setResult(
      [
        `${files.length} ekran okundu, ${groups.length} sohbet bulundu.`,
        `${found} fotoğraflı fiyat sorusu; ${priced} tanesinde fiyat okunabildi.`,
        `${added} örnek eklendi.`,
        duplicates > 0 && `${duplicates} örnek zaten vardı.`,
        unreadable > 0 && `${unreadable} ekran okunamadı.`,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  return (
    <div className="rounded-xl border-2 border-dashed border-accent/40 bg-card p-5">
      <p className="font-medium">Sohbet ekran görüntülerini yükleyin</p>
      <p className="mt-1 text-[13px] text-muted">
        Elinizde dışa aktarma dosyası değil de ekran görüntüleri varsa (WhatsApp veya Instagram): hepsini birden seçin.
        Fotoğraflar ekrandan kırpılır; ad, profil resmi ve numara kaydedilmez. Bir sohbetin birkaç ekranı varsa dosya
        adları sıralı olsun (IMG_1001, IMG_1002…).
      </p>
      <label className={`btn btn-line btn-sm mt-3 ${busy ? "pointer-events-none opacity-60" : ""}`}>
        Ekran görüntülerini seç
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          disabled={!!busy}
          onChange={(e) => {
            void run(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {busy && <p className="hand mt-3 text-xl">{busy}</p>}
      {result && (
        <p role="status" className="mt-3 text-sm text-ok">
          {result}
        </p>
      )}
    </div>
  );
}
