import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { freeSlots } from "../availability";
import type { Clinic } from "../clinic";
import type { Conversation, Store } from "../store";

export function buildTools(clinic: Clinic): Anthropic.Beta.Messages.BetaTool[] {
  const serviceIds = clinic.services.map((s) => s.id);
  return [
    {
      name: "check_availability",
      description:
        "Belirli bir gün ve hizmet için boş randevu saatlerini döndürür. Hastaya saat önermeden önce mutlaka kullan.",
      strict: true,
      input_schema: {
        type: "object",
        properties: {
          date: { type: "string", description: "Klinik yerel saatine göre gün, YYYY-MM-DD" },
          service_id: { type: "string", enum: serviceIds },
        },
        required: ["date", "service_id"],
        additionalProperties: false,
      },
    },
    {
      name: "book_appointment",
      description:
        "Randevuyu oluşturur. Sadece hasta saati onayladıktan ve adını öğrendikten sonra kullan. start, check_availability'den dönen saatlerden biri olmalı.",
      strict: true,
      input_schema: {
        type: "object",
        properties: {
          patient_name: { type: "string" },
          service_id: { type: "string", enum: serviceIds },
          start: { type: "string", description: "check_availability'den dönen ISO saat" },
        },
        required: ["patient_name", "service_id", "start"],
        additionalProperties: false,
      },
    },
    {
      name: "save_lead",
      description:
        "Hasta hakkında öğrenilen bilgileri kaydeder; klinik ekibi bunu panelde görür. Bilmediğin alanları boş metin bırak. Yeni bilgi öğrendikçe tekrar çağırabilirsin.",
      strict: true,
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string" },
          country: { type: "string" },
          language: { type: "string" },
          treatment: { type: "string", description: "İlgilendiği tedavi" },
          timeframe: { type: "string", description: "Ne zaman gelmek istediği" },
          notes: { type: "string", description: "Ekip için kısa not" },
        },
        required: ["name", "country", "language", "treatment", "timeframe", "notes"],
        additionalProperties: false,
      },
    },
    {
      name: "handoff_to_human",
      description:
        "Konuşmayı klinik personeline devreder. Bundan sonra asistan bu hastaya otomatik yanıt vermez.",
      strict: true,
      input_schema: {
        type: "object",
        properties: { reason: { type: "string", description: "Devretme nedeni, ekip için kısa" } },
        required: ["reason"],
        additionalProperties: false,
      },
    },
  ];
}

const checkAvailabilityInput = z.object({ date: z.string(), service_id: z.string() });
const bookAppointmentInput = z.object({
  patient_name: z.string().min(1),
  service_id: z.string(),
  start: z.string(),
});
const saveLeadInput = z.object({
  name: z.string(),
  country: z.string(),
  language: z.string(),
  treatment: z.string(),
  timeframe: z.string(),
  notes: z.string(),
});
const handoffInput = z.object({ reason: z.string() });

export interface ToolContext {
  clinic: Clinic;
  conversation: Conversation;
  store: Store;
  now?: Date;
}

export interface ToolOutcome {
  content: string;
  isError?: boolean;
}

export async function executeTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const { clinic, conversation, store } = ctx;

  switch (name) {
    case "check_availability": {
      const args = checkAvailabilityInput.parse(input);
      const service = clinic.services.find((s) => s.id === args.service_id);
      if (!service) return { content: "Bilinmeyen hizmet.", isError: true };
      const slots = await slotsFor(ctx, args.date, service.durationMinutes);
      if (slots.length === 0) return { content: `${args.date} için boş saat yok. Başka bir gün dene.` };
      return { content: JSON.stringify({ date: args.date, service: service.name, slots }) };
    }

    case "book_appointment": {
      const args = bookAppointmentInput.parse(input);
      const service = clinic.services.find((s) => s.id === args.service_id);
      if (!service) return { content: "Bilinmeyen hizmet.", isError: true };
      const date = args.start.slice(0, 10);
      const slots = await slotsFor(ctx, date, service.durationMinutes);
      if (!slots.includes(args.start)) {
        return {
          content: "Bu saat artık uygun değil veya geçerli bir saat değil. check_availability ile tekrar kontrol et.",
          isError: true,
        };
      }
      const end = new Date(Date.parse(args.start) + service.durationMinutes * 60_000).toISOString();
      const appointment = await store.addAppointment({
        clinicId: clinic.id,
        conversationId: conversation.id,
        patientName: args.patient_name,
        contact: conversation.contact,
        serviceId: service.id,
        start: args.start,
        end,
      });
      return { content: JSON.stringify({ ok: true, appointmentId: appointment.id, start: args.start, service: service.name }) };
    }

    case "save_lead": {
      const args = saveLeadInput.parse(input);
      const previous = conversation.lead ?? { updatedAt: "" };
      const merged = { ...previous };
      for (const [key, value] of Object.entries(args)) {
        if (value.trim()) merged[key as keyof typeof args] = value.trim();
      }
      conversation.lead = { ...merged, updatedAt: new Date().toISOString() };
      return { content: "Kaydedildi." };
    }

    case "handoff_to_human": {
      const args = handoffInput.parse(input);
      conversation.status = "handoff";
      conversation.handoffReason = args.reason;
      return { content: "Konuşma ekibe devredildi. Hastaya ekibin en kısa sürede döneceğini söyle." };
    }

    default:
      return { content: `Bilinmeyen araç: ${name}`, isError: true };
  }
}

async function slotsFor(ctx: ToolContext, date: string, durationMinutes: number): Promise<string[]> {
  const appointments = await ctx.store.listAppointments(ctx.clinic.id);
  return freeSlots({
    clinic: ctx.clinic,
    date,
    durationMinutes,
    busy: appointments.map((a) => ({ start: a.start, end: a.end })),
    now: ctx.now,
  });
}
