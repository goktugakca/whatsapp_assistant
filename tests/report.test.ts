import { describe, expect, it } from "vitest";
import { barber } from "@/lib/businesses/barber";
import { buildPilotReport, isOpenAt, minimumPrice } from "@/lib/report";
import type { Appointment, Conversation } from "@/lib/store";

// Berber: Pazartesi–Cumartesi 09:00–21:00 açık. 26 Ekim 2026 Pazartesi.
const from = "2026-10-20T00:00:00+03:00";
const to = "2026-10-28T00:00:00+03:00";

function conversation(id: string, channel: Conversation["channel"], transcript: Conversation["transcript"]): Conversation {
  return {
    id,
    businessId: barber.id,
    channel,
    contact: id,
    status: "bot",
    history: [],
    transcript,
    createdAt: transcript[0]?.at ?? from,
    updatedAt: from,
  };
}

function appointment(over: Partial<Appointment>): Appointment {
  return {
    id: Math.random().toString(36).slice(2),
    businessId: barber.id,
    conversationId: "wa-1",
    source: "assistant",
    customerName: "Ali",
    contact: "wa-1",
    serviceId: "sac",
    staffId: "can",
    start: "2026-10-27T18:00:00+03:00",
    end: "2026-10-27T18:30:00+03:00",
    createdAt: "2026-10-26T12:00:00+03:00",
    ...over,
  };
}

describe("pilot raporu", () => {
  it("işletmenin açık olduğu saatleri ve fiyat alt sınırını doğru hesaplar", () => {
    expect(isOpenAt(barber, "2026-10-26T09:00:00+03:00")).toBe(true);
    expect(isOpenAt(barber, "2026-10-26T20:59:00+03:00")).toBe(true);
    expect(isOpenAt(barber, "2026-10-26T21:00:00+03:00")).toBe(false);
    expect(isOpenAt(barber, "2026-10-25T12:00:00+03:00")).toBe(false); // Pazar
    expect(minimumPrice("900–1.200 TL")).toBe(900);
    expect(minimumPrice("1.500 TL")).toBe(1500);
    expect(minimumPrice("Muayene sonrası belirlenir")).toBeUndefined();
    expect(minimumPrice(undefined)).toBeUndefined();
  });

  it("mesajları, mesai dışını, yanıt süresini ve randevuları sayar; demo ve dönem dışını ayırır", () => {
    const conversations = [
      conversation("wa-1", "whatsapp", [
        { from: "customer", text: "Merhaba", at: "2026-10-26T23:10:00+03:00" },
        { from: "assistant", text: "Merhaba!", at: "2026-10-26T23:10:04+03:00" },
        { from: "customer", text: "Yarın?", at: "2026-10-27T10:00:00+03:00" },
        { from: "customer", text: "Akşam", at: "2026-10-27T10:00:30+03:00" },
        { from: "assistant", text: "18:00 boş", at: "2026-10-27T10:00:36+03:00" },
      ]),
      conversation("wa-2", "whatsapp", [
        { from: "customer", text: "Eski", at: "2026-10-01T10:00:00+03:00" },
        { from: "customer", text: "Usta var mı?", at: "2026-10-26T11:00:00+03:00" },
        { from: "staff", text: "Ben bakayım", at: "2026-10-26T11:05:00+03:00" },
      ]),
      conversation("demo-1", "demo", [{ from: "customer", text: "Deneme", at: "2026-10-26T12:00:00+03:00" }]),
    ];
    const appointments = [
      appointment({ serviceId: "sac-sakal", staffId: "mehmet", createdAt: "2026-10-26T23:11:00+03:00", reminderSentAt: "2026-10-26T18:00:00+03:00" }),
      appointment({}),
      appointment({ cancelledAt: "2026-10-26T13:00:00+03:00" }),
      appointment({ source: "panel", conversationId: undefined }),
      appointment({ conversationId: "demo-1" }),
      appointment({ createdAt: "2026-10-01T12:00:00+03:00" }),
    ];

    const r = buildPilotReport({ business: barber, conversations, appointments, from, to, channels: ["whatsapp"] });
    expect(r).toMatchObject({
      customers: 2,
      customerMessages: 4,
      assistantReplies: 2,
      afterHoursMessages: 1,
      medianResponseSeconds: 5, // 4 sn ve 6 sn
      appointments: { byAssistant: 2, afterHours: 1, cancelled: 1, byPanel: 1 },
      remindersSent: 1,
      handoffs: 1,
      estimatedValue: { amount: 700 + 400, priced: 2 },
    });
    expect(r.byStaff).toEqual([
      { name: "Mehmet Usta", count: 1 },
      { name: "Can", count: 1 },
    ]);
    expect(r.messagesByHour[23]).toBe(1);
    expect(r.messagesByHour[10]).toBe(2);

    const withDemo = buildPilotReport({ business: barber, conversations, appointments, from, to, channels: ["whatsapp", "demo"] });
    expect(withDemo.customers).toBe(3);
    expect(withDemo.appointments.byAssistant).toBe(3);
  });
});
