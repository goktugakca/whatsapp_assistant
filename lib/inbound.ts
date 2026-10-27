import { runAssistant, type CreateMessage } from "./agent/run";
import { businessIdForPhoneNumber, loadBusiness } from "./business";
import type { Conversation, Store } from "./store";
import { appUrl } from "./calendar";
import { countMediaMarkers, MAX_IMAGES_PER_CONVERSATION, MAX_MEDIA_BYTES, mediaMarker } from "./media";
import { downloadMedia, sendReply, type InboundMessage } from "./whatsapp";

type Outcome = "duplicate" | "unknown-business" | "handoff" | "replied";
type Deps = {
  store: Store;
  send?: typeof sendReply;
  createMessage?: CreateMessage;
  download?: (mediaId: string) => Promise<{ data: Buffer; mimeType: string }>;
};

// Fotoğrafı indirip kaydeder. Panelde her zaman görünür; modele sadece konuşma başına sınır
// dolmadıysa gösterilir. İndirilemezse müşterinin metni bir notla devam eder.
async function storeImage(message: InboundMessage, conversation: Conversation, deps: Deps) {
  if (!message.image) return { text: message.text };
  try {
    const download = deps.download ?? ((id: string) => downloadMedia(id, MAX_MEDIA_BYTES));
    const { data, mimeType } = await download(message.image.mediaId);
    const media = await deps.store.saveMedia({
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
    console.error("WhatsApp fotoğrafı indirilemedi:", message.image.mediaId, error);
    const note = "[Müşteri bir fotoğraf gönderdi ama indirilemedi.]";
    return { text: [message.text, note].filter(Boolean).join("\n") };
  }
}

// Gelen bir WhatsApp mesajının tüm akışı: tekrarları ele, işletmeyi bul,
// devredilmiş konuşmada sessiz kal, değilse asistanı çalıştırıp yanıtla.
// Aynı müşterinin art arda gelen mesajları kilit sayesinde sırayla işlenir.
export async function handleInboundMessage(message: InboundMessage, deps: Deps): Promise<Outcome> {
  const { store } = deps;
  const send = deps.send ?? sendReply;

  if (!(await store.markMessageSeen(message.id))) return "duplicate";

  const businessId = businessIdForPhoneNumber(message.phoneNumberId);
  const business = businessId && (await loadBusiness(store, businessId));
  if (!business) {
    console.warn("Bilinmeyen phone_number_id; WHATSAPP_PHONE_NUMBER_ID ile aynı mı?", message.phoneNumberId);
    return "unknown-business";
  }

  const key = { businessId: business.id, channel: "whatsapp" as const, contact: message.from };
  return store.withConversationLock(key, async () => {
    const conversation = await store.findOrCreateConversation({ ...key, contactName: message.contactName });
    const { text, mediaId, panelMediaId } = await storeImage(message, conversation, deps);

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
    const outgoing = [reply, ...links].join("\n\n");
    await send({ phoneNumberId: message.phoneNumberId, to: message.from, text: outgoing, options });
    return "replied";
  });
}
