import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { executeTool } from "@/lib/agent/tools";
import { barber } from "@/lib/businesses/barber";
import { InMemoryStore, type Store } from "@/lib/store";
import { PostgresStore } from "@/lib/store-postgres";
import { createTestDatabase } from "./pglite-db";

// Aynı davranış testleri iki uygulamada da koşar; ikisi birbirinin yerine geçebilmeli.
const pglite = await createTestDatabase();
afterAll(() => pglite.close());

const implementations: [string, () => Promise<Store>][] = [
  ["InMemoryStore", async () => new InMemoryStore()],
  [
    "PostgresStore",
    async () => {
      await pglite.query("truncate conversations, appointments, processed_messages, waitlist cascade");
      return new PostgresStore(pglite);
    },
  ],
];

describe.each(implementations)("%s", (_name, create) => {
  let store: Store;
  beforeEach(async () => {
    store = await create();
  });

  const key = { businessId: "demo-berber", channel: "whatsapp" as const, contact: "905551112233" };

  async function conversation() {
    return store.findOrCreateConversation({ ...key, contactName: "Ali" });
  }

  function appointment(conversationId: string, over: Partial<{ staffId: string; start: string; end: string }> = {}) {
    return {
      businessId: key.businessId,
      conversationId,
      customerName: "Ali",
      contact: key.contact,
      serviceId: "sac",
      staffId: "mehmet",
      start: "2026-10-26T10:00:00+03:00",
      end: "2026-10-26T10:30:00+03:00",
      ...over,
    };
  }

  it("aynı kişi için aynı konuşmayı döndürür ve adı sonradan doldurur", async () => {
    const first = await store.findOrCreateConversation(key);
    const second = await store.findOrCreateConversation({ ...key, contactName: "Ali" });
    expect(second.id).toBe(first.id);
    expect(second.contactName).toBe("Ali");
    expect((await store.findOrCreateConversation({ ...key, contactName: "Başka" })).contactName).toBe("Ali");
  });

  it("konuşmadaki değişiklikler sadece kaydedilince kalıcı olur ve geri okunur", async () => {
    const c = await conversation();
    c.status = "handoff";
    expect((await store.getConversation(c.id))?.status).toBe("bot");

    c.handoffReason = "acil";
    c.lead = { name: "Ali", interest: "saç", updatedAt: new Date().toISOString() };
    c.history.push({ role: "user", content: "Merhaba" });
    c.transcript.push({ from: "customer", text: "Merhaba", at: new Date().toISOString() });
    await store.saveConversation(c);

    const loaded = await store.getConversation(c.id);
    expect(loaded).toMatchObject({ status: "handoff", handoffReason: "acil", lead: { name: "Ali", interest: "saç" } });
    expect(loaded?.history).toEqual([{ role: "user", content: "Merhaba" }]);
    expect(loaded?.transcript).toHaveLength(1);
    expect((await store.listConversations(key.businessId)).map((x) => x.id)).toEqual([c.id]);
    expect(await store.listConversations("baska-isletme")).toEqual([]);
  });

  it("aynı çalışana çakışan randevuyu reddeder, farklı çalışana veya bitişik saate izin verir", async () => {
    const c = await conversation();
    expect(await store.addAppointmentIfFree(appointment(c.id))).not.toBeNull();
    expect(
      await store.addAppointmentIfFree(
        appointment(c.id, { start: "2026-10-26T10:15:00+03:00", end: "2026-10-26T10:45:00+03:00" }),
      ),
    ).toBeNull();
    expect(await store.addAppointmentIfFree(appointment(c.id, { staffId: "can" }))).not.toBeNull();
    expect(
      await store.addAppointmentIfFree(
        appointment(c.id, { start: "2026-10-26T10:30:00+03:00", end: "2026-10-26T11:00:00+03:00" }),
      ),
    ).not.toBeNull();

    const list = await store.listAppointments(key.businessId);
    expect(list).toHaveLength(3);
    expect(Date.parse(list[0].start)).toBe(Date.parse("2026-10-26T10:00:00+03:00"));
  });

  it("çalışanı olmayan işletmede tek takvim gibi davranır", async () => {
    const c = await conversation();
    const single = { ...appointment(c.id), staffId: undefined };
    expect(await store.addAppointmentIfFree(single)).not.toBeNull();
    expect(await store.addAppointmentIfFree(single)).toBeNull();
  });

  it("aynı anda gelen iki randevu isteğinden sadece biri kazanır", async () => {
    const c = await conversation();
    const results = await Promise.all([
      store.addAppointmentIfFree(appointment(c.id, { staffId: "mehmet" })),
      store.addAppointmentIfFree(appointment(c.id, { staffId: "mehmet" })),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("asistanın randevu aracı bu depoyla uçtan uca çalışır ve dolan ustadan diğerine geçer", async () => {
    const c = await conversation();
    const ctx = { business: barber, conversation: c, store, now: new Date("2026-10-25T09:00:00+03:00") };
    const start = "2026-10-26T18:00:00+03:00";
    const book = (name: string) =>
      executeTool("book_appointment", { customer_name: name, service_id: "sac", staff_id: "any", start }, ctx);
    expect((await book("Ali")).isError).toBeFalsy();
    expect((await book("Veli")).isError).toBeFalsy();
    expect((await book("Ayşe")).isError).toBe(true);
    const staff = (await store.listAppointments(barber.id)).map((a) => a.staffId).sort();
    expect(staff).toEqual(["can", "mehmet"]);
  });

  it("aynı WhatsApp mesajını sadece ilk seferde yeni sayar", async () => {
    expect(await store.markMessageSeen("wamid.1")).toBe(true);
    expect(await store.markMessageSeen("wamid.1")).toBe(false);
    expect(await store.markMessageSeen("wamid.2")).toBe(true);
  });

  it("pilot başvurularını en yeniden eskiye listeler", async () => {
    await store.addWaitlistEntry({ businessName: "A", contactName: "X", phone: "1234567" });
    await new Promise((r) => setTimeout(r, 5));
    await store.addWaitlistEntry({ businessName: "B", businessType: "Berber", contactName: "Y", phone: "7654321" });
    const list = await store.listWaitlist();
    expect(list.map((w) => w.businessName)).toEqual(["B", "A"]);
    expect(list[0].businessType).toBe("Berber");
    expect(list[1].businessType).toBeUndefined();
  });

  it("aynı konuşmadaki işleri sırayla çalıştırır", async () => {
    const order: string[] = [];
    const slow = store.withConversationLock(key, async () => {
      order.push("a-start");
      await new Promise((r) => setTimeout(r, 20));
      order.push("a-end");
    });
    const fast = store.withConversationLock(key, async () => {
      order.push("b");
    });
    await Promise.all([slow, fast]);
    expect(order).toEqual(["a-start", "a-end", "b"]);
  });
});
