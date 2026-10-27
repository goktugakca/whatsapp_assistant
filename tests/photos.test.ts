import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import type { CreateMessage } from "@/lib/agent/run";
import { photoQuotePolicy } from "@/lib/business";
import { validateBusiness } from "@/lib/business-schema";
import { barber } from "@/lib/businesses/barber";
import { dentalClinic } from "@/lib/businesses/dental-clinic";
import { hairSalon } from "@/lib/businesses/hair-salon";
import { handleInboundMessage } from "@/lib/inbound";
import { hydrateMedia, MAX_IMAGES_PER_CONVERSATION, mediaMarker } from "@/lib/media";
import { InMemoryStore } from "@/lib/store";
import { downloadMedia, parseInboundMessages } from "@/lib/whatsapp";

type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
const reply = (text: string) =>
  ({ id: "m", type: "message", role: "assistant", model: "t", content: [{ type: "text", text, citations: null }], stop_reason: "end_turn" }) as BetaMessage;
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("WhatsApp fotoğraf mesajı", () => {
  it("fotoğrafı kimliği ve açıklamasıyla çıkarır", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "pn-1" },
                messages: [
                  { id: "w1", from: "905551112233", timestamp: "1", type: "image", image: { id: "MID", mime_type: "image/jpeg", caption: " bu boya kaç para? " } },
                  { id: "w2", from: "905551112233", timestamp: "2", type: "image", image: { id: "MID2", mime_type: "image/jpeg" } },
                ],
              },
            },
          ],
        },
      ],
    };
    expect(parseInboundMessages(payload)).toMatchObject([
      { id: "w1", text: "bu boya kaç para?", image: { mediaId: "MID", mimeType: "image/jpeg" } },
      { id: "w2", text: "", image: { mediaId: "MID2" } },
    ]);
  });

  it("indirirken önce adresi sonra baytları anahtarla ister, büyük dosyayı reddeder", async () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "tok");
    const calls: [string, RequestInit | undefined][] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      if (url.includes("graph.facebook.com")) {
        return Response.json({ url: "https://lookaside.fbsbx.com/x", mime_type: "image/jpeg", file_size: JPEG.length });
      }
      return new Response(JPEG);
    }) as typeof fetch;
    const result = await downloadMedia("MID", 1024, fetchImpl);
    expect(result.mimeType).toBe("image/jpeg");
    expect(Buffer.compare(result.data, JPEG)).toBe(0);
    expect(calls.map(([u]) => u)).toEqual([expect.stringContaining("/MID"), "https://lookaside.fbsbx.com/x"]);
    expect(calls.every(([, i]) => (i?.headers as Record<string, string>).Authorization === "Bearer tok")).toBe(true);
    await expect(downloadMedia("MID", 3, fetchImpl)).rejects.toThrow("büyük");
  });
});

