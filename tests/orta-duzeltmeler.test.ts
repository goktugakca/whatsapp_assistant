import { afterEach, describe, expect, it, vi } from "vitest";
import { executeTool } from "@/lib/agent/tools";
import { loadBusiness } from "@/lib/business";
import { validateBusiness } from "@/lib/business-schema";
import { barber } from "@/lib/businesses/barber";
import { downloadInstagramImage } from "@/lib/instagram";
import { sendTomorrowReminders } from "@/lib/reminders";
import { InMemoryStore } from "@/lib/store";
import { parseInboundMessages } from "@/lib/whatsapp";
import { redact } from "@/lib/whatsapp-export";

const now = new Date("2026-10-25T09:00:00+03:00");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("reschedule_appointment", () => {
  it("aynı ustada bitişik saate taşır, başka ustaya geçirir, dolu saati reddeder", async () => {
    const store = new InMemoryStore();
    const conversation = await store.findOrCreateConversation({ businessId: barber.id, channel: "whatsapp", contact: "905551112233" });
    const ctx = { business: barber, conversation, store, now };
    const booked = JSON.parse(
      (await executeTool("book_appointment", { customer_name: "Murat", service_id: "sac", staff_id: "mehmet", start: "2026-10-26T14:00:00+03:00" }, ctx)).content,
    );
    // 14:00 → 14:30 aynı usta: eski randevu kendisiyle çakışma sayılmaz.
    const moved = JSON.parse(
      (await executeTool("reschedule_appointment", { appointment_id: booked.appointmentId, start: "2026-10-26T14:30:00+03:00", staff_id: "mehmet" }, ctx)).content,
    );
    expect(moved).toMatchObject({ ok: true, appointmentId: booked.appointmentId, staff: "Mehmet Usta" });
    expect((await store.listAppointments(barber.id)).map((a) => Date.parse(a.start))).toEqual([Date.parse("2026-10-26T14:30:00+03:00")]);
    // Aynı saatte Can'a geçir.
    const toCan = JSON.parse(
      (await executeTool("reschedule_appointment", { appointment_id: booked.appointmentId, start: "2026-10-26T14:30:00+03:00", staff_id: "can" }, ctx)).content,
    );
    expect(toCan.staff).toBe("Can");
    // Başkasının randevusuna taşınamaz.
    const other = await store.findOrCreateConversation({ businessId: barber.id, channel: "whatsapp", contact: "905559998877" });
    await executeTool("book_appointment", { customer_name: "Ali", service_id: "sac", staff_id: "mehmet", start: "2026-10-26T16:00:00+03:00" }, { ...ctx, conversation: other });
    const clash = await executeTool("reschedule_appointment", { appointment_id: booked.appointmentId, start: "2026-10-26T16:00:00+03:00", staff_id: "mehmet" }, ctx);
    expect(clash.isError).toBe(true);
    expect(await store.listAppointments(barber.id)).toHaveLength(2);
  });
});

describe("hatırlatma kanalı", () => {
  it("Instagram randevusuna hatırlatma göndermez, nedenini yazar", async () => {
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "pn-1");
    vi.stubEnv("WHATSAPP_BUSINESS_ID", barber.id);
    vi.stubEnv("WHATSAPP_REMINDER_TEMPLATE", "randevu_hatirlatma");
    const store = new InMemoryStore();
    await store.addAppointmentIfFree({
      businessId: barber.id,
      source: "assistant",
      channel: "instagram",
      customerName: "Murat",
      contact: "178414015386",
      serviceId: "sac",
      staffId: "mehmet",
      start: "2026-10-26T14:00:00+03:00",
      end: "2026-10-26T14:30:00+03:00",
    });
    const send = vi.fn(async () => {});
    const report = await sendTomorrowReminders({ store, now, send });
    expect(send).not.toHaveBeenCalled();
    expect(report.skipped[0].reason).toContain("instagram");
  });
});

