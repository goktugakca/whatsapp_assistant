import { createHmac, timingSafeEqual } from "node:crypto";

// WhatsApp Cloud API (doğrudan Meta). Aracı firma (BSP) kullanılmıyor.
const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION ?? "v23.0";

export interface InboundMessage {
  id: string;
  phoneNumberId: string; // Mesajın geldiği işletme numarası
  from: string; // Hastanın numarası
  contactName?: string;
  text: string;
  timestamp: number;
}

// Meta, gövdeyi uygulama gizli anahtarıyla imzalar: X-Hub-Signature-256: sha256=<hex>
export function verifySignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const received = Buffer.from(signatureHeader.slice("sha256=".length), "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

interface WebhookPayload {
  object?: string;
  entry?: {
    changes?: {
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: {
          id: string;
          from: string;
          timestamp: string;
          type: string;
          text?: { body?: string };
          button?: { text?: string };
          interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
        }[];
      };
    }[];
  }[];
}

// Webhook gövdesinden metin mesajlarını çıkarır. Durum bildirimleri (okundu, iletildi) atlanır.
// Metin dışı mesajlar (ses, görsel) şimdilik kısa bir açıklama metnine dönüştürülür.
export function parseInboundMessages(payload: unknown): InboundMessage[] {
  const body = payload as WebhookPayload;
  if (body?.object !== "whatsapp_business_account") return [];
  const result: InboundMessage[] = [];

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (change.field !== "messages" || !phoneNumberId) continue;

      for (const message of value?.messages ?? []) {
        const contact = value?.contacts?.find((c) => c.wa_id === message.from);
        const text =
          message.text?.body ??
          message.button?.text ??
          message.interactive?.button_reply?.title ??
          message.interactive?.list_reply?.title ??
          `[Hasta bir ${message.type} mesajı gönderdi; asistan şimdilik sadece metin okuyabiliyor.]`;
        result.push({
          id: message.id,
          phoneNumberId,
          from: message.from,
          contactName: contact?.profile?.name,
          text,
          timestamp: Number(message.timestamp),
        });
      }
    }
  }
  return result;
}

// Müşterinin başlattığı 24 saatlik pencere içinde serbest metin yanıtı gönderir.
export async function sendText(params: { phoneNumberId: string; to: string; text: string }): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN tanımlı değil");

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${params.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: params.to,
      type: "text",
      text: { preview_url: false, body: params.text },
    }),
  });
  if (!res.ok) {
    throw new Error(`WhatsApp gönderimi başarısız (${res.status}): ${await res.text()}`);
  }
}
