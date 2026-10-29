import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { freeSlots, SINGLE_RESOURCE, type Slot } from "../availability";
import { photoQuotePolicy, priceFor, type Business } from "../business";
import { containsProfanity } from "../profanity";
import { formatRange, loadExampleImages, MIN_EXAMPLES, pickExamples, quoteFromExamples, type ParseQuote } from "../photo-quote";
import type { Conversation, Lead, Store } from "../store";

const ANY = "any";

export function buildTools(business: Business): Anthropic.Beta.Messages.BetaTool[] {
  const serviceIds = business.services.map((s) => s.id);
  const staffIds = [ANY, ...business.staff.map((s) => s.id)];
  const staffDescription =
    business.staff.length > 0
      ? 'Belirli bir çalışan isteniyorsa onun kimliği, tercih yoksa "any".'
      : 'Bu işletmede çalışan seçimi yok; her zaman "any".';

  return [
    {
      name: "check_availability",
      description:
        "Belirli bir gün ve hizmet için boş randevu saatlerini ve o saatte müsait çalışanları döndürür. Müşteriye saat önermeden önce mutlaka kullan.",
      strict: true,
      input_schema: {
        type: "object",
        properties: {
          date: { type: "string", description: "İşletmenin yerel saatine göre gün, YYYY-MM-DD" },
          service_id: { type: "string", enum: serviceIds },
          staff_id: { type: "string", enum: staffIds, description: staffDescription },
        },
        required: ["date", "service_id", "staff_id"],
        additionalProperties: false,
      },
    },
    {
      name: "book_appointment",
      description:
        "Randevuyu oluşturur. Sadece müşteri saati onayladıktan ve adını öğrendikten sonra kullan. start, check_availability'den dönen saatlerden biri olmalı.",
      strict: true,
      input_schema: {
        type: "object",
        properties: {
          customer_name: { type: "string" },
          service_id: { type: "string", enum: serviceIds },
          staff_id: { type: "string", enum: staffIds, description: staffDescription },
          start: { type: "string", description: "check_availability'den dönen ISO saat" },
        },
        required: ["customer_name", "service_id", "staff_id", "start"],
        additionalProperties: false,
      },
    },
    {
      name: "save_lead",
      description:
        "Müşteri hakkında öğrenilen bilgileri kaydeder; işletme bunu panelde görür. Bilmediğin alanları boş metin bırak. Yeni bilgi öğrendikçe tekrar çağırabilirsin.",
      strict: true,
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string" },
          language: { type: "string" },
          country: { type: "string" },
          interest: { type: "string", description: "İlgilendiği hizmet" },
          timeframe: { type: "string", description: "Ne zaman gelmek istediği" },
          notes: { type: "string", description: "İşletme için kısa not" },
        },
        required: ["name", "language", "country", "interest", "timeframe", "notes"],
        additionalProperties: false,
      },
    },
    {
      name: "list_my_appointments",
      description:
        "Bu müşterinin bu işletmedeki yaklaşan randevularını döndürür. Müşteri randevusunu sorduğunda, iptal veya erteleme istediğinde önce bunu kullan.",
      strict: true,
      input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
    {
      name: "cancel_appointment",
      description:
        "Müşterinin kendi randevusunu iptal eder; saat başkalarına açılır. Sadece müşteri açıkça iptal istediğinde ve hangi randevu olduğu netken kullan. Erteleme isteniyorsa önce yeni saate book_appointment ile randevu al, başarılı olursa eskisini iptal et.",
      strict: true,
      input_schema: {
        type: "object",
        properties: { appointment_id: { type: "string", description: "list_my_appointments'tan dönen kimlik" } },
        required: ["appointment_id"],
        additionalProperties: false,
      },
    },
    {
      name: "show_options",
      description:
        "Müşteriye tıklanabilir seçenek düğmeleri gösterir (WhatsApp'ta da düğme/liste olarak gider). Boş saatleri, hizmetleri, çalışanları veya evet/hayır gibi seçimleri sunarken kullan. Her seçenek en fazla 24 karakterlik kısa bir etiket olsun (ör. \"Salı 14:30\", \"Saç + sakal\"); en fazla 10 seçenek. Müşteri bir düğmeye basarsa etiket mesaj olarak gelir.",
      strict: true,
      input_schema: {
        type: "object",
        properties: {
          options: { type: "array", items: { type: "string" }, description: "Kısa seçenek etiketleri" },
        },
        required: ["options"],
        additionalProperties: false,
      },
    },
    ...(photoQuotePolicy(business) === "examples"
      ? [
          {
            name: "quote_from_photo",
            description:
              "Müşterinin gönderdiği son fotoğraf için, salonun geçmişte benzer fotoğraflara verdiği fiyatlara bakarak ön fiyat aralığı döndürür. Müşteri fotoğrafla fiyat sorduğunda kullan. Fiyat veremezse işletmeye devret.",
            strict: true,
            input_schema: {
              type: "object",
              properties: {
                question: { type: "string", description: "Müşterinin ne istediği, kendi sözleriyle (ör. 'balyaj kaç para')" },
              },
              required: ["question"],
              additionalProperties: false,
            },
          } satisfies Anthropic.Beta.Messages.BetaTool,
        ]
      : []),
    {
      name: "block_customer",
      description:
        "Küfür, hakaret, cinsel içerik, taciz veya ısrarla uygunsuz istek yazan müşteriyi engeller: bundan sonra asistan bu kişiye yanıt vermez, mesajları panelde 'engellendi' olarak görünür. Önce bir kez nazikçe sınır koy; devam ederse kullan. Açıkça uygunsuz ilk mesajda da kullanabilirsin.",
      strict: true,
      input_schema: {
        type: "object",
        properties: { reason: { type: "string", description: "Engelleme nedeni, işletme için kısa ve nötr" } },
        required: ["reason"],
        additionalProperties: false,
      },
    },
    {
      name: "handoff_to_human",
      description:
        "Konuşmayı işletme personeline devreder. Bundan sonra asistan bu müşteriye otomatik yanıt vermez.",
      strict: true,
      input_schema: {
        type: "object",
        properties: { reason: { type: "string", description: "Devretme nedeni, işletme için kısa" } },
        required: ["reason"],
        additionalProperties: false,
      },
    },
  ];
}

