import type Anthropic from "@anthropic-ai/sdk";
import type { Store } from "./store";

// Müşteri fotoğrafları konuşma geçmişine bayt olarak değil, "[[foto:<kimlik>]]" işaretiyle
// yazılır; görsel media tablosunda durur. Modele her istekte işaret yerine aynı görsel konur.
// Böylece geçmiş küçük kalır, sonradan hiç değiştirilmez (sadece sona eklenir) ve modelin
// gördüğü içerik turdan tura birebir aynı kaldığı için istem önbelleği bozulmaz.

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type ContentBlock = Anthropic.Beta.Messages.BetaContentBlockParam;

const MARKER = /^\[\[foto:([0-9a-f-]{36})\]\]$/;
// Modelin okuyabildiği görsel türleri; WhatsApp fotoğrafları neredeyse hep JPEG.
const MODEL_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ModelImageType = (typeof MODEL_IMAGE_TYPES)[number];
// Bir konuşmada modele gösterilen en fazla fotoğraf. Fazlası panelde görünür ama her turda
// tekrar gönderilmez (maliyet).
export const MAX_IMAGES_PER_CONVERSATION = 6;
// WhatsApp görsel sınırı 5 MB; modelin görsel sınırı da bu civarda.
export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

export function mediaMarker(id: string): ContentBlock {
  return { type: "text", text: `[[foto:${id}]]` };
}

export function countMediaMarkers(history: MessageParam[]): number {
  let n = 0;
  for (const m of history) {
    if (m.role !== "user" || typeof m.content === "string") continue;
    for (const b of m.content) if (b.type === "text" && MARKER.test(b.text)) n++;
  }
  return n;
}

// Geçmişteki fotoğraf işaretlerini görsellerle değiştirir. Saklanan geçmiş değişmez; sadece
// modele giden kopya. Görsel bulunamazsa veya türü desteklenmiyorsa sabit bir açıklama konur.
export async function hydrateMedia(history: MessageParam[], store: Store, cache = new Map<string, ContentBlock>()) {
  const resolve = async (id: string): Promise<ContentBlock> => {
    const hit = cache.get(id);
    if (hit) return hit;
    const media = await store.getMedia(id);
    const block: ContentBlock =
      media && (MODEL_IMAGE_TYPES as readonly string[]).includes(media.mimeType) && media.data.length <= MAX_MEDIA_BYTES
        ? {
            type: "image",
            source: { type: "base64", media_type: media.mimeType as ModelImageType, data: media.data.toString("base64") },
          }
        : { type: "text", text: "[Müşteri bir fotoğraf gönderdi; görsel açılamadı.]" };
    cache.set(id, block);
    return block;
  };

  return Promise.all(
    history.map(async (m): Promise<MessageParam> => {
      if (m.role !== "user" || typeof m.content === "string") return m;
      if (!m.content.some((b) => b.type === "text" && MARKER.test(b.text))) return m;
      const content = await Promise.all(
        m.content.map((b) => {
          const match = b.type === "text" ? MARKER.exec(b.text) : null;
          return match ? resolve(match[1]) : b;
        }),
      );
      return { ...m, content };
    }),
  );
}
