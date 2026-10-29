import { after } from "next/server";
import { handleInstagramMessage } from "@/lib/inbound";
import { parseInstagramMessages } from "@/lib/instagram";
import { getStore } from "@/lib/store";
import { verifySignature } from "@/lib/whatsapp";

// Instagram mesaj bildirimleri. WhatsApp webhook'uyla aynı düzen: hemen 200, iş after() içinde.
export const maxDuration = 60;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const verifyToken = process.env.INSTAGRAM_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN;
  if (verifyToken && params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === verifyToken) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  // Instagram ile giriş ürününün kendi gizli anahtarı var; Meta uygulamasınınki de kabul edilir.
  const secrets = [process.env.INSTAGRAM_APP_SECRET, process.env.WHATSAPP_APP_SECRET].filter((s): s is string => !!s);
  if (secrets.length === 0) {
    console.error("Instagram webhook: INSTAGRAM_APP_SECRET tanımlı değil");
    return new Response("INSTAGRAM_APP_SECRET tanımlı değil", { status: 500 });
  }
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!secrets.some((s) => verifySignature(rawBody, signature, s))) {
    console.warn("Instagram webhook: imza geçersiz; INSTAGRAM_APP_SECRET, Meta'daki Instagram app secret ile aynı mı?");
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const messages = parseInstagramMessages(payload);
  console.log(`Instagram webhook: ${messages.length} mesaj`);
  after(async () => {
    const store = await getStore();
    // Farklı müşterilerin mesajları paralel; aynı müşterininkiler konuşma kilidiyle sıralı.
    await Promise.all(
      messages.map(async (message) => {
        try {
          await handleInstagramMessage(message, { store });
        } catch (error) {
          console.error("Instagram mesajı işlenemedi:", message.id, error);
        }
      }),
    );
  });
  return new Response("OK", { status: 200 });
}
