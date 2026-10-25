import { z } from "zod";
import { runAssistant } from "@/lib/agent/run";
import { loadBusiness } from "@/lib/business";
import { getStore } from "@/lib/store";

// WhatsApp kurulumu olmadan asistanı tarayıcıdan denemek için.
// Gerçek API anahtarı harcar; herkese açık ortamda DEMO_ENABLED=false ile kapatılabilir.
export const maxDuration = 60;

const body = z.object({
  businessId: z.string(),
  sessionId: z.string().min(8).max(64),
  text: z.string().min(1).max(2000),
});

export async function POST(request: Request) {
  if (process.env.DEMO_ENABLED === "false") {
    return Response.json({ error: "Demo kapalı" }, { status: 404 });
  }

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Geçersiz istek" }, { status: 400 });
  const store = await getStore();
  const business = await loadBusiness(store, parsed.data.businessId);
  if (!business) return Response.json({ error: "Bilinmeyen işletme" }, { status: 404 });

  const key = { businessId: business.id, channel: "demo" as const, contact: parsed.data.sessionId };
  const text = parsed.data.text;

  const result = await store.withConversationLock(key, async () => {
    const conversation = await store.findOrCreateConversation({ ...key, contactName: "Demo kullanıcısı" });

    if (conversation.status === "handoff") {
      conversation.transcript.push({ from: "customer", text, at: new Date().toISOString() });
      conversation.history.push({ role: "user", content: text });
      await store.saveConversation(conversation);
      return {
        reply: null,
        handedOff: true,
        note: "Konuşma personele devredildi. Panelden yanıt verebilir veya asistanı yeniden açabilirsiniz.",
      };
    }

    const run = await runAssistant({ business, conversation, store, text });
    await store.saveConversation(conversation);
    return run;
  });
  return Response.json(result);
}
