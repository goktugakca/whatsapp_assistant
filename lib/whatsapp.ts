import { createHmac, timingSafeEqual } from "node:crypto";

// WhatsApp Cloud API (doğrudan Meta). Aracı firma (BSP) kullanılmıyor.
const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION ?? "v23.0";

export interface InboundMessage {
  id: string;
  phoneNumberId: string; // Mesajın geldiği işletme numarası
  from: string; // Müşterinin numarası
  contactName?: string;
  text: string; // Fotoğrafta açıklama yazısı (caption); yoksa boş
  image?: { mediaId: string; mimeType: string };
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
          image?: { id?: string; mime_type?: string; caption?: string };
          button?: { text?: string };
          interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
        }[];
      };
    }[];
  }[];
}

// Webhook gövdesinden mesajları çıkarır. Durum bildirimleri (okundu, iletildi) atlanır.
// Fotoğraflar kimliğiyle gelir (indirme lib/inbound.ts'de); diğer metin dışı mesajlar (ses,
// video, belge) şimdilik kısa bir açıklama metnine dönüştürülür.
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
        // Tepki (👍), sistem bildirimi ve desteklenmeyen içerik yanıt gerektirmez.
        if (["reaction", "system", "unsupported"].includes(message.type)) continue;
        const contact = value?.contacts?.find((c) => c.wa_id === message.from);
        if (message.type === "image" && message.image?.id) {
          result.push({
            id: message.id,
            phoneNumberId,
            from: message.from,
            contactName: contact?.profile?.name,
            text: message.image.caption?.trim() ?? "",
            image: { mediaId: message.image.id, mimeType: message.image.mime_type ?? "image/jpeg" },
            timestamp: Number(message.timestamp),
          });
          continue;
        }
        const text =
          message.text?.body ??
          message.button?.text ??
          message.interactive?.button_reply?.title ??
          message.interactive?.list_reply?.title ??
          `[Müşteri bir ${message.type} mesajı gönderdi; asistan şimdilik sadece metin okuyabiliyor.]`;
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

// Gelen bir fotoğrafı indirir: önce kimlikten geçici adresi alır, sonra baytları (ikisi de
// erişim anahtarıyla). Çok büyük dosyalar indirilmez.
export async function downloadMedia(
  mediaId: string,
  maxBytes: number,
  fetchImpl: typeof fetch = fetch,
): Promise<{ data: Buffer; mimeType: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN tanımlı değil");
  const headers = { Authorization: `Bearer ${token}` };
  const meta = await fetchImpl(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(mediaId)}`, { headers });
  if (!meta.ok) throw new Error(`Medya bilgisi alınamadı (${meta.status})`);
  const info = (await meta.json()) as { url?: string; mime_type?: string; file_size?: number };
  if (!info.url) throw new Error("Medya adresi yok");
  if (info.file_size && info.file_size > maxBytes) throw new Error("Medya çok büyük");
  const file = await fetchImpl(info.url, { headers });
  if (!file.ok) throw new Error(`Medya indirilemedi (${file.status})`);
  const data = Buffer.from(await file.arrayBuffer());
  if (data.length > maxBytes) throw new Error("Medya çok büyük");
  return { data, mimeType: info.mime_type?.split(";")[0] ?? "image/jpeg" };
}

async function postMessage(phoneNumberId: string, message: Record<string, unknown>): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN tanımlı değil");

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...message }),
  });
  if (!res.ok) {
    throw new Error(`WhatsApp gönderimi başarısız (${res.status}): ${await res.text()}`);
  }
}

// Müşterinin başlattığı 24 saatlik pencere içinde serbest metin yanıtı gönderir.
export async function sendText(params: { phoneNumberId: string; to: string; text: string }): Promise<void> {
  await postMessage(params.phoneNumberId, {
    to: params.to,
    type: "text",
    // Randevu kartı bağlantısının önizlemesi görünsün.
    text: { preview_url: true, body: params.text },
  });
}

// WhatsApp etkileşimli mesaj sınırları.
const BODY_LIMIT = 1024;
const BUTTON_TITLE_LIMIT = 20;
const ROW_TITLE_LIMIT = 24;

const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

// Seçenekleri WhatsApp'ın etkileşimli mesajına çevirir: en fazla 3 kısa seçenek düğme,
// daha fazlası liste olur. Müşterinin seçimi etiket olarak geri gelir (parseInboundMessages).
export function buildInteractive(text: string, options: string[]): Record<string, unknown> {
  const body = { text: cut(text, BODY_LIMIT) };
  const asButtons = options.length <= 3 && options.every((o) => o.length <= BUTTON_TITLE_LIMIT);
  if (asButtons) {
    return {
      type: "button",
      body,
      action: {
        buttons: options.map((o, i) => ({ type: "reply", reply: { id: `opt_${i}`, title: o } })),
      },
    };
  }
  return {
    type: "list",
    body,
    action: {
      button: "Seçenekler",
      sections: [
        {
          title: "Seçin",
          rows: options.slice(0, 10).map((o, i) => ({ id: `opt_${i}`, title: cut(o, ROW_TITLE_LIMIT) })),
        },
      ],
    },
  };
}

// Asistan yanıtını gönderir: seçenek varsa etkileşimli mesaj, yoksa düz metin. Metin
// etkileşimli mesajın gövde sınırını aşarsa önce metin, sonra kısa gövdeli seçenekler gider.
export async function sendReply(params: {
  phoneNumberId: string;
  to: string;
  text: string;
  options?: string[];
}): Promise<void> {
  const { phoneNumberId, to, text, options = [] } = params;
  if (options.length === 0) return sendText({ phoneNumberId, to, text });
  if (text.length > BODY_LIMIT) {
    await sendText({ phoneNumberId, to, text });
    await postMessage(phoneNumberId, { to, type: "interactive", interactive: buildInteractive("Seçiniz:", options) });
    return;
  }
  await postMessage(phoneNumberId, { to, type: "interactive", interactive: buildInteractive(text, options) });
}

// Onaylı şablon mesajı: 24 saatlik pencere dışında (ör. hatırlatma) sadece bununla yazılabilir.
// Şablon Meta'da önceden oluşturulup onaylanmış olmalı; parametreler gövdedeki {{1}}, {{2}}… yerine geçer.
export async function sendTemplate(params: {
  phoneNumberId: string;
  to: string;
  name: string;
  language: string;
  bodyParams: string[];
}): Promise<void> {
  await postMessage(params.phoneNumberId, {
    to: params.to,
    type: "template",
    template: {
      name: params.name,
      language: { code: params.language },
      components: [
        { type: "body", parameters: params.bodyParams.map((text) => ({ type: "text", text })) },
      ],
    },
  });
}
