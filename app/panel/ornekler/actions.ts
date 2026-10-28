"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertBusinessAccess } from "@/lib/dal";
import { getStore } from "@/lib/store";
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
