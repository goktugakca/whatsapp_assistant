import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import { FALLBACK_REPLY, runAssistant, type CreateMessage } from "@/lib/agent/run";
import { buildTools, executeTool } from "@/lib/agent/tools";
import { businesses, type Business } from "@/lib/business";
import { barber } from "@/lib/businesses/barber";
import { dentalClinic } from "@/lib/businesses/dental-clinic";
import { handleInboundMessage } from "@/lib/inbound";
import { InMemoryStore } from "@/lib/store";

type BetaMessage = Anthropic.Beta.Messages.BetaMessage;

const now = new Date("2026-10-25T09:00:00+03:00");

function message(content: BetaMessage["content"], stop_reason: BetaMessage["stop_reason"]): BetaMessage {
  return { id: "msg", type: "message", role: "assistant", model: "test", content, stop_reason } as BetaMessage;
}

function scripted(responses: BetaMessage[]) {
  const calls: Parameters<CreateMessage>[0][] = [];
  const createMessage: CreateMessage = async (params) => {
    calls.push(structuredClone(params));
    const next = responses.shift();
    if (!next) throw new Error("Beklenmeyen model çağrısı");
    return next;
  };
  return { createMessage, calls };
}

async function setup(business: Business) {
  const store = new InMemoryStore();
  const conversation = await store.findOrCreateConversation({
    businessId: business.id,
    channel: "demo",
    contact: "test-session",
  });
  return { store, conversation, ctx: { business, conversation, store, now } };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("istem ve araç tanımları", () => {
  it.each(businesses.map((b) => [b.id, b] as const))("%s için üretilebiliyor", (_id, business) => {
    const prompt = buildSystemPrompt(business);
    expect(prompt).toContain(business.name);
    for (const s of business.services) expect(prompt).toContain(s.name);
    for (const p of business.staff) expect(prompt).toContain(p.name);
    for (const tool of buildTools(business)) expect(tool.strict).toBe(true);
  });

  it("sektöre özel kuralları ekler", () => {
    expect(buildSystemPrompt(dentalClinic)).toContain("Tıbbi teşhis koyma");
    expect(buildSystemPrompt(barber)).not.toContain("Tıbbi teşhis koyma");
  });
});

describe("araçlar", () => {
  it("tek takvimli işletmede aynı saate ikinci randevuyu ve uydurma saati reddeder", async () => {
    const { store, ctx } = await setup(dentalClinic);
    const start = "2026-10-26T10:00:00+03:00";
    const book = (customer_name: string, at: string) =>
      executeTool("book_appointment", { customer_name, service_id: "muayene", staff_id: "any", start: at }, ctx);

    expect((await book("Ali", start)).isError).toBeFalsy();
    expect(await store.listAppointments(dentalClinic.id)).toHaveLength(1);
    expect((await book("Veli", start)).isError).toBe(true);
    expect((await book("Veli", "2026-10-26T10:07:00+03:00")).isError).toBe(true);
  });

  it("berberde aynı saate iki farklı ustaya randevu verir, üçüncüyü reddeder", async () => {
    const { store, ctx } = await setup(barber);
    const start = "2026-10-26T18:00:00+03:00";
    const book = (customer_name: string, staff_id: string) =>
      executeTool("book_appointment", { customer_name, service_id: "sac", staff_id, start }, ctx);

    expect((await book("Ali", "mehmet")).isError).toBeFalsy();
    expect((await book("Veli", "mehmet")).isError).toBe(true); // Mehmet Usta dolu
    expect((await book("Veli", "any")).isError).toBeFalsy(); // Can'a düşer
    expect((await book("Ayşe", "any")).isError).toBe(true); // İkisi de dolu

    const staff = (await store.listAppointments(barber.id)).map((a) => a.staffId).sort();
    expect(staff).toEqual(["can", "mehmet"]);
  });

  it("boş saatleri çalışan adlarıyla döndürür", async () => {
    const { ctx } = await setup(barber);
    const result = await executeTool(
      "check_availability",
      { date: "2026-10-26", service_id: "sac", staff_id: "any" },
      ctx,
    );
    expect(JSON.parse(result.content).slots[0].staff).toEqual([
      { id: "mehmet", name: "Mehmet Usta" },
      { id: "can", name: "Can" },
    ]);
  });

  it("lead bilgisini boş alanları ezmeden birleştirir", async () => {
    const { conversation, ctx } = await setup(barber);
    const empty = { name: "", language: "", country: "", interest: "", timeframe: "", notes: "" };
    await executeTool("save_lead", { ...empty, name: "John", language: "English" }, ctx);
    await executeTool("save_lead", { ...empty, interest: "saç + sakal" }, ctx);
    expect(conversation.lead).toMatchObject({ name: "John", language: "English", interest: "saç + sakal" });
  });
});

describe("runAssistant", () => {
  it("araç çağrısını çalıştırır, sonucu modele geri verir ve son metni döndürür", async () => {
    const { store, conversation } = await setup(barber);
    const { createMessage, calls } = scripted([
      message(
        [
          {
            type: "tool_use",
            id: "t1",
            name: "check_availability",
            input: { date: "2026-10-26", service_id: "sac", staff_id: "mehmet" },
          },
        ],
        "tool_use",
      ),
      message([{ type: "text", text: "Mehmet Usta 09:00'da boş.", citations: null }], "end_turn"),
    ]);

    const result = await runAssistant({ business: barber, conversation, store, text: "Pazartesi?", now, createMessage });

    expect(result.reply).toBe("Mehmet Usta 09:00'da boş.");
    expect(calls).toHaveLength(2);
    expect(calls[0].model).toBe("claude-haiku-5-5");
    expect(calls[0].fallbacks).toBeUndefined(); // Haiku'da server-side fallback yok
    const toolResultTurn = calls[1].messages.at(-1)!;
    const block = (toolResultTurn.content as Anthropic.Beta.Messages.BetaToolResultBlockParam[])[0];
    expect(block.tool_use_id).toBe("t1");
    expect(String(block.content)).toContain("2026-10-26T09:00:00+03:00");
    expect(conversation.history.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
  });

  it("modeli çağıramazsa konuşmayı devreder ve güvenli yanıt verir", async () => {
    const { store, conversation } = await setup(barber);
    const createMessage: CreateMessage = async () => {
      throw new Error("ağ hatası");
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await runAssistant({ business: barber, conversation, store, text: "Merhaba", now, createMessage });
    expect(result.reply).toBe(FALLBACK_REPLY);
    expect(conversation.status).toBe("handoff");
  });

  it("ret yanıtında geçmişe asistan turu eklemeden devreder", async () => {
    const { store, conversation } = await setup(barber);
    const { createMessage } = scripted([message([], "refusal")]);
    const result = await runAssistant({ business: barber, conversation, store, text: "...", now, createMessage });
    expect(result.handedOff).toBe(true);
    expect(conversation.history.map((m) => m.role)).toEqual(["user"]);
  });
});

describe("handleInboundMessage", () => {
  it("numarayı doğru işletmeye bağlar, tekrarı yok sayar, devredilmiş konuşmada sessiz kalır", async () => {
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "pn-1");
    vi.stubEnv("WHATSAPP_BUSINESS_ID", barber.id);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = new InMemoryStore();
    const send = vi.fn(async () => {});
    const { createMessage } = scripted([message([{ type: "text", text: "Merhaba!", citations: null }], "end_turn")]);
    const inbound = { id: "wamid.1", phoneNumberId: "pn-1", from: "905551112233", text: "Selam", timestamp: 0 };

    expect(await handleInboundMessage(inbound, { store, send, createMessage })).toBe("replied");
    expect(send).toHaveBeenCalledWith({ phoneNumberId: "pn-1", to: "905551112233", text: "Merhaba!", options: [] });
    const [conversation] = await store.listConversations(barber.id);
    expect(conversation).toBeDefined();

    expect(await handleInboundMessage(inbound, { store, send, createMessage })).toBe("duplicate");

    conversation.status = "handoff";
    await store.saveConversation(conversation);
    expect(await handleInboundMessage({ ...inbound, id: "wamid.2" }, { store, send, createMessage })).toBe("handoff");
    expect(send).toHaveBeenCalledTimes(1);

    expect(
      await handleInboundMessage({ ...inbound, id: "wamid.3", phoneNumberId: "baska" }, { store, send, createMessage }),
    ).toBe("unknown-business");
  });
});

describe("seçenekler ve randevu kartı", () => {
  it("show_options düğmeleri ve oluşan randevunun kartı tur sonucunda döner", async () => {
    const { store, conversation } = await setup(barber);
    const start = "2026-10-26T18:00:00+03:00";
    const { createMessage } = scripted([
      message(
        [
          {
            type: "tool_use",
            id: "t1",
            name: "show_options",
            input: { options: ["Pazartesi 18:00", "Pazartesi 18:00", " ", "Çok uzun bir seçenek etiketi buraya sığmaz"] },
          },
          {
            type: "tool_use",
            id: "t2",
            name: "book_appointment",
            input: { customer_name: "Ali", service_id: "sac", staff_id: "mehmet", start },
          },
        ],
        "tool_use",
      ),
      message([{ type: "text", text: "Randevunuz oluşturuldu.", citations: null }], "end_turn"),
    ]);

    const result = await runAssistant({ business: barber, conversation, store, text: "18:00 olsun", now, createMessage });

    expect(result.options).toEqual(["Pazartesi 18:00", "Çok uzun bir seçenek et…"]);
    expect(result.options[1]).toHaveLength(24);
    expect(result.appointments).toHaveLength(1);
    expect(result.appointments[0]).toMatchObject({
      serviceName: "Saç kesimi",
      staffName: "Mehmet Usta",
      customerName: "Ali",
      businessName: barber.name,
    });
  });

  it("WhatsApp yanıtına takvim bağlantısını ve düğmeleri ekler", async () => {
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "pn-1");
    vi.stubEnv("WHATSAPP_BUSINESS_ID", barber.id);
    vi.stubEnv("APP_URL", "https://ornek.app/");
    const store = new InMemoryStore();
    const send = vi.fn(async () => {});
    const { createMessage } = scripted([
      message(
        [
          {
            type: "tool_use",
            id: "t1",
            name: "book_appointment",
            input: { customer_name: "Ali", service_id: "sac", staff_id: "any", start: "2026-10-26T18:00:00+03:00" },
          },
          { type: "tool_use", id: "t2", name: "show_options", input: { options: ["Evet", "Hayır"] } },
        ],
        "tool_use",
      ),
      message([{ type: "text", text: "Tamamdır!", citations: null }], "end_turn"),
    ]);
    const inbound = { id: "wamid.9", phoneNumberId: "pn-1", from: "905551112233", text: "Ali", timestamp: 0 };
    vi.useFakeTimers({ now, toFake: ["Date"] });
    try {
      await handleInboundMessage(inbound, { store, send, createMessage });
    } finally {
      vi.useRealTimers();
    }

    const [appointment] = await store.listAppointments(barber.id);
    expect(send).toHaveBeenCalledWith({
      phoneNumberId: "pn-1",
      to: "905551112233",
      text: `Tamamdır!\n\n📅 Randevu ve takvime ekle: https://ornek.app/randevu/${appointment.id}`,
      options: ["Evet", "Hayır"],
    });
  });
});
