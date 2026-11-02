"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertBusinessAccess } from "@/lib/dal";
import { getStore } from "@/lib/store";
import { findRepeatedLines, stripBoilerplate } from "@/lib/boilerplate";
import { extractPrice } from "@/lib/whatsapp-export";

// Fotoğraflar tarayıcıda küçültülüp (≈1280 px JPEG) base64 gelir; bir istekte birkaç örnek.
const MAX_PHOTO_BASE64 = 1_500_000;

const exampleInput = z.object({
  photos: z.array(z.string().max(MAX_PHOTO_BASE64)).min(1).max(3),
  customerText: z.string().max(1000),
  staffReply: z.string().max(1000),
  priceText: z.string().max(200).optional(),
  priceMin: z.number().int().min(0).max(1_000_000).optional(),
  priceMax: z.number().int().min(0).max(1_000_000).optional(),
  at: z.iso.datetime(),
});

export type ImportBatchResult = { added: number; duplicates: number };

// İçe aktarma sayfası örnekleri küçük gruplar halinde gönderir (istek boyutu sınırı).
export async function importExamples(businessId: string, items: unknown): Promise<ImportBatchResult> {
  await assertBusinessAccess(businessId);
  const parsed = z.array(exampleInput).max(10).parse(items);
  const store = await getStore();
  let added = 0;
  let duplicates = 0;
  for (const item of parsed) {
    const buffers = item.photos.map((p) => Buffer.from(p, "base64"));
    // Aynı fotoğraf tekrar yüklenirse (aynı zip iki kez) fotoğraf da saklanmaz.
    const imageHash = createHash("sha256").update(buffers[0]).digest("hex");
    if (await store.hasPriceExample(businessId, imageHash)) {
      duplicates++;
      continue;
    }
    const mediaIds: string[] = [];
    for (const data of buffers) {
      mediaIds.push((await store.saveMedia({ businessId, mimeType: "image/jpeg", data })).id);
    }
    const example = await store.addPriceExample({
      businessId,
      mediaIds,
      imageHash,
      customerText: item.customerText,
      staffReply: item.staffReply,
      priceText: item.priceText,
      priceMin: item.priceMin,
      priceMax: item.priceMax,
      saidAt: item.at,
    });
    if (example) added++;
    else duplicates++;
  }
  revalidatePath("/panel/ornekler");
  return { added, duplicates };
}

export async function setExampleIncluded(formData: FormData) {
  const businessId = z.string().parse(formData.get("businessId"));
  await assertBusinessAccess(businessId);
  const id = z.string().parse(formData.get("id"));
  await (await getStore()).updatePriceExample(businessId, id, { included: formData.get("included") === "true" });
  revalidatePath("/panel/ornekler");
}

// Fiyatı bulunamayan veya yanlış okunan örneğe fiyatı elle yazmak için ("4.000 TL", "3-4 bin").
export async function setExamplePrice(formData: FormData) {
  const businessId = z.string().parse(formData.get("businessId"));
  await assertBusinessAccess(businessId);
  const id = z.string().parse(formData.get("id"));
  const text = z.string().trim().max(200).parse(formData.get("price") ?? "");
  const price = text ? extractPrice(/\d/.test(text) && !/(tl|₺|lira|bin)/i.test(text) ? `${text} TL` : text) : undefined;
  if (text && !price) {
    // Fiyat okunamadı: kaydı bozmadan sayfaya uyarıyla dön.
    revalidatePath("/panel/ornekler");
    redirect(`/panel/ornekler?isletme=${encodeURIComponent(businessId)}&hata=fiyat#${id}`);
  }
  await (await getStore()).updatePriceExample(businessId, id, {
    priceText: price ? text : undefined,
    priceMin: price?.min,
    priceMax: price?.max,
  });
  revalidatePath("/panel/ornekler");
}

export async function deleteExample(formData: FormData) {
  const businessId = z.string().parse(formData.get("businessId"));
  await assertBusinessAccess(businessId);
  await (await getStore()).deletePriceExample(businessId, z.string().parse(formData.get("id")));
  revalidatePath("/panel/ornekler");
}

// Üslup örnekleri (müşteri mesajı → personel cevabı). Tarayıcıda çıkarılıp gizlenmiş gelir;
// sunucu yine de kısaltır ve aynı çifti iki kez eklemez.
const styleInput = z.array(z.object({ customerText: z.string().max(400), staffReply: z.string().min(2).max(500) })).max(100);

export async function importStyleExamples(businessId: string, items: unknown): Promise<{ added: number; duplicates: number }> {
  await assertBusinessAccess(businessId);
  const parsed = styleInput.parse(items);
  const rows = parsed.map((p) => ({
    customerText: p.customerText.trim(),
    staffReply: p.staffReply.trim(),
    hash: createHash("sha256").update(`${p.customerText.trim()}\u0000${p.staffReply.trim()}`).digest("hex"),
  }));
  const result = await (await getStore()).addStyleExamples(businessId, rows);
  revalidatePath("/panel/ornekler");
  return result;
}

export async function setStyleIncluded(formData: FormData) {
  const businessId = z.string().parse(formData.get("businessId"));
  await assertBusinessAccess(businessId);
  await (await getStore()).setStyleExampleIncluded(businessId, z.string().parse(formData.get("id")), formData.get("included") === "true");
  revalidatePath("/panel/ornekler");
}

export async function deleteStyle(formData: FormData) {
  const businessId = z.string().parse(formData.get("businessId"));
  await assertBusinessAccess(businessId);
  await (await getStore()).deleteStyleExample(businessId, z.string().parse(formData.get("id")));
  revalidatePath("/panel/ornekler");
}

// Daha önce içe aktarılmış örneklerden otomatik karşılama/KVKK satırlarını temizler; fiyatı
// bulunamamış fiyat örneklerinde temizlenen cevapta fiyatı yeniden arar. Boşalan üslup örneği silinir.
export async function cleanImportedExamples(formData: FormData) {
  const businessId = z.string().parse(formData.get("businessId"));
  await assertBusinessAccess(businessId);
  const store = await getStore();
  const [styles, prices] = await Promise.all([store.listStyleExamples(businessId), store.listPriceExamples(businessId)]);
  const repeated = findRepeatedLines([...styles.map((s) => s.staffReply), ...prices.map((p) => p.staffReply)]);
  let changed = 0;
  let removed = 0;
  let pricedNow = 0;
  for (const s of styles) {
    const text = stripBoilerplate(s.staffReply, repeated);
    if (text === s.staffReply) continue;
    if (text.length < 2) {
      await store.deleteStyleExample(businessId, s.id);
      removed++;
    } else {
      await store.updateStyleExampleText(businessId, s.id, text);
      changed++;
    }
  }
  for (const p of prices) {
    const text = stripBoilerplate(p.staffReply, repeated);
    if (text === p.staffReply) continue;
    const patch: Parameters<typeof store.updatePriceExample>[2] = { staffReply: text };
    if (p.priceMin === undefined) {
      const price = text.split("\n").map(extractPrice).find(Boolean);
      if (price) {
        Object.assign(patch, { priceText: price.text, priceMin: price.min, priceMax: price.max });
        pricedNow++;
      }
    }
    await store.updatePriceExample(businessId, p.id, patch);
    changed++;
  }
  revalidatePath("/panel/ornekler");
  redirect(`/panel/ornekler?isletme=${encodeURIComponent(businessId)}&temizlendi=${changed}-${removed}-${pricedNow}`);
}
