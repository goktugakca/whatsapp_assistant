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
      await pglite.query("truncate conversations, appointments, processed_messages, waitlist, business_settings, panel_users, media, price_examples, instagram_accounts, photo_quote_evals cascade");
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
      source: "assistant" as const,
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

  it("iptal edilen randevu saati boşaltır ve listeden çıkar", async () => {
    const c = await conversation();
    const first = await store.addAppointmentIfFree(appointment(c.id));
    expect(first).not.toBeNull();
    expect(await store.addAppointmentIfFree(appointment(c.id))).toBeNull();

    expect(await store.cancelAppointment("baska-isletme", first!.id)).toBe(false);
    expect(await store.cancelAppointment(key.businessId, first!.id)).toBe(true);
    expect(await store.cancelAppointment(key.businessId, first!.id)).toBe(false);
    expect(await store.listAppointments(key.businessId)).toEqual([]);
    expect((await store.getAppointment(first!.id))?.cancelledAt).toBeDefined();

    expect(await store.addAppointmentIfFree(appointment(c.id))).not.toBeNull();
  });

  it("panelden sohbetsiz randevu eklenebilir ve kimliğiyle okunur", async () => {
    const manual = await store.addAppointmentIfFree({
      ...appointment("ignored"),
      conversationId: undefined,
      source: "panel",
      customerName: "Telefonla arayan",
    });
    expect(manual).toMatchObject({ source: "panel", customerName: "Telefonla arayan" });
    expect(manual?.conversationId).toBeUndefined();
    expect(await store.getAppointment(manual!.id)).toMatchObject({ id: manual!.id, source: "panel" });
    expect(await store.getAppointment("olmayan")).toBeUndefined();
  });

    it("hatırlatmayı sadece bir kez ayırır; iptal edileni ve aralık dışını listelemez", async () => {
    const c = await conversation();
    const a = await store.addAppointmentIfFree(appointment(c.id));
    const b = await store.addAppointmentIfFree(appointment(c.id, { staffId: "can" }));
    await store.cancelAppointment(key.businessId, b!.id);

    const from = "2026-10-26T00:00:00Z";
    const to = "2026-10-27T00:00:00Z";
    expect((await store.listAppointmentsForReminder(from, to)).map((x) => x.id)).toEqual([a!.id]);
    expect(await store.listAppointmentsForReminder("2026-10-27T00:00:00Z", "2026-10-28T00:00:00Z")).toEqual([]);

    const claims = await Promise.all([store.claimReminder(a!.id), store.claimReminder(a!.id)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await store.listAppointmentsForReminder(from, to)).toEqual([]);
    expect((await store.getAppointment(a!.id))?.reminderSentAt).toBeDefined();

    await store.releaseReminder(a!.id);
    expect(await store.claimReminder(a!.id)).toBe(true);
    expect(await store.claimReminder(b!.id)).toBe(false); // iptal edilmiş
  });

    it("panel kullanıcılarını oluşturur, kullanıcı adını tekil tutar, bulur ve siler", async () => {
    const created = await store.createPanelUser({ username: "ali", passwordHash: "h", businessId: "demo-berber" });
    expect(created).toMatchObject({ username: "ali", businessId: "demo-berber" });
    expect(await store.createPanelUser({ username: "ali", passwordHash: "h2", businessId: "demo-kuafor" })).toBeNull();
    expect((await store.findPanelUserByUsername("ali"))?.passwordHash).toBe("h");
    expect((await store.getPanelUser(created!.id))?.username).toBe("ali");
    expect((await store.listPanelUsers()).map((u) => u.username)).toEqual(["ali"]);
    await store.deletePanelUser(created!.id);
    expect(await store.findPanelUserByUsername("ali")).toBeUndefined();
    expect(await store.getPanelUser("olmayan")).toBeUndefined();
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

  it("işletme ayarlarını kaydeder, günceller ve aynen geri okur", async () => {
    expect(await store.getBusinessSettings(barber.id)).toBeUndefined();
    const updated = structuredClone(barber);
    updated.name = "Usta Berber";
    updated.staff[1].workingHours = [{ day: 2, open: "12:00", close: "20:00" }];
    await store.saveBusinessSettings(updated);
    expect(await store.getBusinessSettings(barber.id)).toEqual(updated);

    updated.services.push({ id: "yikama", name: "Yıkama", description: "", durationMinutes: 10, priceInfo: "100 TL" });
    await store.saveBusinessSettings(updated);
    expect((await store.getBusinessSettings(barber.id))?.services.at(-1)?.name).toBe("Yıkama");
  });

    it("fotoğrafı kaydeder ve baytlarıyla aynen geri okur", async () => {
    const c = await conversation();
    const data = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02]);
    const saved = await store.saveMedia({ businessId: key.businessId, conversationId: c.id, mimeType: "image/jpeg", data });
    const loaded = await store.getMedia(saved.id);
    expect(loaded).toMatchObject({ businessId: key.businessId, conversationId: c.id, mimeType: "image/jpeg" });
    expect(Buffer.compare(loaded!.data, data)).toBe(0);
    expect(await store.getMedia("olmayan")).toBeUndefined();
  });

  it("fiyat örneklerini ekler, aynı fotoğrafı ikinci kez eklemez, günceller ve siler", async () => {
    const media = await store.saveMedia({ businessId: key.businessId, mimeType: "image/jpeg", data: Buffer.from([1, 2]) });
    expect(media.conversationId).toBeUndefined();
    const input = {
      businessId: key.businessId,
      mediaIds: [media.id],
      imageHash: "h1",
      customerText: "balyaj ne kadar",
      staffReply: "5.000 TL olur",
      priceText: "5.000 TL olur",
      priceMin: 5000,
      priceMax: 5000,
      saidAt: "2026-09-20T18:00:00.000Z",
    };
    const ex = await store.addPriceExample(input);
    expect(ex).toMatchObject({ mediaIds: [media.id], priceMin: 5000, included: true });
    expect(await store.addPriceExample(input)).toBeNull();
    expect(await store.hasPriceExample(key.businessId, "h1")).toBe(true);
    expect(await store.hasPriceExample("baska", "h1")).toBe(false);

    await store.addPriceExample({ ...input, imageHash: "h2", priceText: undefined, priceMin: undefined, priceMax: undefined, saidAt: "2026-09-21T18:00:00.000Z" });
    const list = await store.listPriceExamples(key.businessId);
    expect(list.map((e) => e.imageHash)).toEqual(["h2", "h1"]);
    expect(list[0].priceMin).toBeUndefined();

    expect(await store.updatePriceExample(key.businessId, list[0].id, { priceText: "4.000 TL", priceMin: 4000, priceMax: 4000 })).toBe(true);
    expect(await store.updatePriceExample(key.businessId, ex!.id, { included: false })).toBe(true);
    expect(await store.updatePriceExample("baska", ex!.id, { included: true })).toBe(false);
    const after = await store.listPriceExamples(key.businessId);
    expect(after[0]).toMatchObject({ priceText: "4.000 TL", priceMin: 4000, included: true });
    expect(after[1]).toMatchObject({ included: false, priceMin: 5000 });

    await store.deletePriceExample(key.businessId, ex!.id);
    expect(await store.listPriceExamples(key.businessId)).toHaveLength(1);
    expect(await store.getMedia(media.id)).toBeUndefined();
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

describe.each(implementations)("%s Instagram hesapları", (_name, create) => {
  it("hesabı kaydeder, hesap kimliğiyle bulur, başka işletmeye taşınınca eskisinden kaldırır", async () => {
    const store = await create();
    const base = { accountId: "178", username: "salon", sealedToken: "x.y.z", tokenExpiresAt: new Date().toISOString(), connectedAt: new Date().toISOString() };
    await store.saveInstagramAccount({ businessId: "demo-kuafor", ...base });
    expect((await store.findInstagramAccount("178"))?.businessId).toBe("demo-kuafor");
    await store.saveInstagramAccount({ businessId: "demo-berber", ...base });
    expect(await store.getInstagramAccount("demo-kuafor")).toBeUndefined();
    expect((await store.listInstagramAccounts()).map((a) => a.businessId)).toEqual(["demo-berber"]);
    await store.deleteInstagramAccount("demo-berber");
    expect(await store.findInstagramAccount("178")).toBeUndefined();
  });
});
