import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { barber } from "@/lib/businesses/barber";
import { sendTomorrowReminders } from "@/lib/reminders";
import { InMemoryStore, type NewAppointment } from "@/lib/store";

// 26 Ekim Pazartesi 18:00 İstanbul; "yarın" = 27 Ekim.
const now = new Date("2026-10-26T15:00:00Z");

function appt(over: Partial<NewAppointment>): NewAppointment {
  return {
    businessId: barber.id,
    source: "panel",
    customerName: "Ali",
    contact: "905551112233",
    serviceId: "sac",
    staffId: "mehmet",
    start: "2026-10-27T10:00:00+03:00",
    end: "2026-10-27T10:30:00+03:00",
    ...over,
  };
}

beforeEach(() => {
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "pn-1");
  vi.stubEnv("WHATSAPP_BUSINESS_ID", barber.id);
  vi.stubEnv("WHATSAPP_REMINDER_TEMPLATE", "randevu_hatirlatma");
});
afterEach(() => vi.unstubAllEnvs());

describe("yarınki randevu hatırlatmaları", () => {
  it("sadece yarınki, numarası olan randevulara şablonla gönderir ve ikinci kez göndermez", async () => {
    const store = new InMemoryStore();
    await store.addAppointmentIfFree(appt({}));
    await store.addAppointmentIfFree(appt({ contact: "demo-oturum-1234", staffId: "can" })); // demo
    await store.addAppointmentIfFree(appt({ start: "2026-10-28T10:00:00+03:00", end: "2026-10-28T10:30:00+03:00" })); // öbür gün
    await store.addAppointmentIfFree(appt({ start: "2026-10-26T19:00:00+03:00", end: "2026-10-26T19:30:00+03:00" })); // bugün
    const send = vi.fn(async () => {});

    const report = await sendTomorrowReminders({ store, now, send });

    expect(report.sent).toBe(1);
    expect(report.skipped.map((s) => s.reason)).toEqual(["telefon numarası yok (demo veya numarasız randevu)"]);
    expect(send).toHaveBeenCalledWith({
      phoneNumberId: "pn-1",
      to: "905551112233",
      name: "randevu_hatirlatma",
      language: "tr",
      bodyParams: ["Ali", "Saç kesimi", "27 Ekim Salı 10:00", "Ustura Berber"],
    });

    expect((await sendTomorrowReminders({ store, now, send })).sent).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("gönderim hatasında hatırlatmayı geri bırakır, sonraki çalıştırmada tekrar dener", async () => {
    const store = new InMemoryStore();
    await store.addAppointmentIfFree(appt({}));
    const failing = vi.fn(async () => {
      throw new Error("WhatsApp gönderimi başarısız (400)");
    });
    const report = await sendTomorrowReminders({ store, now, send: failing });
    expect(report.failed).toHaveLength(1);

    const ok = vi.fn(async () => {});
    expect((await sendTomorrowReminders({ store, now, send: ok })).sent).toBe(1);
  });

  it("iptal edilen randevuya göndermez; şablon yoksa göndermeden nedenini bildirir", async () => {
    const store = new InMemoryStore();
    const a = await store.addAppointmentIfFree(appt({}));
    await store.cancelAppointment(barber.id, a!.id);
    const send = vi.fn(async () => {});
    expect((await sendTomorrowReminders({ store, now, send })).sent).toBe(0);

    await store.addAppointmentIfFree(appt({ staffId: "can" }));
    vi.stubEnv("WHATSAPP_REMINDER_TEMPLATE", "");
    const report = await sendTomorrowReminders({ store, now, send });
    expect(report.skipped[0].reason).toContain("WHATSAPP_REMINDER_TEMPLATE");
    expect(send).not.toHaveBeenCalled();
  });

  it("hatırlatmayı müşterinin WhatsApp konuşmasına yazar ki yanıt verince asistan bağlamı bilsin", async () => {
    const store = new InMemoryStore();
    await store.addAppointmentIfFree(appt({}));
    await sendTomorrowReminders({ store, now, send: vi.fn(async () => {}) });
    const [listed] = await store.listConversations(barber.id);
    const conversation = (await store.getConversation(listed.id))!;
    expect(conversation.contact).toBe("905551112233");
    expect(conversation.transcript[0].text).toContain("Hatırlatma gönderildi");
    expect(JSON.stringify(conversation.history)).toContain("[Otomatik hatırlatma]");
  });
});
