import { describe, expect, it } from "vitest";
import { PROFANITY_BLOCKED, PROFANITY_WARNING, runAssistant } from "@/lib/agent/run";
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
    for (const s of [
      "Murat", "Ayşe Yılmaz", "Mustafa Sıkı", "Gökhan Amsterdam", "Mehmet Ali", "Yeşim", "Şebnem", "Ercan Bokhara", "Göktuğ",
      "eksik bilgi var", "klasik manikür istiyorum", "saçım kesik", "beni götürür müsünüz", "parayı sayarak", "boks yapıyorum",
      "Ayşe Döl", "sikke koleksiyonu", "yarın gelsem", "amacım kısa kesim",
    ]) {
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

describe("küfürlü mesaj", () => {
  it("model çağrılmadan ilkinde uyarır, ikincisinde engeller", async () => {
    const store = new InMemoryStore();
    const conversation = await store.findOrCreateConversation({ businessId: barber.id, channel: "demo", contact: "k" });
    const createMessage = async () => {
      throw new Error("model çağrılmamalı");
    };
    const first = await runAssistant({ business: barber, conversation, store, text: "merhaba amk", createMessage });
    expect(first.reply).toBe(PROFANITY_WARNING);
    expect(conversation.status).toBe("bot");
    const second = await runAssistant({ business: barber, conversation, store, text: "ne diyon aq", createMessage });
    expect(second.reply).toBe(PROFANITY_BLOCKED);
    expect(conversation.status).toBe("blocked");
    expect(conversation.transcript.map((m) => m.from)).toEqual(["customer", "assistant", "customer", "assistant"]);
  });
});

describe("engel kaldırılınca", () => {
  it("model geçmişi temiz başlar, müşteri bilgisi notla korunur", async () => {
    const { reopenHistory } = await import("@/lib/agent/run");
    const store = new InMemoryStore();
    const conversation = await store.findOrCreateConversation({ businessId: barber.id, channel: "demo", contact: "b" });
    conversation.history.push({ role: "user", content: "kes sikik" }, { role: "assistant", content: "Bu konuşmaya devam edemiyorum." });
    conversation.lead = { name: "Murat", interest: "saç + sakal", updatedAt: "" };
    conversation.status = "blocked";
    const history = reopenHistory(conversation);
    expect(JSON.stringify(history)).not.toContain("sikik");
    expect(JSON.stringify(history)).toContain("Murat");
    conversation.status = "handoff";
    expect(reopenHistory(conversation)).toHaveLength(4); // devirde geçmiş korunur, not eklenir
  });
});
