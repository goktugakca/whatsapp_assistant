import { describe, expect, it, vi } from "vitest";
import { buildTools, executeTool } from "@/lib/agent/tools";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import { hairSalon } from "@/lib/businesses/hair-salon";
import { mediaMarker } from "@/lib/media";
import { isHit, pickExamples, quoteFromExamples, type ParseQuote, type PhotoQuote } from "@/lib/photo-quote";
import { runPhotoQuoteEval, splitForEval } from "@/lib/photo-quote-eval";
import { InMemoryStore, type NewPriceExample } from "@/lib/store";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]);
const salon = { ...hairSalon, photoQuotes: "examples" as const };

async function seed(store: InMemoryStore, n: number, text = (i: number) => (i % 2 ? "balyaj kaç para" : "dip boya ne kadar")) {
  for (let i = 0; i < n; i++) {
    const media = await store.saveMedia({ businessId: salon.id, mimeType: "image/jpeg", data: JPEG });
    const example: NewPriceExample = {
      businessId: salon.id,
      mediaIds: [media.id],
      imageHash: `h${i}`,
      customerText: text(i),
      staffReply: "fiyatı budur",
      priceText: "x",
      priceMin: i % 2 ? 4000 : 1500,
      priceMax: i % 2 ? 5000 : 1500,
      saidAt: new Date(Date.UTC(2026, 8, 1 + i)).toISOString(),
    };
    await store.addPriceExample(example);
  }
}

const parseWith = (quote: PhotoQuote): ParseQuote => async () => ({ parsed_output: quote, stop_reason: "end_turn" });

describe("örnek seçimi ve isabet", () => {
  it("soruyla ilgili örnekleri öne alır, fiyatsız ve hariç olanları atlar", async () => {
    const store = new InMemoryStore();
    await seed(store, 6);
    const all = await store.listPriceExamples(salon.id);
    await store.updatePriceExample(salon.id, all[1].id, { included: false }); // en yeni dip boya örneği
    const picked = pickExamples(await store.listPriceExamples(salon.id), "Balyaj yaptırsam kaç para olur", 3);
    expect(picked).toHaveLength(3);
    expect(picked.every((e) => e.customerText.includes("balyaj"))).toBe(true);
    expect(picked.some((e) => e.id === all[1].id)).toBe(false);
    expect(pickExamples(await store.listPriceExamples(salon.id), "dip boya", 5).some((e) => e.id === all[1].id)).toBe(false);
  });

  it("isabet: tahmin, gerçek aralığın %15 payla genişletilmiş haliyle kesişmeli", () => {
    expect(isHit({ priceMin: 4000, priceMax: 4500 }, { priceMin: 4000, priceMax: 5000 })).toBe(true);
    expect(isHit({ priceMin: 3500, priceMax: 3500 }, { priceMin: 4000, priceMax: 4000 })).toBe(true);
    expect(isHit({ priceMin: 3000, priceMax: 3300 }, { priceMin: 4000, priceMax: 4000 })).toBe(false);
  });

  it("modele örnekler, fiyatları ve müşterinin fotoğrafı gider; aralık düzeltilir", async () => {
    const store = new InMemoryStore();
    await seed(store, 2);
    const all = await store.listPriceExamples(salon.id);
    const media = await store.getMedia(all[0].mediaIds[0]);
    let sent: unknown;
    const parse: ParseQuote = async (params) => {
      sent = params;
      return { parsed_output: { service: "Balyaj", matchQuality: "high", priceMin: 5000, priceMax: 4000, basis: "", note: "" }, stop_reason: "end_turn" };
    };
    const quote = await quoteFromExamples({
      business: salon,
      photo: { mediaType: "image/jpeg", data: JPEG.toString("base64") },
      question: "kaç para",
      examples: all.map((example) => ({ example, image: { mediaType: "image/jpeg" as const, data: media!.data.toString("base64") } })),
      parse,
    });
    expect(quote).toMatchObject({ priceMin: 4000, priceMax: 5000 });
    const content = (sent as { messages: { content: { type: string; text?: string }[] }[] }).messages[0].content;
    expect(content.filter((b) => b.type === "image")).toHaveLength(3);
    expect(content.some((b) => b.text?.includes("4.000–5.000 TL"))).toBe(true);
    expect(content.at(-1)?.text).toContain(hairSalon.name);
  });
});

