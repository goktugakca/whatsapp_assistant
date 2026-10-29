import { z } from "zod";
import { runAssistant } from "@/lib/agent/run";
import { loadBusiness } from "@/lib/business";
import { countMediaMarkers, historyWindow, MAX_IMAGES_PER_CONVERSATION, mediaMarker } from "@/lib/media";
import { getStore } from "@/lib/store";

// WhatsApp kurulumu olmadan asistanı tarayıcıdan denemek için.
// Gerçek API anahtarı harcar; herkese açık ortamda DEMO_ENABLED=false ile kapatılabilir.
export const maxDuration = 60;

// Fotoğraf tarayıcıda küçültülüp base64 gelir (~1600 px JPEG, birkaç yüz KB).
const MAX_IMAGE_BASE64 = 2_000_000;

const body = z
  .object({
    businessId: z.string(),
    sessionId: z.string().min(8).max(64),
    text: z.string().max(2000),
    image: z
      .object({ mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]), data: z.string().max(MAX_IMAGE_BASE64) })
      .optional(),
  })
  .refine((b) => b.text.trim() || b.image, { message: "Boş mesaj" });

// Basit istek sınırı (süreç belleğinde): IP başına 10 dakikada 30 mesaj, oturum başına toplam 60.
// Herkese açık demo gerçek model çağrısı harcar; bu sınır kötüye kullanımı pahalı olmaktan çıkarır.
const WINDOW_MS = 10 * 60_000;
const PER_IP = 30;
const PER_SESSION = 60;
const hits = new Map<string, number[]>();
const sessionCounts = new Map<string, number>();
function limited(ip: string, sessionId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  const count = (sessionCounts.get(sessionId) ?? 0) + 1;
  sessionCounts.set(sessionId, count);
  if (hits.size > 5000) hits.clear();
  if (sessionCounts.size > 5000) sessionCounts.clear();
  return recent.length > PER_IP || count > PER_SESSION;
}

export async function POST(request: Request) {
  if (process.env.DEMO_ENABLED === "false") {
    return Response.json({ error: "Demo kapalı" }, { status: 404 });
  }

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Geçersiz istek" }, { status: 400 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?";
  if (limited(ip, parsed.data.sessionId)) {
    return Response.json({ error: "Demo için mesaj sınırına ulaşıldı; biraz sonra tekrar deneyin." }, { status: 429 });
  }
  const store = await getStore();
  const business = await loadBusiness(store, parsed.data.businessId);
  if (!business) return Response.json({ error: "Bilinmeyen işletme" }, { status: 404 });

  const key = { businessId: business.id, channel: "demo" as const, contact: parsed.data.sessionId };
  const image = parsed.data.image;
  let text = parsed.data.text.trim();

  const result = await store.withConversationLock(key, async () => {
    const conversation = await store.findOrCreateConversation({ ...key, contactName: "Demo kullanıcısı" });
    const mediaId =
      image && countMediaMarkers(historyWindow(conversation.history)) < MAX_IMAGES_PER_CONVERSATION
        ? (
            await store.saveMedia({
              businessId: business.id,
              conversationId: conversation.id,
              mimeType: image.mediaType,
              data: Buffer.from(image.data, "base64"),
            })
          ).id
        : undefined;
    if (image && !mediaId) text = [text, "[Müşteri bir fotoğraf daha gönderdi.]"].filter(Boolean).join("\n");

    if (conversation.status === "handoff" || conversation.status === "blocked") {
      conversation.transcript.push({ from: "customer", text, at: new Date().toISOString(), mediaId });
      conversation.history.push({
        role: "user",
        content: mediaId ? [mediaMarker(mediaId), { type: "text", text: text || "(Fotoğraf)" }] : text || "(Fotoğraf)",
      });
      await store.saveConversation(conversation);
      return {
        reply: null,
        handedOff: true,
        note: "Konuşma personele devredildi. Panelden yanıt verebilir veya asistanı yeniden açabilirsiniz.",
      };
    }

    const run = await runAssistant({ business, conversation, store, text, mediaId });
    await store.saveConversation(conversation);
    return run;
  });
  return Response.json(result);
}
