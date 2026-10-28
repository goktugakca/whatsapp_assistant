import { describe, expect, it, vi } from "vitest";
import { barber } from "@/lib/businesses/barber";
import { handleInstagramMessage } from "@/lib/inbound";
import {
  buildQuickReplies,
  openToken,
  parseInstagramMessages,
  parseSignedRequest,
  sealToken,
  splitText,
} from "@/lib/instagram";
import { refreshInstagramTokens } from "@/lib/instagram-tokens";
import { InMemoryStore } from "@/lib/store";
import { createHmac } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import type { CreateMessage } from "@/lib/agent/run";

type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
function message(content: BetaMessage["content"], stop_reason: BetaMessage["stop_reason"]): BetaMessage {
  return { id: "msg", type: "message", role: "assistant", model: "test", content, stop_reason } as BetaMessage;
}
function scripted(responses: BetaMessage[]) {
  const createMessage: CreateMessage = async () => {
    const next = responses.shift();
    if (!next) throw new Error("Beklenmeyen model çağrısı");
    return next;
  };
  return { createMessage };
}

const event = (messaging: Record<string, unknown>) => ({
  object: "instagram",
  entry: [{ id: "17841400000", time: 1, messaging: [{ sender: { id: "9001" }, recipient: { id: "17841400000" }, timestamp: 5, ...messaging }] }],
});

describe("parseInstagramMessages", () => {
  it("metin, fotoğraf ve hızlı yanıtı okur; echo, silinen ve okundu bildirimlerini atlar", () => {
    expect(parseInstagramMessages(event({ message: { mid: "m1", text: " Merhaba " } }))).toEqual([
      { id: "m1", accountId: "17841400000", from: "9001", text: "Merhaba", imageUrl: undefined, timestamp: 5 },
    ]);
    const [photo] = parseInstagramMessages(
      event({ message: { mid: "m2", attachments: [{ type: "image", payload: { url: "https://lookaside.fbsbx.com/x.jpg" } }] } }),
    );
    expect(photo).toMatchObject({ imageUrl: "https://lookaside.fbsbx.com/x.jpg", text: "" });
    const [quick] = parseInstagramMessages(event({ message: { mid: "m3", text: "Mehmet Us…", quick_reply: { payload: "Mehmet Usta" } } }));
    expect(quick.text).toBe("Mehmet Usta");
    expect(parseInstagramMessages(event({ message: { mid: "m4", text: "x", is_echo: true } }))).toEqual([]);
    expect(parseInstagramMessages(event({ message: { mid: "m5", is_deleted: true } }))).toEqual([]);
    expect(parseInstagramMessages(event({ read: { mid: "m1" } }))).toEqual([]);
    expect(parseInstagramMessages({ object: "whatsapp_business_account" })).toEqual([]);
  });

  it("ses ve paylaşım gibi mesajları açıklama metnine çevirir", () => {
    const [m] = parseInstagramMessages(event({ message: { mid: "m6", attachments: [{ type: "audio", payload: { url: "https://x/y.mp4" } }] } }));
    expect(m.text).toContain("sesli mesaj");
    expect(m.imageUrl).toBeUndefined();
  });
});

describe("gönderim yardımcıları", () => {
  it("uzun metni 1000 baytın altında, cümle sınırından böler", () => {
    const text = Array.from({ length: 30 }, (_, i) => `Cümle ${i} şöyle böyle uzun bir açıklama içeriyor.`).join(" ");
    const parts = splitText(text);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(Buffer.byteLength(p)).toBeLessThanOrEqual(1000);
    expect(parts.join(" ")).toBe(text);
    expect(splitText("kısa")).toEqual(["kısa"]);
  });

  it("hızlı yanıt başlığı 20 karakterde kesilir, payload tam kalır", () => {
    const [q] = buildQuickReplies(["Çarşamba 14:00 Mehmet Usta ile"]);
    expect(q.title.length).toBeLessThanOrEqual(20);
    expect(q.payload).toBe("Çarşamba 14:00 Mehmet Usta ile");
    expect(buildQuickReplies(Array.from({ length: 20 }, (_, i) => `s${i}`))).toHaveLength(13);
  });
});

