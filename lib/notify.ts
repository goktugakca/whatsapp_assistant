import { phoneNumberIdFor, type Business } from "./business";
import { normalizePhone } from "./phone";
import type { Conversation } from "./store";
import { sendTemplate, sendText } from "./whatsapp";

// Asistan konuşmayı personele bıraktığında işletme sahibine WhatsApp'tan haber verir.
// Onaylı şablon (WHATSAPP_HANDOFF_TEMPLATE: {{1}} müşteri, {{2}} neden) varsa her zaman gider;
// yoksa serbest metin denenir, bu da ancak sahibi son 24 saatte işletme numarasına yazdıysa ulaşır.
// Hata bildirim akışını durdurmaz; sadece loglanır.
export async function notifyHandoff(
  business: Business,
  conversation: Conversation,
  deps: { sendText?: typeof sendText; sendTemplate?: typeof sendTemplate } = {},
): Promise<boolean> {
  const to = business.notifyPhone && normalizePhone(business.notifyPhone);
  const phoneNumberId = phoneNumberIdFor(business);
  if (!to || !phoneNumberId) return false;
  const who = conversation.contactName ?? (conversation.channel === "instagram" ? "Instagram müşterisi" : conversation.contact);
  const reason = conversation.handoffReason ?? "Müşteri sizi bekliyor";
  try {
    const template = process.env.WHATSAPP_HANDOFF_TEMPLATE;
    if (template) {
      await (deps.sendTemplate ?? sendTemplate)({
        phoneNumberId,
        to,
        name: template,
        language: process.env.WHATSAPP_REMINDER_LANGUAGE ?? "tr",
        bodyParams: [who, reason],
      });
    } else {
      await (deps.sendText ?? sendText)({
        phoneNumberId,
        to,
        text: `Sırada: ${who} sizi bekliyor. ${reason}. Panelden yanıtlayın.`,
      });
    }
    return true;
  } catch (error) {
    console.error("Devretme bildirimi gönderilemedi:", business.id, error);
    return false;
  }
}
