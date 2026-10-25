import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { FALLBACK_REPLY, runAssistant, type CreateMessage } from "@/lib/agent/run";
import { executeTool } from "@/lib/agent/tools";
import { demoClinic } from "@/lib/clinic";
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

async function setup() {
  const store = new InMemoryStore();
  const conversation = await store.findOrCreateConversation({
    clinicId: demoClinic.id,
    channel: "demo",
    contact: "test-session",
  });
  return { store, conversation };
}

describe("araçlar", () => {
  it("sadece boş saate randevu verir ve aynı saati ikinci kez vermez", async () => {
    const { store, conversation } = await setup();
    const ctx = { clinic: demoClinic, conversation, store, now };
    const start = "2026-10-26T10:00:00+03:00";

    const first = await executeTool("book_appointment", { patient_name: "Ali", service_id: "muayene", start }, ctx);
    expect(first.isError).toBeFalsy();
    expect(await store.listAppointments(demoClinic.id)).toHaveLength(1);

    const second = await executeTool("book_appointment", { patient_name: "Veli", service_id: "muayene", start }, ctx);
    expect(second.isError).toBe(true);

    const invented = await executeTool(
      "book_appointment",
      { patient_name: "Veli", service_id: "muayene", start: "2026-10-26T10:07:00+03:00" },
      ctx,
    );
    expect(invented.isError).toBe(true);
  });

  it("lead bilgisini boş alanları ezmeden birleştirir", async () => {
    const { store, conversation } = await setup();
    const ctx = { clinic: demoClinic, conversation, store, now };
    const empty = { name: "", country: "", language: "", treatment: "", timeframe: "", notes: "" };
    await executeTool("save_lead", { ...empty, name: "John", country: "UK" }, ctx);
    await executeTool("save_lead", { ...empty, treatment: "implant" }, ctx);
    expect(conversation.lead).toMatchObject({ name: "John", country: "UK", treatment: "implant" });
  });
});

describe("runAssistant", () => {
  it("araç çağrısını çalıştırır, sonucu modele geri verir ve son metni döndürür", async () => {
    const { store, conversation } = await setup();
    const { createMessage, calls } = scripted([
      message(
        [{ type: "tool_use", id: "t1", name: "check_availability", input: { date: "2026-10-26", service_id: "muayene" } }],
        "tool_use",
      ),
      message([{ type: "text", text: "Pazartesi 09:00 veya 09:30 uygun.", citations: null }], "end_turn"),
    ]);

    const result = await runAssistant({ clinic: demoClinic, conversation, store, text: "Pazartesi müsait misiniz?", now, createMessage });

    expect(result.reply).toBe("Pazartesi 09:00 veya 09:30 uygun.");
    expect(calls).toHaveLength(2);
    expect(calls[0].fallbacks).toBe("default");
    const toolResultTurn = calls[1].messages.at(-1)!;
    expect(toolResultTurn.role).toBe("user");
    const block = (toolResultTurn.content as Anthropic.Beta.Messages.BetaToolResultBlockParam[])[0];
    expect(block.tool_use_id).toBe("t1");
    expect(String(block.content)).toContain("2026-10-26T09:00:00+03:00");
    // Geçmiş sırası: kullanıcı, asistan(tool_use), kullanıcı(tool_result), asistan(metin)
    expect(conversation.history.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
  });

  it("modeli çağıramazsa konuşmayı devreder ve güvenli yanıt verir", async () => {
    const { store, conversation } = await setup();
    const createMessage: CreateMessage = async () => {
      throw new Error("ağ hatası");
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await runAssistant({ clinic: demoClinic, conversation, store, text: "Merhaba", now, createMessage });
    expect(result.reply).toBe(FALLBACK_REPLY);
    expect(conversation.status).toBe("handoff");
  });

  it("ret yanıtında geçmişe asistan turu eklemeden devreder", async () => {
    const { store, conversation } = await setup();
    const { createMessage } = scripted([message([], "refusal")]);
    const result = await runAssistant({ clinic: demoClinic, conversation, store, text: "...", now, createMessage });
    expect(result.handedOff).toBe(true);
    expect(conversation.history.map((m) => m.role)).toEqual(["user"]);
  });
});

describe("handleInboundMessage", () => {
  it("tekrar gelen mesajı yok sayar ve devredilmiş konuşmada otomatik yanıt vermez", async () => {
    vi.spyOn(demoClinic, "whatsappPhoneNumberId", "get").mockReturnValue("pn-1");
    const store = new InMemoryStore();
    const send = vi.fn(async () => {});
    const { createMessage } = scripted([
      message([{ type: "text", text: "Merhaba!", citations: null }], "end_turn"),
    ]);
    const inbound = { id: "wamid.1", phoneNumberId: "pn-1", from: "905551112233", text: "Selam", timestamp: 0 };

    expect(await handleInboundMessage(inbound, { store, send, createMessage })).toBe("replied");
    expect(send).toHaveBeenCalledWith({ phoneNumberId: "pn-1", to: "905551112233", text: "Merhaba!" });
    expect(await handleInboundMessage(inbound, { store, send, createMessage })).toBe("duplicate");

    const [conversation] = await store.listConversations(demoClinic.id);
    conversation.status = "handoff";
    expect(await handleInboundMessage({ ...inbound, id: "wamid.2" }, { store, send, createMessage })).toBe("handoff");
    expect(send).toHaveBeenCalledTimes(1);
  });
});
