import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import { FALLBACK_REPLY, runAssistant, type CreateMessage } from "@/lib/agent/run";
import { buildTools, executeTool } from "@/lib/agent/tools";
import { businesses, loadBusiness, type Business } from "@/lib/business";
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
    channel: "whatsapp",
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

  it("boş saatleri çalışan adları ve her çalışanın fiyatıyla döndürür", async () => {
    const { ctx } = await setup(barber);
    const result = await executeTool(
      "check_availability",
      { date: "2026-10-26", service_id: "sac", staff_id: "any" },
      ctx,
    );
    expect(JSON.parse(result.content).slots[0].staff).toEqual([
      { id: "mehmet", name: "Mehmet Usta", price: "500 TL" },
      { id: "can", name: "Can", price: "400 TL" },
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

describe("hata durumunda mesaj kaybolmaz", () => {
  it("işleme başarısız olursa 'görüldü' işareti geri alınır ve yeniden denenebilir", async () => {
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "pn-1");
    vi.stubEnv("WHATSAPP_BUSINESS_ID", barber.id);
    const store = new InMemoryStore();
    const original = store.findOrCreateConversation.bind(store);
    let fail = true;
    store.findOrCreateConversation = async (input) => {
      if (fail) {
        fail = false;
        throw new Error("veritabanı yok");
      }
      return original(input);
    };
    const send = vi.fn(async () => {});
    const { createMessage } = scripted([message([{ type: "text", text: "Merhaba!", citations: null }], "end_turn")]);
    const inbound = { id: "w-err", phoneNumberId: "pn-1", from: "905551112233", text: "Selam", timestamp: 0 };
    await expect(handleInboundMessage(inbound, { store, send, createMessage })).rejects.toThrow("veritabanı yok");
    // Aynı mesaj yeniden gelince "duplicate" değil, tekrar işlenir.
    expect(await handleInboundMessage(inbound, { store, send, createMessage })).toBe("replied");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("yanıt gönderilemezse konuşma personele bırakılır, mesaj ikinci kez işlenmez", async () => {
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "pn-1");
    vi.stubEnv("WHATSAPP_BUSINESS_ID", barber.id);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const store = new InMemoryStore();
    const send = vi.fn(async () => {
      throw new Error("Meta 500");
    });
    const { createMessage } = scripted([message([{ type: "text", text: "Merhaba!", citations: null }], "end_turn")]);
    const inbound = { id: "w-send", phoneNumberId: "pn-1", from: "905551112233", text: "Selam", timestamp: 0 };
    expect(await handleInboundMessage(inbound, { store, send, createMessage })).toBe("send-failed");
    const [c] = await store.listConversations(barber.id);
    expect(c.status).toBe("handoff");
    expect(c.transcript.at(-1)?.text).toContain("ulaşmadı");
    expect(await handleInboundMessage(inbound, { store, send, createMessage })).toBe("duplicate");
  });
});

describe("block_customer", () => {
  it("uygunsuz müşteriyi engeller: tek cümle gider, sonraki mesajlara yanıt verilmez", async () => {
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "pn-1");
    vi.stubEnv("WHATSAPP_BUSINESS_ID", barber.id);
    const store = new InMemoryStore();
    const send = vi.fn(async () => {});
    const { createMessage, calls } = scripted([
      message([{ type: "tool_use", id: "t1", name: "block_customer", input: { reason: "Cinsel içerikli ısrar" } }], "tool_use"),
      message([{ type: "text", text: "Bu konuda yardımcı olamıyorum.", citations: null }], "end_turn"),
    ]);
    const inbound = { id: "w1", phoneNumberId: "pn-1", from: "905551112233", text: "(uygunsuz)", timestamp: 0 };
    expect(await handleInboundMessage(inbound, { store, send, createMessage })).toBe("replied");
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ text: "Bu konuda yardımcı olamıyorum.", options: [] }));
    const [c] = await store.listConversations(barber.id);
    expect(c.status).toBe("blocked");
    expect(c.handoffReason).toBe("Cinsel içerikli ısrar");

    expect(await handleInboundMessage({ ...inbound, id: "w2", text: "tekrar" }, { store, send, createMessage })).toBe("blocked");
    expect(send).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
    expect((await store.listConversations(barber.id))[0].transcript.map((m) => m.text)).toContain("tekrar");
  });

  it("istem küfür ve mahrem bölge isteklerine karşı kuralı içerir, araç tanımlıdır", () => {
    expect(buildSystemPrompt(barber)).toContain("block_customer");
    expect(buildSystemPrompt(barber)).toContain("etek tıraşı");
    expect(buildTools(barber).some((t) => t.name === "block_customer")).toBe(true);
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

  it("soru sorulup düğmeler gösterildikten sonra model aynı soruyu tekrar yazarsa müşteriye gitmez", async () => {
    const { store, conversation } = await setup(barber);
    const { createMessage } = scripted([
      message(
        [
          { type: "text", text: "Hangi hizmeti istersiniz?", citations: null },
          { type: "tool_use", id: "t1", name: "show_options", input: { options: ["Saç", "Sakal"] } },
        ],
        "tool_use",
      ),
      message([{ type: "text", text: "Hangi hizmeti istediğinizi seçebilirsiniz.", citations: null }], "end_turn"),
    ]);
    const result = await runAssistant({ business: barber, conversation, store, text: "randevu", now, createMessage });
    expect(result.reply).toBe("Hangi hizmeti istersiniz?");
    expect(result.options).toEqual(["Saç", "Sakal"]);
    // Geçmişte modelin yazdığı her şey durur; sonraki tur tutarlı kalsın.
    expect(JSON.stringify(conversation.history)).toContain("seçebilirsiniz");
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

describe("araç girdisindeki kaçış kodları", () => {
  it("\\u0131 gibi kodları gerçek karaktere çevirir (düğmeler ve müşteri adı)", async () => {
    const { store, conversation } = await setup(barber);
    const effects = { options: [] as string[], bookedAppointmentIds: [] as string[] };
    const ctx = { business: barber, conversation, store, now, effects };
    await executeTool("show_options", { options: ["Sal\\u0131 09:00", "Per\\u015fembe 12:00"] }, ctx);
    expect(effects.options).toEqual(["Salı 09:00", "Perşembe 12:00"]);

    await executeTool("show_options", { options: ["Salu0131 09:00", "Peru015fembe", "menu ve bonus 1234"] }, ctx);
    expect(effects.options).toEqual(["Salı 09:00", "Perşembe", "menu ve bonus 1234"]);

    await executeTool(
      "book_appointment",
      { customer_name: "Ay\\u015fe I\\u015f\\u0131k", service_id: "sac", staff_id: "any", start: "2026-10-26T10:00:00+03:00" },
      ctx,
    );
    expect((await store.listAppointments(barber.id))[0].customerName).toBe("Ayşe Işık");
  });
});

describe("demo takvimi", () => {
  it("demo sohbetinin randevusu gerçek takvime düşmez ama randevu kartı açılır", async () => {
    const store = new InMemoryStore();
    const conversation = await store.findOrCreateConversation({ businessId: barber.id, channel: "demo", contact: "d1" });
    const ctx = { business: barber, conversation, store, now };
    const r = await executeTool(
      "book_appointment",
      { customer_name: "Murat", service_id: "sac", staff_id: "mehmet", start: "2026-10-26T18:00:00+03:00" },
      ctx,
    );
    const { appointmentId } = JSON.parse(r.content);
    expect(await store.listAppointments(barber.id)).toHaveLength(0);
    expect(await store.listAppointments(`${barber.id}#demo`)).toHaveLength(1);
    const appointment = await store.getAppointment(appointmentId);
    expect((await loadBusiness(store, appointment!.businessId))?.id).toBe(barber.id);
    // Demo müşterisi kendi randevusunu görür ve iptal edebilir.
    expect(JSON.parse((await executeTool("list_my_appointments", {}, ctx)).content)).toHaveLength(1);
    expect((await executeTool("cancel_appointment", { appointment_id: appointmentId }, ctx)).content).toContain("ok");
  });
});

describe("düğme etiketleri ve yaklaşan randevu bağlamı", () => {
  it("bozuk Türkçe karakterli etiket işletmenin yazdığı ada çevrilir", async () => {
    const { canonicalLabel } = await import("@/lib/agent/tools");
    const names = ["Saç + sakal", "Saç kesimi", "Mehmet Usta", "Fark etmez"];
    expect(canonicalLabel('Sa"c + sakal', names)).toBe("Saç + sakal");
    expect(canonicalLabel("sac kesimi", names)).toBe("Saç kesimi");
    expect(canonicalLabel("Salı 14:30", names)).toBe("Salı 14:30");
    expect(canonicalLabel('"Evet"', names)).toBe("Evet");
  });

  it("müşterinin yaklaşan randevusu her turda modele bağlam olarak gider", async () => {
    const store = new InMemoryStore();
    const conversation = await store.findOrCreateConversation({ businessId: barber.id, channel: "whatsapp", contact: "905551112233" });
    await store.addAppointmentIfFree({
      businessId: barber.id, source: "assistant", customerName: "Murat", contact: "905551112233", serviceId: "sac-sakal",
      staffId: "mehmet", start: "2026-10-30T17:00:00.000Z", end: "2026-10-30T17:45:00.000Z",
    });
    const { createMessage, calls } = scripted([message([{ type: "text", text: "Merhaba Murat!", citations: null }], "end_turn")]);
    await runAssistant({ business: barber, conversation, store, text: "merhaba", now, createMessage });
    const sent = calls[0].messages.at(-1)!.content as string;
    expect(sent).toContain("[Müşterinin yaklaşan randevusu:");
    expect(sent).toContain("Mehmet Usta");
    expect(buildSystemPrompt(barber)).toContain("Randevuyu değiştir");
  });
});

describe("düğme güvenlik ağı", () => {
  it("evet/hayır ve 'hangi gün' sorularında model düğme göstermese de düğme gider", async () => {
    const { fallbackOptions } = await import("@/lib/agent/run");
    expect(fallbackOptions("Aynı saatte sadece ustayı değiştirelim mi?", barber, now)).toEqual(["Evet", "Hayır"]);
    expect(fallbackOptions("Taşınacak. Onaylıyor musunuz?", barber, now)).toEqual(["Evet", "Hayır"]);
    const days = fallbackOptions("Randevunuzu hangi gün ve saat aralığına taşımak istersiniz?", barber, now);
    expect(days[0]).toBe("Yarın");
    expect(days.length).toBeGreaterThanOrEqual(4);
    expect(days.some((d) => d.startsWith("Paz "))).toBe(false); // berber Pazar kapalı
    expect(fallbackOptions("Randevunuz güncellendi. Görüşmek üzere!", barber, now)).toEqual([]);
  });
});
