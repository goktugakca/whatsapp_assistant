import { runAssistant, type CreateMessage } from "./agent/run";
import { businessIdForPhoneNumber, loadBusiness } from "./business";
import type { Conversation, Store } from "./store";
import { appUrl } from "./calendar";
import {
  downloadInstagramImage,
  fetchInstagramProfile,
  openToken,
  sendInstagramReply,
  type InstagramInbound,
} from "./instagram";
import { countMediaMarkers, MAX_IMAGES_PER_CONVERSATION, MAX_MEDIA_BYTES, mediaMarker } from "./media";
import { downloadMedia, sendReply, type InboundMessage } from "./whatsapp";

type Outcome = "duplicate" | "unknown-business" | "handoff" | "replied";
type Download = () => Promise<{ data: Buffer; mimeType: string }>;

// Kanaldan bağımsız gelen mesaj: işletme bulunmuş, gönderim ve indirme kanala göre verilmiş.
interface Incoming {
  channel: "whatsapp" | "instagram";
  businessId: string;
  from: string;
  contactName?: string;
  resolveName?: () => Promise<string | undefined>; // Adı webhook'ta gelmeyen kanallar için
  text: string;
  image?: { ref: string; download: Download };
  send: (text: string, options: string[]) => Promise<void>;
}

type Deps = { store: Store; createMessage?: CreateMessage };

// Fotoğrafı indirip kaydeder. Panelde her zaman görünür; modele sadece konuşma başına sınır
// dolmadıysa gösterilir. İndirilemezse müşterinin metni bir notla devam eder.
async function storeImage(message: Incoming, conversation: Conversation, store: Store) {
  if (!message.image) return { text: message.text };
  try {
    const { data, mimeType } = await message.image.download();
    const media = await store.saveMedia({
      businessId: conversation.businessId,
      conversationId: conversation.id,
      mimeType,
      data,
    });
    if (countMediaMarkers(conversation.history) >= MAX_IMAGES_PER_CONVERSATION) {
      const note = "[Müşteri bir fotoğraf daha gönderdi; panelde görülebilir.]";
      return { text: [message.text, note].filter(Boolean).join("\n"), panelMediaId: media.id };
    }
    return { text: message.text, mediaId: media.id };
  } catch (error) {
    console.error(`${message.channel} fotoğrafı indirilemedi:`, message.image.ref, error);
    const note = "[Müşteri bir fotoğraf gönderdi ama indirilemedi.]";
    return { text: [message.text, note].filter(Boolean).join("\n") };
  }
}

// Gelen mesajın tüm akışı: devredilmiş konuşmada sessiz kal, değilse asistanı çalıştırıp
// yanıtla. Aynı müşterinin art arda gelen mesajları kilit sayesinde sırayla işlenir.
async function handleIncoming(message: Incoming, deps: Deps): Promise<Outcome> {
  const { store } = deps;
  const business = await loadBusiness(store, message.businessId);
  if (!business) return "unknown-business";

  const key = { businessId: business.id, channel: message.channel, contact: message.from };
  return store.withConversationLock(key, async () => {
    const conversation = await store.findOrCreateConversation({ ...key, contactName: message.contactName });
    if (!conversation.contactName && message.resolveName) conversation.contactName = await message.resolveName();
    const { text, mediaId, panelMediaId } = await storeImage(message, conversation, store);

    if (conversation.status === "handoff") {
      // Personel devraldı: mesajı panelde göster, otomatik yanıt verme. Geçmişe de ekle ki
      // asistan yeniden açıldığında konuşmanın bu kısmını bilsin.
      const shown = mediaId ?? panelMediaId;
      conversation.transcript.push({ from: "customer", text, at: new Date().toISOString(), mediaId: shown });
      conversation.history.push({
        role: "user",
        content: mediaId ? [mediaMarker(mediaId), { type: "text", text: text || "(Fotoğraf)" }] : text || "(Fotoğraf)",
      });
      await store.saveConversation(conversation);
      return "handoff";
    }

    const customerEntry = conversation.transcript.length; // runAssistant müşterinin mesajını buraya ekler
    const { reply, options, appointments } = await runAssistant({
      business,
      conversation,
      store,
      text,
      mediaId,
      createMessage: deps.createMessage,
    });
    // Sınır dolduğu için modele gösterilmeyen fotoğraf panelde yine de görünsün.
    if (panelMediaId) conversation.transcript[customerEntry].mediaId = panelMediaId;
    await store.saveConversation(conversation);
    // Oluşan randevu için takvime ekleme sayfasının bağlantısı yanıta eklenir.
    const base = appUrl();
    const links = base ? appointments.map((a) => `📅 Randevu ve takvime ekle: ${base}/randevu/${a.id}`) : [];
    await message.send([reply, ...links].join("\n\n"), options);
    return "replied";
  });
}

// WhatsApp: tekrarları ele, numaradan işletmeyi bul.
export async function handleInboundMessage(
  message: InboundMessage,
  deps: Deps & {
    send?: typeof sendReply;
    download?: (mediaId: string) => Promise<{ data: Buffer; mimeType: string }>;
  },
): Promise<Outcome> {
  if (!(await deps.store.markMessageSeen(message.id))) return "duplicate";
  const businessId = businessIdForPhoneNumber(message.phoneNumberId);
  if (!businessId) {
    console.warn("Bilinmeyen phone_number_id; WHATSAPP_PHONE_NUMBER_ID ile aynı mı?", message.phoneNumberId);
    return "unknown-business";
  }
  const send = deps.send ?? sendReply;
  const download = deps.download ?? ((id: string) => downloadMedia(id, MAX_MEDIA_BYTES));
  const image = message.image;
  return handleIncoming(
    {
      channel: "whatsapp",
      businessId,
      from: message.from,
      contactName: message.contactName,
      text: message.text,
      image: image && { ref: image.mediaId, download: () => download(image.mediaId) },
      send: (text, options) => send({ phoneNumberId: message.phoneNumberId, to: message.from, text, options }),
    },
    deps,
  );
}

// Instagram: hesap kimliğinden bağlı işletmeyi ve erişim anahtarını bul.
export async function handleInstagramMessage(
  message: InstagramInbound,
  deps: Deps & { fetchImpl?: typeof fetch },
): Promise<Outcome> {
  if (!(await deps.store.markMessageSeen(`ig:${message.id}`))) return "duplicate";
  const account = await deps.store.findInstagramAccount(message.accountId);
  if (!account) {
    console.warn("Bağlı olmayan Instagram hesabından mesaj:", message.accountId);
    return "unknown-business";
  }
  const token = openToken(account.sealedToken);
  const { fetchImpl } = deps;
  const url = message.imageUrl;
  return handleIncoming(
    {
      channel: "instagram",
      businessId: account.businessId,
      from: message.from,
      resolveName: () => fetchInstagramProfile(token, message.from, fetchImpl),
      text: message.text,
      image: url ? { ref: message.id, download: () => downloadInstagramImage(url, MAX_MEDIA_BYTES, fetchImpl) } : undefined,
      send: (text, options) => sendInstagramReply({ token, to: message.from, text, options, fetchImpl }),
    },
    deps,
  );
}
