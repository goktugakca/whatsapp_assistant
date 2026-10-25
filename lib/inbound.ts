import { runAssistant, type CreateMessage } from "./agent/run";
import { getBusinessByPhoneNumberId } from "./business";
import type { Store } from "./store";
import { sendText, type InboundMessage } from "./whatsapp";

type Outcome = "duplicate" | "unknown-business" | "handoff" | "replied";
type Deps = { store: Store; send?: typeof sendText; createMessage?: CreateMessage };

// Aynı müşteriden art arda gelen mesajlar sırayla işlenmeli; yoksa iki model çağrısı
// aynı geçmişe aynı anda yazar. Tek süreç içinde geçerli; çoklu sunucuda kuyruk gerekir.
const queues = new Map<string, Promise<unknown>>();

export function handleInboundMessage(message: InboundMessage, deps: Deps): Promise<Outcome> {
  const key = `${message.phoneNumberId}:${message.from}`;
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(() => processMessage(message, deps));
  queues.set(key, next);
  const cleanup = () => {
    if (queues.get(key) === next) queues.delete(key);
  };
  next.then(cleanup, cleanup);
  return next;
}

// Gelen bir WhatsApp mesajının tüm akışı: tekrarları ele, işletmeyi bul,
// devredilmiş konuşmada sessiz kal, değilse asistanı çalıştırıp yanıtla.
async function processMessage(message: InboundMessage, deps: Deps): Promise<Outcome> {
  const { store } = deps;
  const send = deps.send ?? sendText;

  if (!(await store.markMessageSeen(message.id))) return "duplicate";

  const business = getBusinessByPhoneNumberId(message.phoneNumberId);
  if (!business) {
    console.warn("Bilinmeyen phone_number_id:", message.phoneNumberId);
    return "unknown-business";
  }

  const conversation = await store.findOrCreateConversation({
    businessId: business.id,
    channel: "whatsapp",
    contact: message.from,
    contactName: message.contactName,
  });

  if (conversation.status === "handoff") {
    // Personel devraldı: mesajı panelde göster, otomatik yanıt verme. Geçmişe de ekle ki
    // asistan yeniden açıldığında konuşmanın bu kısmını bilsin.
    conversation.transcript.push({ from: "customer", text: message.text, at: new Date().toISOString() });
    conversation.history.push({ role: "user", content: message.text });
    await store.saveConversation(conversation);
    return "handoff";
  }

  const { reply } = await runAssistant({
    business,
    conversation,
    store,
    text: message.text,
    createMessage: deps.createMessage,
  });
  await store.saveConversation(conversation);
  await send({ phoneNumberId: message.phoneNumberId, to: message.from, text: reply });
  return "replied";
}
