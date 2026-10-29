import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import { executeTool } from "@/lib/agent/tools";
import { priceFor } from "@/lib/business";
import { validateBusiness } from "@/lib/business-schema";
import { barber } from "@/lib/businesses/barber";
import { dentalClinic } from "@/lib/businesses/dental-clinic";
import { toCard } from "@/lib/calendar";
import { InMemoryStore } from "@/lib/store";

const now = new Date("2026-10-25T09:00:00+03:00");

describe("çalışana özel fiyat", () => {
  it("çalışanın fiyatı varsa onu, yoksa veya boşsa hizmetin genel fiyatını verir", () => {
    expect(priceFor(barber, "sac", "mehmet")).toBe("500 TL");
    expect(priceFor(barber, "sac", "can")).toBe("400 TL");
    expect(priceFor(barber, "cocuk", "mehmet")).toBe("300 TL");
    expect(priceFor(barber, "sac")).toBe("400 TL");
    const blank = structuredClone(barber);
    blank.staff[0].prices = { sac: "  " };
    expect(priceFor(blank, "sac", "mehmet")).toBe("400 TL");
  });

  it("yapmadığı hizmete fiyat girilmişse ayarı reddeder", () => {
    const b = structuredClone(barber);
    b.staff[1].serviceIds = ["sac"];
    b.staff[1].prices = { sakal: "250 TL" };
    const result = validateBusiness(b);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join()).toContain("Can");
  });

  it("istem çalışan fiyatlarını ve saatten önce kişiyi sorma kuralını içerir", () => {
    const prompt = buildSystemPrompt(barber);
    expect(prompt).toContain("Mehmet Usta: Saç kesimi, Sakal tıraşı, Saç + sakal, Çocuk tıraşı. Kendi fiyatları: Saç kesimi 500 TL");
    expect(prompt).toContain("saat vermeden önce hangi usta tercihi olduğunu sor");
    expect(prompt).toContain("kiminle olmak istersiniz\" türünden yanlış anlaşılabilecek ifadeler kullanma");
    expect(prompt).toContain('"Fark etmez"');
  });

  it("randevu verilen ustanın fiyatı araç sonucunda ve randevu kartında görünür", async () => {
    const store = new InMemoryStore();
    const conversation = await store.findOrCreateConversation({ businessId: barber.id, channel: "demo", contact: "x" });
    const ctx = { business: barber, conversation, store, now };
    const booked = await executeTool(
      "book_appointment",
      { customer_name: "Ali", service_id: "sac-sakal", staff_id: "mehmet", start: "2026-10-26T18:00:00+03:00" },
      ctx,
    );
    expect(JSON.parse(booked.content)).toMatchObject({ staff: "Mehmet Usta", price: "700 TL" });

    const [appointment] = await store.listAppointments(barber.id);
    expect(toCard(barber, appointment).priceInfo).toBe("700 TL");
    expect(toCard(barber, { ...appointment, staffId: "can" }).priceInfo).toBe("550 TL");
  });

  it("çalışansız işletmede kişi sorma kuralı yok", () => {
    expect(dentalClinic.staff).toEqual([]);
    expect(buildSystemPrompt(dentalClinic)).not.toContain("tercihi olduğunu sor");
  });
});
