import { z } from "zod";
import { runAssistant } from "@/lib/agent/run";
import { demoClinic } from "@/lib/clinic";
import { getStore } from "@/lib/store";

// WhatsApp kurulumu olmadan asistanı tarayıcıdan denemek için.
// Gerçek API anahtarı harcar; herkese açık ortamda DEMO_ENABLED=false ile kapatılabilir.
export const maxDuration = 60;

const body = z.object({
  sessionId: z.string().min(8).max(64),
  text: z.string().min(1).max(2000),
});

export async function POST(request: Request) {
  if (process.env.DEMO_ENABLED === "false") {
    return Response.json({ error: "Demo kapalı" }, { status: 404 });
  }

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Geçersiz istek" }, { status: 400 });

  const store = getStore();
  const conversation = await store.findOrCreateConversation({
    clinicId: demoClinic.id,
    channel: "demo",
    contact: parsed.data.sessionId,
    contactName: "Demo kullanıcısı",
  });

  if (conversation.status === "handoff") {
    conversation.transcript.push({ from: "patient", text: parsed.data.text, at: new Date().toISOString() });
    conversation.history.push({ role: "user", content: parsed.data.text });
    await store.saveConversation(conversation);
    return Response.json({
      reply: null,
      handedOff: true,
      note: "Konuşma personele devredildi. Panelden yanıt verebilir veya asistanı yeniden açabilirsiniz.",
    });
  }

  const result = await runAssistant({ clinic: demoClinic, conversation, store, text: parsed.data.text });
  await store.saveConversation(conversation);
  return Response.json(result);
}
