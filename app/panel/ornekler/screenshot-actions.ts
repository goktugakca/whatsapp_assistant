"use server";

import { z } from "zod";
import { assertBusinessAccess } from "@/lib/dal";
import { MAX_SCREENSHOTS_PER_CALL, readScreenshot, SCREENSHOT_TYPES, type ScreenshotRead } from "@/lib/screenshot-import";

// Ekran görüntüsü tarayıcıda ~1600 px'e küçültülüp base64 gelir.
const MAX_BASE64 = 2_500_000;

const input = z
  .array(z.object({ mediaType: z.enum(SCREENSHOT_TYPES), data: z.string().max(MAX_BASE64) }))
  .min(1)
  .max(MAX_SCREENSHOTS_PER_CALL);

// Birkaç ekran görüntüsünü okur; metinleri ve kırpılmış fotoğrafları döndürür. Örneklerin
// birleştirilmesi ve kaydı tarayıcıda (import-screenshots.tsx) ve importExamples ile yapılır.
export async function readScreenshots(businessId: string, items: unknown): Promise<ScreenshotRead[]> {
  await assertBusinessAccess(businessId);
  const parsed = input.parse(items);
  const out: ScreenshotRead[] = [];
  for (const item of parsed) {
    try {
      out.push(await readScreenshot({ mediaType: item.mediaType, data: Buffer.from(item.data, "base64") }));
    } catch (error) {
      console.error("Ekran görüntüsü okunamadı:", error);
      out.push({ chatKey: "", platform: "unknown", messages: [], notes: "Okuma hatası" });
    }
  }
  return out;
}