describe("quote_from_photo aracı", () => {
  it("sadece 'examples' modunda tanımlıdır ve istem onu kullanmayı söyler", () => {
    expect(buildTools(hairSalon).some((t) => t.name === "quote_from_photo")).toBe(false);
    expect(buildTools(salon).some((t) => t.name === "quote_from_photo")).toBe(true);
    expect(buildSystemPrompt(salon)).toContain("quote_from_photo");
    expect(buildSystemPrompt(hairSalon)).not.toContain("quote_from_photo");
  });

  it("yeterli örnek yoksa veya eşleşme zayıfsa fiyat vermez; güçlüyse aralık döndürür", async () => {
    const store = new InMemoryStore();
    const conversation = await store.findOrCreateConversation({ businessId: salon.id, channel: "demo", contact: "s" });
    const photo = await store.saveMedia({ businessId: salon.id, conversationId: conversation.id, mimeType: "image/jpeg", data: JPEG });
    conversation.history.push({ role: "user", content: [mediaMarker(photo.id), { type: "text", text: "balyaj kaç para" }] });
    const ctx = { business: salon, conversation, store };

    const few = await executeTool("quote_from_photo", { question: "balyaj" }, ctx);
    expect(few.content).toContain("yeterli fiyat örneği yok");

    await seed(store, 12);
    const low = await executeTool("quote_from_photo", { question: "balyaj" }, {
      ...ctx,
      parseQuote: parseWith({ service: "Balyaj", matchQuality: "low", priceMin: 0, priceMax: 0, basis: "", note: "" }),
    });
    expect(low.content).toContain("Fiyat verme");

    const high = await executeTool("quote_from_photo", { question: "balyaj" }, {
      ...ctx,
      parseQuote: parseWith({ service: "Balyaj", matchQuality: "high", priceMin: 4000, priceMax: 5000, basis: "1,3", note: "Saç uzun." }),
    });
    expect(JSON.parse(high.content)).toMatchObject({ service: "Balyaj", price: "4.000–5.000 TL", confidence: "high" });

    const noPhoto = await executeTool("quote_from_photo", { question: "balyaj" }, { ...ctx, conversation: { ...conversation, history: [] } });
    expect(noPhoto.content).toContain("fotoğraf yok");
  });
});

describe("sınav", () => {
  it("her 4. fiyatlı örneği test olarak ayırır", async () => {
    const store = new InMemoryStore();
    await seed(store, 20);
    const { test, reference } = splitForEval(await store.listPriceExamples(salon.id));
    expect(test).toHaveLength(5);
    expect(reference).toHaveLength(15);
    expect(new Set([...test, ...reference].map((e) => e.id)).size).toBe(20);
  });

  it("isabet, yanlış ve çekimser sayılır; hizmete göre dökülür", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const store = new InMemoryStore();
    await seed(store, 20);
    let n = 0;
    const parse: ParseQuote = async () => {
      n++;
      const q: PhotoQuote = { service: n % 2 ? "Balyaj" : "Dip boya", matchQuality: n === 3 ? "low" : "high", priceMin: 4200, priceMax: 4800, basis: "", note: "" };
      return { parsed_output: q, stop_reason: "end_turn" };
    };
    const r = await runPhotoQuoteEval({ business: salon, store, parse });
    expect(r.tested).toBe(5);
    expect(r.abstain).toBe(1);
    expect(r.hit + r.miss).toBe(4);
    expect(r.byService.reduce((s, x) => s + x.tested, 0)).toBe(5);
    expect(r.cases.every((c) => c.mediaId)).toBe(true);
    const saved = await store.savePhotoQuoteEval(salon.id, r);
    expect((await store.latestPhotoQuoteEval(salon.id))?.id).toBe(saved.id);
  });
});