describe("fotoğrafla gelen mesaj", () => {
  function setup() {
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "pn-1");
    vi.stubEnv("WHATSAPP_BUSINESS_ID", hairSalon.id);
    const store = new InMemoryStore();
    const send = vi.fn(async () => {});
    const calls: Parameters<CreateMessage>[0][] = [];
    const createMessage: CreateMessage = async (params) => {
      calls.push(structuredClone(params));
      return reply("Fotoğrafınızı aldım, kuaförümüz fiyatı yazacak.");
    };
    const download = vi.fn(async () => ({ data: JPEG, mimeType: "image/jpeg" }));
    const message = (id: string, text = "bu boya kaç para?") => ({
      id,
      phoneNumberId: "pn-1",
      from: "905551112233",
      text,
      image: { mediaId: `M-${id}`, mimeType: "image/jpeg" },
      timestamp: 0,
    });
    return { store, send, calls, createMessage, download, message };
  }

  it("modele görseli gönderir; geçmişte sadece işaret, transkriptte fotoğraf kimliği kalır", async () => {
    const { store, send, calls, createMessage, download, message } = setup();
    expect(await handleInboundMessage(message("w1"), { store, send, createMessage, download })).toBe("replied");
    expect(download).toHaveBeenCalledWith("M-w1");

    const sent = calls[0].messages.at(-1)!.content as Anthropic.Beta.Messages.BetaContentBlockParam[];
    expect(sent[0]).toEqual({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: JPEG.toString("base64") } });
    expect(sent[1]).toMatchObject({ type: "text", text: expect.stringContaining("bu boya kaç para?") });

    const [conversation] = await store.listConversations(hairSalon.id);
    expect(JSON.stringify(conversation.history)).not.toContain(JPEG.toString("base64"));
    const mediaId = conversation.transcript[0].mediaId!;
    expect((await store.getMedia(mediaId))?.businessId).toBe(hairSalon.id);
    expect(conversation.history[0].content).toEqual([mediaMarker(mediaId), expect.objectContaining({ type: "text" })]);

    // Sonraki turda aynı görsel aynı yerde, birebir aynı gider (geçmiş değişmez, önbellek bozulmaz).
    await handleInboundMessage({ ...message("w2"), image: undefined, text: "teşekkürler" }, { store, send, createMessage, download });
    expect(calls[1].messages[0]).toEqual(calls[0].messages.at(-1));
  });

  it("devredilmiş konuşmada fotoğrafı panele düşer, yanıt vermez", async () => {
    const { store, send, createMessage, download, message } = setup();
    await handleInboundMessage(message("w1"), { store, send, createMessage, download });
    const [c] = await store.listConversations(hairSalon.id);
    c.status = "handoff";
    await store.saveConversation(c);
    expect(await handleInboundMessage(message("w2", ""), { store, send, createMessage, download })).toBe("handoff");
    const [after] = await store.listConversations(hairSalon.id);
    expect(after.transcript.at(-1)?.mediaId).toBeDefined();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("indirilemezse not düşerek devam eder", async () => {
    const { store, send, calls, createMessage, message } = setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const download = vi.fn(async () => {
      throw new Error("ağ");
    });
    await handleInboundMessage(message("w1"), { store, send, createMessage, download });
    expect(JSON.stringify(calls[0].messages.at(-1))).toContain("indirilemedi");
  });

  it("konuşma başına sınırdan sonraki fotoğrafı modele göstermez ama panele koyar", async () => {
    const { store, send, calls, createMessage, download, message } = setup();
    for (let i = 0; i <= MAX_IMAGES_PER_CONVERSATION; i++) {
      await handleInboundMessage(message(`w${i}`), { store, send, createMessage, download });
    }
    const last = calls.at(-1)!;
    const images = last.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((b) => b.type === "image");
    expect(images).toHaveLength(MAX_IMAGES_PER_CONVERSATION);
    expect(JSON.stringify(last.messages.at(-1))).toContain("panelde görülebilir");
    const [c] = await store.listConversations(hairSalon.id);
    expect(c.transcript.filter((m) => m.from === "customer").every((m) => m.mediaId)).toBe(true);
  });

  it("görseli bulunamayan işareti sabit bir notla değiştirir", async () => {
    const store = new InMemoryStore();
    const history = [{ role: "user" as const, content: [mediaMarker("00000000-0000-4000-8000-000000000000")] }];
    const out = await hydrateMedia(history, store);
    expect(out[0].content).toEqual([{ type: "text", text: "[Müşteri bir fotoğraf gönderdi; görsel açılamadı.]" }]);
    expect(history[0].content[0]).toEqual(mediaMarker("00000000-0000-4000-8000-000000000000"));
  });
});

describe("fotoğrafla fiyat ayarı", () => {
  it("varsayılan ustaya bırakmak; açıkça seçilirse asistan ön fiyat verir; diş kliniğinde hep hekime", () => {
    expect(photoQuotePolicy(barber)).toBe("staff");
    expect(buildSystemPrompt(barber)).toContain("Fotoğrafın ustaya iletildiğini");
    const assisted = { ...hairSalon, photoQuotes: "assistant" as const };
    expect(buildSystemPrompt(assisted)).toContain("fotoğrafa göre ön değerlendirme");
    expect(buildSystemPrompt(assisted)).toContain("kuaföre sorulacağını");
    expect(photoQuotePolicy({ ...dentalClinic, photoQuotes: "assistant" })).toBe("staff");
    expect(buildSystemPrompt({ ...dentalClinic, photoQuotes: "assistant" })).toContain("Fotoğrafın hekime iletildiğini");
  });

  it("ayar doğrulamasından geçer, geçersiz değeri reddeder", () => {
    expect(validateBusiness({ ...barber, photoQuotes: "assistant" })).toMatchObject({ ok: true });
    expect(validateBusiness({ ...barber, photoQuotes: "robot" }).ok).toBe(false);
  });
});
