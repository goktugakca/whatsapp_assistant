import { after } from "next/server";
import { handleInboundMessage } from "@/lib/inbound";
import { getStore } from "@/lib/store";
import { parseInboundMessages, verifySignature } from "@/lib/whatsapp";

// Model çağrısı birkaç saniye sürebilir; Meta'ya hemen 200 dönüp işi after() içinde yapıyoruz.
export const maxDuration = 60;

// Meta, webhook'u kaydederken bu uca hub.challenge ile doğrulama isteği atar.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (
    verifyToken &&
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === verifyToken
  ) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.error("WhatsApp webhook: WHATSAPP_APP_SECRET tanımlı değil");
    return new Response("WHATSAPP_APP_SECRET tanımlı değil", { status: 500 });
  }

  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
    console.warn("WhatsApp webhook: imza geçersiz; WHATSAPP_APP_SECRET Meta'daki App secret ile aynı mı?");
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const messages = parseInboundMessages(payload);
  console.log(`WhatsApp webhook: ${messages.length} mesaj`);
  after(async () => {
    const store = await getStore();
    // Farklı müşterilerin mesajları paralel; aynı müşterininkiler konuşma kilidiyle sıralı.
    await Promise.all(
      messages.map(async (message) => {
        try {
          await handleInboundMessage(message, { store });
        } catch (error) {
          console.error("WhatsApp mesajı işlenemedi:", message.id, error);
        }
      }),
    );
  });

  return new Response("OK", { status: 200 });
}