describe("küçük düzeltmeler", () => {
  it("Türkçe harfle başlayan müşteri adları da gizlenir", () => {
    expect(redact("Şule Hanım için 5.000 TL", ["Şule Öztürk"])).toBe("[müşteri] Hanım için 5.000 TL");
    expect(redact("Özge'ye söyledim", ["Özge"])).toContain("[müşteri]");
    expect(redact("Ayşegül geldi", ["Ayşe"])).toBe("Ayşegül geldi"); // kelime içi eşleşmez
  });

  it("WhatsApp tepki ve desteklenmeyen olayları mesaj saymaz", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "pn-1" }, messages: [
        { id: "r1", from: "9055", timestamp: "1", type: "reaction", reaction: { emoji: "👍" } },
        { id: "u1", from: "9055", timestamp: "1", type: "unsupported" },
        { id: "t1", from: "9055", timestamp: "1", type: "text", text: { body: "selam" } },
      ] } }] }],
    };
    expect(parseInboundMessages(payload).map((m) => m.id)).toEqual(["t1"]);
  });

  it("açılış saati randevu aralığına uymazsa ayar reddedilir", () => {
    const r = validateBusiness({ ...barber, workingHours: [{ day: 1, open: "09:05", close: "18:00" }] });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors[0]).toContain("09:05");
  });

  it("eski şemadan kalan eksik ayar varsayılanla tamamlanır, geçersizse varsayılana dönülür", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const store = new InMemoryStore();
    const { faq: _faq, ...withoutFaq } = barber;
    await store.saveBusinessSettings({ ...withoutFaq, name: "Yeni Ad" } as typeof barber);
    expect((await loadBusiness(store, barber.id))?.name).toBe("Yeni Ad");
    await store.saveBusinessSettings({ ...barber, workingHours: [] });
    expect((await loadBusiness(store, barber.id))?.name).toBe(barber.name);
  });

  it("Instagram görseli yalnızca Meta alan adlarından ve https ile indirilir; yönlendirme denetlenir", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("lookaside.fbsbx.com/a")) return new Response(null, { status: 302, headers: { location: "https://scontent.cdninstagram.com/b.jpg" } });
      return new Response(Buffer.from([1]), { headers: { "content-type": "image/jpeg" } });
    }) as typeof fetch;
    const ok = await downloadInstagramImage("https://lookaside.fbsbx.com/a", 1000, fetchImpl);
    expect(ok.data).toEqual(Buffer.from([1]));
    expect(calls).toHaveLength(2);
    await expect(downloadInstagramImage("http://lookaside.fbsbx.com/a", 1000, fetchImpl)).rejects.toThrow("Beklenmeyen");
    const evil = (async () => new Response(null, { status: 302, headers: { location: "https://evil.example/x" } })) as typeof fetch;
    await expect(downloadInstagramImage("https://lookaside.fbsbx.com/a", 1000, evil)).rejects.toThrow("Beklenmeyen");
  });
});

describe("devretme bildirimi", () => {
  it("asistan konuşmayı bırakınca işletmenin bildirim numarasına WhatsApp gider", async () => {
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "pn-1");
    vi.stubEnv("WHATSAPP_BUSINESS_ID", barber.id);
    const { handleInboundMessage } = await import("@/lib/inbound");
    const store = new InMemoryStore();
    await store.saveBusinessSettings({ ...barber, notifyPhone: "0532 111 22 33" });
    const send = vi.fn(async () => {});
    const sendText = vi.fn(async () => {});
    const createMessage = vi.fn(async () =>
      ({ id: "m", type: "message", role: "assistant", model: "t", stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "handoff_to_human", input: { reason: "Fiyat pazarlığı" } }] }) as never,
    ).mockImplementationOnce(async () =>
      ({ id: "m", type: "message", role: "assistant", model: "t", stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "handoff_to_human", input: { reason: "Fiyat pazarlığı" } }] }) as never,
    ).mockImplementationOnce(async () =>
      ({ id: "m2", type: "message", role: "assistant", model: "t", stop_reason: "end_turn", content: [{ type: "text", text: "Size dönüş yapacağız.", citations: null }] }) as never,
    );
    const inbound = { id: "w-h", phoneNumberId: "pn-1", from: "905551112233", contactName: "Murat", text: "indirim?", timestamp: 0 };
    expect(await handleInboundMessage(inbound, { store, send, createMessage, notify: { sendText } })).toBe("replied");
    expect(sendText).toHaveBeenCalledWith(expect.objectContaining({ to: "905321112233", text: expect.stringContaining("Murat sizi bekliyor") }));
  });
});
