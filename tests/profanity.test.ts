import { describe, expect, it } from "vitest";
import { executeTool } from "@/lib/agent/tools";
import { barber } from "@/lib/businesses/barber";
import { containsProfanity } from "@/lib/profanity";
import { InMemoryStore } from "@/lib/store";

describe("containsProfanity", () => {
  it("küfürlü adları yakalar", () => {
    for (const s of ["onursiken amsızoğlu", "Orospu Çocuğu", "amk", "AQ", "Sikerim Seni", "piç kurusu", "götveren"]) {
      expect(containsProfanity(s), s).toBe(true);
    }
  });
  it("normal adları geçirir", () => {
    for (const s of ["Murat", "Ayşe Yılmaz", "Mustafa Sıkı", "Gökhan Amsterdam", "Mehmet Ali", "Yeşim", "Şebnem", "Ercan Bokhara"]) {
      expect(containsProfanity(s), s).toBe(false);
    }
  });
});

describe("uygunsuz adla randevu", () => {
  it("book_appointment reddeder, save_lead adı kaydetmez", async () => {
    const store = new InMemoryStore();
    const conversation = await store.findOrCreateConversation({ businessId: barber.id, channel: "demo", contact: "s" });
    const ctx = { business: barber, conversation, store, now: new Date("2026-10-25T09:00:00+03:00") };
    const r = await executeTool(
      "book_appointment",
      { customer_name: "onursiken amsızoğlu", service_id: "sac", staff_id: "any", start: "2026-10-26T18:00:00+03:00" },
      ctx,
    );
    expect(r.isError).toBe(true);
    expect(r.content).toContain("uygunsuz");
    expect(await store.listAppointments(barber.id)).toHaveLength(0);

    await executeTool("save_lead", { name: "amk", language: "tr", country: "", interest: "saç", timeframe: "", notes: "" }, ctx);
    expect(conversation.lead?.name).toBeUndefined();
    expect(conversation.lead?.interest).toBe("saç");
  });
});