const checkAvailabilityInput = z.object({ date: z.string(), service_id: z.string(), staff_id: z.string() });
const bookAppointmentInput = z.object({
  customer_name: z.string().min(1),
  service_id: z.string(),
  staff_id: z.string(),
  start: z.string(),
});
const saveLeadInput = z.object({
  name: z.string(),
  language: z.string(),
  country: z.string(),
  interest: z.string(),
  timeframe: z.string(),
  notes: z.string(),
});
const handoffInput = z.object({ reason: z.string() });
const showOptionsInput = z.object({ options: z.array(z.string()) });
const cancelInput = z.object({ appointment_id: z.string() });
const quoteInput = z.object({ question: z.string() });

export const MAX_OPTIONS = 10;
export const MAX_OPTION_LENGTH = 24; // WhatsApp liste satırı başlık sınırı

// Bir asistan turunda araçların ürettiği, metin dışındaki çıktılar.
export interface TurnEffects {
  options: string[];
  bookedAppointmentIds: string[];
}

export interface ToolContext {
  business: Business;
  conversation: Conversation;
  store: Store;
  now?: Date;
  effects?: TurnEffects;
  parseQuote?: ParseQuote; // Testlerde fotoğraf fiyat modelini taklit etmek için
}

export interface ToolOutcome {
  content: string;
  isError?: boolean;
}

// Model bazen Türkçe karakterleri araç girdisinde kaçış kodu olarak yazıyor: "Sal\\u0131"
// ya da ters eğik çizgiyi de atlayıp "Salu0131". Müşteriye ve veritabanına gerçek karakter
// gitsin diye tüm metin alanlarında çözülür. Çizgisiz biçim sadece Türkçe harf kodları için
// çözülür; normal metindeki "u" ile başlayan rastgele dizileri bozmamak için.
const TURKISH_CODES = "00e7|00c7|011f|011e|0131|0130|00f6|00d6|015f|015e|00fc|00dc|00e2|00c2|00ee|00fb";
const BARE_TURKISH_ESCAPE = new RegExp(`u(${TURKISH_CODES})`, "gi");

export function decodeUnicodeEscapes<T>(value: T): T {
  if (typeof value === "string") {
    const fromHex = (_: string, hex: string) => String.fromCharCode(parseInt(hex, 16));
    return value.replace(/\\u([0-9a-fA-F]{4})/g, fromHex).replace(BARE_TURKISH_ESCAPE, fromHex) as T;
  }
  if (Array.isArray(value)) return value.map(decodeUnicodeEscapes) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decodeUnicodeEscapes(v)])) as T;
  }
  return value;
}

