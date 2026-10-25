import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import { executeTool } from "@/lib/agent/tools";
import { businesses, loadBusiness } from "@/lib/business";
import { slugify, validateBusiness } from "@/lib/business-schema";
import { barber } from "@/lib/businesses/barber";
import { hairSalon } from "@/lib/businesses/hair-salon";
import { InMemoryStore } from "@/lib/store";

const clone = <T,>(x: T): T => structuredClone(x);

describe("validateBusiness", () => {
  it.each(businesses.map((b) => [b.id, b] as const))("örnek işletme %s geçerli", (_id, b) => {
    expect(validateBusiness(b)).toMatchObject({ ok: true });
  });

  it("kapanışı açılıştan önce olan günü reddeder", () => {
    const b = clone(barber);
    b.workingHours[0] = { day: 1, open: "18:00", close: "09:00" };
    expect(validateBusiness(b)).toEqual({ ok: false, errors: ["Kapanış saati açılıştan sonra olmalı"] });
  });

  it("çalışanı olmayan bir hizmete atanmışsa reddeder", () => {
    const b = clone(barber);
    b.staff[0].serviceIds.push("yok");
    const result = validateBusiness(b);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join()).toContain("Mehmet Usta");
  });

  it("boş hizmet adını, hizmetsiz işletmeyi ve geçersiz süreyi reddeder", () => {
    const noName = clone(barber);
    noName.services[0].name = "  ";
    expect(validateBusiness(noName).ok).toBe(false);

    const noServices = { ...clone(barber), services: [], staff: [] };
    expect(validateBusiness(noServices)).toEqual({ ok: false, errors: ["En az bir hizmet gerekli"] });

    const badDuration = clone(barber);
    badDuration.services[0].durationMinutes = 0;
    expect(validateBusiness(badDuration).ok).toBe(false);
  });

  it("boş harita bağlantısını kaldırır, metinleri kırpar", () => {
    const b = { ...clone(barber), mapsUrl: "", name: "  Yeni Berber  " };
    const result = validateBusiness(b);
    expect(result.ok && result.business.mapsUrl).toBeUndefined();
    expect(result.ok && result.business.name).toBe("Yeni Berber");
  });
});

describe("slugify", () => {
  it("Türkçe karakterleri dönüştürür ve çakışmada numara ekler", () => {
    expect(slugify("Saç + Sakal", new Set())).toBe("sac-sakal");
    expect(slugify("Saç + Sakal", new Set(["sac-sakal"]))).toBe("sac-sakal-2");
    expect(slugify("Ömer Güneş", new Set())).toBe("omer-gunes");
    expect(slugify("!!!", new Set())).toBe("oge");
  });
});

describe("kaydedilen ayarlar asistana ulaşır", () => {
  it("kayıt yoksa başlangıç değeri, kayıt varsa güncel hali kullanılır", async () => {
    const store = new InMemoryStore();
    expect((await loadBusiness(store, barber.id))?.name).toBe("Demo Berber");

    const updated = clone(barber);
    updated.name = "Usta Berber";
    updated.services[0].priceInfo = "450 TL";
    updated.staff.push({ id: "emre", name: "Emre", serviceIds: ["sac"] });
    await store.saveBusinessSettings(updated);

    const loaded = await loadBusiness(store, barber.id);
    const prompt = buildSystemPrompt(loaded!);
    expect(prompt).toContain("Usta Berber");
    expect(prompt).toContain("450 TL");
    expect(prompt).toContain("Emre");
    expect(await loadBusiness(store, "olmayan")).toBeUndefined();
  });

  it("çalışma saati değişince boş saatler de değişir", async () => {
    const store = new InMemoryStore();
    const b = clone(hairSalon);
    b.workingHours = [{ day: 1, open: "12:00", close: "14:00" }]; // Pazartesi açıldı, diğer günler kapandı
    b.staff = [];
    await store.saveBusinessSettings(b);
    const business = (await loadBusiness(store, b.id))!;
    const conversation = await store.findOrCreateConversation({ businessId: b.id, channel: "demo", contact: "x" });
    const ctx = { business, conversation, store, now: new Date("2026-10-25T09:00:00+03:00") };

    const monday = JSON.parse(
      (await executeTool("check_availability", { date: "2026-10-26", service_id: "fon", staff_id: "any" }, ctx)).content,
    );
    expect(monday.slots.map((s: { start: string }) => s.start)).toEqual([
      "2026-10-26T12:00:00+03:00",
      "2026-10-26T12:30:00+03:00",
      "2026-10-26T13:00:00+03:00",
      "2026-10-26T13:30:00+03:00",
    ]);
    const tuesday = await executeTool(
      "check_availability",
      { date: "2026-10-27", service_id: "fon", staff_id: "any" },
      ctx,
    );
    expect(tuesday.content).toContain("boş saat yok");
  });
});
