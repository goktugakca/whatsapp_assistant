import { runAssistant, type CreateMessage } from "./agent/run";
import { businessIdForPhoneNumber, loadBusiness } from "./business";
import type { Store } from "./store";
import { appUrl } from "./calendar";
import { sendReply, type InboundMessage } from "./whatsapp";

type Outcome = "duplicate" | "unknown-business" | "handoff" | "replied";
type Deps = { store: Store; send?: typeof sendReply; createMessage?: CreateMessage };

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

    if (conversation.status === "handoff") {
      // Personel devraldı: mesajı panelde göster, otomatik yanıt verme. Geçmişe de ekle ki
      // asistan yeniden açıldığında konuşmanın bu kısmını bilsin.
      conversation.transcript.push({ from: "customer", text: message.text, at: new Date().toISOString() });
      conversation.history.push({ role: "user", content: message.text });
      await store.saveConversation(conversation);
      return "handoff";
    }

    const { reply, options, appointments } = await runAssistant({
      business,
      conversation,
      store,
      text: message.text,
      createMessage: deps.createMessage,
    });
    await store.saveConversation(conversation);
    // Oluşan randevu için takvime ekleme sayfasının bağlantısı yanıta eklenir.
    const base = appUrl();
    const links = base ? appointments.map((a) => `📅 Randevu ve takvime ekle: ${base}/randevu/${a.id}`) : [];
    const text = [reply, ...links].join("\n\n");
    await send({ phoneNumberId: message.phoneNumberId, to: message.from, text, options });
    return "replied";
  });
}
