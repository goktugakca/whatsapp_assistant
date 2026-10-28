"use client";

import { unzipSync } from "fflate";
import { useState } from "react";
import { blobToBase64, shrinkImage } from "@/lib/shrink-image";
import {
  allSenders,
  extractExamples,
  guessSalonSenders,
  parseExport,
  type ExportMessage,
} from "@/lib/whatsapp-export";
import { importExamples } from "./actions";

const IMAGE = /\.(jpe?g|png|webp)$/i;
const MAX_EDGE = 1280; // saçın uzunluğu ve rengi için yeterli, yüklemeyi küçük tutar
const BATCH = 4;

type Chat = { file: File; messages: ExportMessage[]; imageNames: Set<string> };

// Zipten sadece istenen dosyaları açar; adı yolsuz (WhatsApp bazen klasör içine koyar).
function unzip(bytes: Uint8Array, want: (name: string) => boolean) {
  const files = unzipSync(bytes, { filter: (f) => want(f.name.split("/").pop()!) });
  return new Map(Object.entries(files).map(([path, data]) => [path.split("/").pop()!, data]));
}

async function readChat(file: File): Promise<Chat | string> {
  const decode = (b: Uint8Array) => new TextDecoder("utf-8").decode(b);
  if (/\.txt$/i.test(file.name)) {
    return { file, messages: parseExport(await file.text()), imageNames: new Set() };
  }
  try {
    const names: string[] = [];
    const bytes = new Uint8Array(await file.arrayBuffer());
    const files = unzipSync(bytes, {
      filter: (f) => {
        const name = f.name.split("/").pop()!;
        if (IMAGE.test(name)) names.push(name);
        return /\.txt$/i.test(name);
      },
    });
    const txt = Object.values(files)[0];
    if (!txt) return `${file.name}: içinde sohbet metni yok`;
    return { file, messages: parseExport(decode(txt)), imageNames: new Set(names) };
  } catch {
    return `${file.name}: zip açılamadı`;
  }
}

export function ImportChats({ businessId }: { businessId: string }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [senders, setSenders] = useState<string[]>([]);
  const [salon, setSalon] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setResult(null);
    setBusy("Sohbetler okunuyor…");
    const read: Chat[] = [];
    const errs: string[] = [];
    for (const [i, file] of Array.from(files).entries()) {
      setBusy(`Sohbetler okunuyor… ${i + 1}/${files.length}`);
      const chat = await readChat(file);
      if (typeof chat === "string") errs.push(chat);
      else if (chat.messages.length === 0) errs.push(`${file.name}: WhatsApp sohbeti olarak okunamadı`);
      else read.push(chat);
    }
    setChats(read);
    setErrors(errs);
    const all = allSenders(read.map((c) => c.messages));
    setSenders(all);
    setSalon(guessSalonSenders(read.map((c) => c.messages)));
    setBusy(null);
  }

  const preview = salon.length
    ? chats.map((c) => extractExamples(c.messages, salon, c.imageNames))
    : [];
  const total = preview.reduce((n, list) => n + list.length, 0);
  const priced = preview.reduce((n, list) => n + list.filter((e) => e.price).length, 0);

  async function upload() {
    let added = 0;
    let duplicates = 0;
    let failedPhotos = 0;
    for (const [i, chat] of chats.entries()) {
      setBusy(`Yükleniyor… ${i + 1}/${chats.length} sohbet · ${added} örnek eklendi`);
      const examples = preview[i];
      if (examples.length === 0) continue;
      const needed = new Set(examples.flatMap((e) => e.photos));
      const images = /\.zip$/i.test(chat.file.name)
        ? unzip(new Uint8Array(await chat.file.arrayBuffer()), (n) => needed.has(n))
        : new Map<string, Uint8Array>();
      const items = [];
      for (const e of examples) {
        const photos: string[] = [];
        for (const name of e.photos) {
          const bytes = images.get(name);
          if (!bytes) continue;
          try {
            photos.push(await blobToBase64(await shrinkImage(new Blob([bytes as BlobPart]), MAX_EDGE)));
          } catch {
            failedPhotos++;
          }
        }
        if (photos.length === 0) continue;
        items.push({
          photos,
          customerText: e.customerText,
          staffReply: e.staffReply,
          priceText: e.price?.text,
          priceMin: e.price?.min,
          priceMax: e.price?.max,
          at: e.at,
        });
      }
      for (let k = 0; k < items.length; k += BATCH) {
        try {
          const r = await importExamples(businessId, items.slice(k, k + BATCH));
          added += r.added;
          duplicates += r.duplicates;
        } catch {
          setBusy(null);
          setResult(`Yükleme yarıda kesildi (${added} örnek eklendi). Aynı dosyaları tekrar seçebilirsiniz; eklenenler tekrar eklenmez.`);
          return;
        }
      }
    }
    setBusy(null);
    setChats([]);
    setResult(
      [
        `${added} örnek eklendi.`,
        duplicates > 0 && `${duplicates} örnek zaten vardı.`,
        failedPhotos > 0 && `${failedPhotos} fotoğraf açılamadı (HEIC olabilir).`,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  return (
    <div className="rounded-xl border-2 border-dashed border-accent/40 bg-card p-5">
      <p className="font-medium">WhatsApp sohbetlerini yükleyin</p>
      <p className="mt-1 text-[13px] text-muted">
        Her sohbette ⋮ → Diğer → Sohbeti dışa aktar → <b>Medyayı dahil et</b>. Çıkan zip dosyalarının hepsini
        birden seçebilirsiniz. Gönderen adları ve telefon numaraları kaydedilmez.
      </p>
      <label className={`btn btn-sm mt-3 ${busy ? "pointer-events-none opacity-60" : ""}`}>
        Zip dosyalarını seç
        <input
          type="file"
          accept=".zip,.txt"
          multiple
          className="sr-only"
          disabled={!!busy}
          onChange={(e) => {
            void pick(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {busy && <p className="hand mt-3 text-xl">{busy}</p>}
      {errors.length > 0 && (
        <ul className="mt-3 list-disc pl-5 text-[13px] text-red-600">
          {errors.slice(0, 8).map((e) => (
            <li key={e}>{e}</li>
          ))}
          {errors.length > 8 && <li>ve {errors.length - 8} dosya daha</li>}
        </ul>
      )}

      {chats.length > 0 && !busy && (
        <div className="mt-4 space-y-3 border-t border-border pt-4 text-sm">
          <p>
            <b>{chats.length}</b> sohbet okundu. Hangisi salonun adı? (Diğerleri müşteri sayılır.)
          </p>
          <div className="flex flex-wrap gap-2">
            {senders.slice(0, 40).map((s) => (
              <label key={s} className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs">
                <input
                  type="checkbox"
                  checked={salon.includes(s)}
                  onChange={(e) => setSalon((prev) => (e.target.checked ? [...prev, s] : prev.filter((x) => x !== s)))}
                />
                {s}
              </label>
            ))}
          </div>
          {salon.length > 0 ? (
            <>
              <p>
                <b>{total}</b> fotoğraflı fiyat sorusu bulundu; <b>{priced}</b> tanesinde salonun verdiği fiyat
                okunabildi. Diğerlerinin fiyatını yükledikten sonra listeden yazabilirsiniz.
              </p>
              <button type="button" className="btn" disabled={total === 0} onClick={() => void upload()}>
                {total} örneği içe aktar
              </button>
            </>
          ) : (
            <p className="text-muted">Salonun adını seçin.</p>
          )}
        </div>
      )}
      {result && (
        <p role="status" className="mt-3 text-sm text-ok">
          {result}
        </p>
      )}
    </div>
  );
}
