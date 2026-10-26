import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { freeSlots, SINGLE_RESOURCE, type Slot } from "../availability";
import type { Business } from "../business";
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
}

export interface ToolOutcome {
  content: string;
  isError?: boolean;
}

export async function executeTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
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
              ? { start: s.start, staff: s.staffIds.map((id) => ({ id, name: staffName(id) })) }
              : { start: s.start },
          ),
        }),
      };
    }

    case "book_appointment": {
      const args = bookAppointmentInput.parse(input);
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
        }),
      };
    }

    case "save_lead": {
      const args = saveLeadInput.parse(input);
      const merged: Lead = { ...(conversation.lead ?? { updatedAt: "" }) };
      for (const [key, value] of Object.entries(args) as [keyof typeof args, string][]) {
        if (value.trim()) merged[key] = value.trim();
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
        content: "Seçenekler müşteriye düğme olarak gösterilecek. Metinde aynı listeyi tekrar yazma; kısaca hangisini istediğini sor.",
      };
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