describe("anahtar saklama ve Meta imzaları", () => {
  it("şifrelenen anahtar geri açılır, bozulursa açılmaz", () => {
    const sealed = sealToken("IGQVJ-gizli");
    expect(sealed).not.toContain("gizli");
    expect(openToken(sealed)).toBe("IGQVJ-gizli");
    expect(() => openToken(sealed.slice(0, -2) + "zz")).toThrow();
  });

  it("signed_request doğrulanır", () => {
    const payload = Buffer.from(JSON.stringify({ user_id: "17841400000" })).toString("base64url");
    const sig = createHmac("sha256", "s3cret").update(payload).digest("base64url");
    expect(parseSignedRequest(`${sig}.${payload}`, "s3cret")).toEqual({ user_id: "17841400000" });
    expect(parseSignedRequest(`${sig}.${payload}`, "baska")).toBeNull();
  });
});

describe("handleInstagramMessage", () => {
  const account = {
    businessId: barber.id,
    accountId: "17841400000",
    username: "usturaberber",
    sealedToken: sealToken("tok"),
    tokenExpiresAt: new Date(Date.now() + 50 * 86_400_000).toISOString(),
    connectedAt: new Date().toISOString(),
  };

  it("bağlı hesabın mesajına yanıt verir, adı alır, tekrarı ve bağlı olmayan hesabı atlar", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = new InMemoryStore();
    await store.saveInstagramAccount(account);
    const calls: { url: string; body?: unknown }[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.includes("/9001?fields")) return Response.json({ name: "Murat", username: "murat" });
      return Response.json({ message_id: "x" });
    }) as typeof fetch;
    const { createMessage } = scripted([message([{ type: "text", text: "Hoş geldiniz!", citations: null }], "end_turn")]);
    const inbound = { id: "m1", accountId: "17841400000", from: "9001", text: "Selam", timestamp: 0 };

    expect(await handleInstagramMessage(inbound, { store, createMessage, fetchImpl })).toBe("replied");
    const send = calls.find((c) => c.url.endsWith("/me/messages"));
    expect(send?.body).toEqual({ recipient: { id: "9001" }, message: { text: "Hoş geldiniz!" } });
    const [conversation] = await store.listConversations(barber.id);
    expect(conversation).toMatchObject({ channel: "instagram", contact: "9001", contactName: "Murat" });

    expect(await handleInstagramMessage(inbound, { store, createMessage, fetchImpl })).toBe("duplicate");
    expect(await handleInstagramMessage({ ...inbound, id: "m2", accountId: "999" }, { store, createMessage, fetchImpl })).toBe(
      "unknown-business",
    );
  });

  it("fotoğrafı indirip konuşmaya ekler", async () => {
    const store = new InMemoryStore();
    await store.saveInstagramAccount(account);
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("lookaside.fbsbx.com")) return new Response(Buffer.from([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
      if (url.includes("?fields")) return Response.json({});
      return Response.json({ message_id: "x" });
    }) as typeof fetch;
    const { createMessage } = scripted([message([{ type: "text", text: "Fotoğraf ustaya iletildi.", citations: null }], "end_turn")]);
    await handleInstagramMessage(
      { id: "m9", accountId: "17841400000", from: "9001", text: "", imageUrl: "https://lookaside.fbsbx.com/a.jpg", timestamp: 0 },
      { store, createMessage, fetchImpl },
    );
    const [conversation] = await store.listConversations(barber.id);
    expect(conversation.transcript[0].mediaId).toBeDefined();
    expect((await store.getMedia(conversation.transcript[0].mediaId!))?.data).toEqual(Buffer.from([1, 2, 3]));
  });

  it("süresi yaklaşan anahtarlar yenilenir", async () => {
    const store = new InMemoryStore();
    await store.saveInstagramAccount({ ...account, tokenExpiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString() });
    const refresh = vi.fn(async () => ({ token: "yeni", expiresAt: new Date(Date.now() + 60 * 86_400_000).toISOString() }));
    expect(await refreshInstagramTokens({ store, refresh })).toEqual({ refreshed: 1, failed: [] });
    expect(openToken((await store.getInstagramAccount(barber.id))!.sealedToken)).toBe("yeni");
    expect(await refreshInstagramTokens({ store, refresh })).toEqual({ refreshed: 0, failed: [] });
  });
});