export async function executeTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const input = decodeUnicodeEscapes(rawInput);
  const { business, conversation, store } = ctx;
  const staffName = (id: string) => business.staff.find((s) => s.id === id)?.name;

  switch (name) {
    case "check_availability": {
      const args = checkAvailabilityInput.parse(input);
      const service = business.services.find((s) => s.id === args.service_id);
      if (!service) return { content: "Bilinmeyen hizmet.", isError: true };
      const slots = await slotsFor(ctx, args.date, service.id, args.staff_id);
      if (slots.length === 0) return { content: `${args.date} için boş saat yok. Başka bir gün dene.` };
      return {
        content: JSON.stringify({
          date: args.date,
          service: service.name,
          slots: slots.map((s) =>
            business.staff.length > 0
              ? {
                  start: s.start,
                  staff: s.staffIds.map((id) => ({ id, name: staffName(id), price: priceFor(business, service.id, id) })),
                }
              : { start: s.start },
          ),
        }),
      };
    }

    case "book_appointment": {
      const args = bookAppointmentInput.parse(input);
      if (containsProfanity(args.customer_name)) {
        return {
          content: "Bu ad kabul edilmez (uygunsuz). Randevu alınmadı. Müşteriden gerçek adını bir kez daha iste; yine uygunsuz yazarsa block_customer kullan.",
          isError: true,
        };
      }
      const service = business.services.find((s) => s.id === args.service_id);
      if (!service) return { content: "Bilinmeyen hizmet.", isError: true };
      const slot = (await slotsFor(ctx, args.start.slice(0, 10), service.id, args.staff_id)).find(
        (s) => s.start === args.start,
      );
      if (!slot) {
        return {
          content: "Bu saat artık uygun değil veya geçerli bir saat değil. check_availability ile tekrar kontrol et.",
          isError: true,
        };
      }
      // Müsait çalışanları sırayla dene: kontrol ile kayıt arasında başka bir müşteri
      // aynı kişiyi almış olabilir; veritabanı çakışmayı reddeder.
      const end = new Date(Date.parse(args.start) + service.durationMinutes * 60_000).toISOString();
      let appointment = null;
      for (const staffId of slot.staffIds) {
        appointment = await store.addAppointmentIfFree({
          businessId: business.id,
          conversationId: conversation.id,
          source: "assistant",
          customerName: args.customer_name,
          contact: conversation.contact,
          serviceId: service.id,
          staffId: staffId === SINGLE_RESOURCE ? undefined : staffId,
          start: args.start,
          end,
        });
        if (appointment) break;
      }
      if (!appointment) {
        return { content: "Bu saat az önce doldu. check_availability ile yeni saatleri al.", isError: true };
      }
      ctx.effects?.bookedAppointmentIds.push(appointment.id);
      return {
        content: JSON.stringify({
          ok: true,
          appointmentId: appointment.id,
          start: args.start,
          service: service.name,
          staff: appointment.staffId ? staffName(appointment.staffId) : undefined,
          price: priceFor(business, service.id, appointment.staffId),
        }),
      };
    }

    case "save_lead": {
      const args = saveLeadInput.parse(input);
      const merged: Lead = { ...(conversation.lead ?? { updatedAt: "" }) };
      for (const [key, value] of Object.entries(args) as [keyof typeof args, string][]) {
        if (!value.trim()) continue;
        if (key === "name" && containsProfanity(value)) continue; // uygunsuz ad kaydedilmez
        merged[key] = value.trim();
      }
      conversation.lead = { ...merged, updatedAt: new Date().toISOString() };
      return { content: "Kaydedildi." };
    }

    case "list_my_appointments": {
      const upcoming = await customerAppointments(ctx);
      if (upcoming.length === 0) return { content: "Bu müşterinin yaklaşan randevusu yok." };
      return {
        content: JSON.stringify(
          upcoming.map((a) => ({
            appointment_id: a.id,
            start: a.start,
            service: business.services.find((s) => s.id === a.serviceId)?.name ?? a.serviceId,
            staff: a.staffId ? staffName(a.staffId) : undefined,
          })),
        ),
      };
    }

    case "cancel_appointment": {
      const args = cancelInput.parse(input);
      // Müşteri sadece kendi yaklaşan randevusunu iptal edebilir.
      const own = (await customerAppointments(ctx)).find((a) => a.id === args.appointment_id);
      if (!own) {
        return { content: "Bu müşteriye ait böyle yaklaşan bir randevu yok. list_my_appointments ile kontrol et.", isError: true };
      }
      await store.cancelAppointment(business.id, own.id);
      return { content: JSON.stringify({ ok: true, cancelled: own.id, start: own.start }) };
    }

    case "show_options": {
      const args = showOptionsInput.parse(input);
      const options = [
        ...new Set(
          args.options
            .map((o) => o.trim())
            .filter(Boolean)
            .map((o) => (o.length > MAX_OPTION_LENGTH ? `${o.slice(0, MAX_OPTION_LENGTH - 1)}…` : o)),
        ),
      ].slice(0, MAX_OPTIONS);
      if (options.length === 0) return { content: "Seçenek listesi boş.", isError: true };
      if (ctx.effects) ctx.effects.options = options;
      return {
        content: "Seçenekler müşteriye düğme olarak gösterilecek. Soruyu bu aracı çağırmadan önce sorduysan başka bir şey yazma; sormadıysan tek kısa cümleyle sor. Listeyi metinde tekrar yazma.",
      };
    }

    case "quote_from_photo": {
      const args = quoteInput.parse(input);
      const mediaId = lastPhotoId(conversation);
      const media = mediaId && (await store.getMedia(mediaId));
      if (!media || !/^image\/(jpeg|png|webp|gif)$/.test(media.mimeType)) {
        return { content: "Bu konuşmada okunabilir bir fotoğraf yok. Fiyat verme; işletmeye devret." };
      }
      const all = await store.listPriceExamples(business.id);
      const picked = pickExamples(all, args.question);
      if (all.filter((e) => e.included && e.priceMin !== undefined).length < MIN_EXAMPLES || picked.length === 0) {
        return { content: "Salonun yeterli fiyat örneği yok. Fiyat verme; işletmeye devret." };
      }
      const examples = await loadExampleImages(store, picked);
      const quote = await quoteFromExamples({
        business,
        photo: { mediaType: media.mimeType as "image/jpeg", data: media.data.toString("base64") },
        question: args.question,
        examples,
        parse: ctx.parseQuote,
      });
      if (!quote || quote.matchQuality === "low") {
        return { content: "Benzer örnek bulunamadı veya fotoğraf yeterli değil. Fiyat verme; işletmeye devret." };
      }
      return {
        content: JSON.stringify({
          service: quote.service,
          price: formatRange(quote.priceMin, quote.priceMax),
          confidence: quote.matchQuality,
          note: quote.note,
          reminder: "Bunu ön fiyat olarak söyle; kesin fiyat salonda belirlenir.",
        }),
      };
    }

    case "block_customer": {
      const args = handoffInput.parse(input);
      conversation.status = "blocked";
      conversation.handoffReason = args.reason;
      return { content: "Müşteri engellendi. Tek kısa ve nötr bir cümleyle bu konuda yardımcı olamayacağını söyle; tartışma, açıklama yapma." };
    }

    case "handoff_to_human": {
      const args = handoffInput.parse(input);
      conversation.status = "handoff";
      conversation.handoffReason = args.reason;
      return { content: "Konuşma işletmeye devredildi. Müşteriye en kısa sürede dönüleceğini söyle." };
    }

    default:
      return { content: `Bilinmeyen araç: ${name}`, isError: true };
  }
}

// Konuşmadaki son müşteri fotoğrafının kimliği (lib/media.ts işareti).
function lastPhotoId(conversation: Conversation): string | undefined {
  for (let i = conversation.history.length - 1; i >= 0; i--) {
    const m = conversation.history[i];
    if (m.role !== "user" || typeof m.content === "string") continue;
    for (const b of m.content) {
      const match = b.type === "text" ? /^\[\[foto:([0-9a-f-]{36})\]\]$/.exec(b.text) : null;
      if (match) return match[1];
    }
  }
  return undefined;
}

async function slotsFor(ctx: ToolContext, date: string, serviceId: string, staffId: string): Promise<Slot[]> {
  const appointments = await ctx.store.listAppointments(ctx.business.id);
  return freeSlots({
    business: ctx.business,
    date,
    serviceId,
    staffId: staffId === ANY ? undefined : staffId,
    busy: appointments.map((a) => ({ start: a.start, end: a.end, staffId: a.staffId })),
    now: ctx.now,
  });
}

async function customerAppointments(ctx: ToolContext) {
  const now = (ctx.now ?? new Date()).getTime();
  return (await ctx.store.listAppointments(ctx.business.id)).filter(
    (a) => a.contact === ctx.conversation.contact && Date.parse(a.end) > now,
  );
}
