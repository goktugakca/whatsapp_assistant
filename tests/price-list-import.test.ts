import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import { businesses } from "@/lib/business";
import { hairSalon } from "@/lib/businesses/hair-salon";
import { glossaries } from "@/lib/glossary";
import { extractServicesFromImages, type ParseMessage } from "@/lib/price-list-import";
import { mergeServices } from "@/lib/service-merge";

describe("sektör sözlüğü", () => {
  it.each(businesses.map((b) => [b.type, b] as const))("%s için istemde yer alır", (type, business) => {
    const prompt = buildSystemPrompt(business);
    expect(prompt).toContain("Sektör sözlüğü");
    for (const term of glossaries[type]) expect(prompt).toContain(`- ${term.concept}: ${term.aka[0]}`);
  });

  it("kuaför istemi ombre ve brezilya fönünü doğru işleme bağlar, fiyat uydurmayı yasaklar", () => {
    const prompt = buildSystemPrompt(hairSalon);
    expect(prompt).toMatch(/- Balyaj: [^\n]*ombre/);
    expect(prompt).toMatch(/- Keratin bakımı: [^\n]*brezilya fönü/);
    expect(prompt).toContain("Kendin hesaplama, toplama, indirim veya tahmini fiyat söyleme");
  });
});

describe("fiyat listesi birleştirme", () => {
  const existing = [
    { id: "kesim", name: "Kesim + fön", description: "", durationMinutes: 60, priceInfo: "900 TL" },
    { id: "fon", name: "Fön", description: "", durationMinutes: 30, priceInfo: "450 TL" },
  ];
  const item = (over: Partial<Parameters<typeof mergeServices>[1][number]>) => ({
    name: "",
    priceInfo: "",
    durationMinutes: 30,
    durationEstimated: true,
    description: "",
    sameAs: "",
    ...over,
  });

  it("aynı adlı hizmetin sadece fiyatını günceller, yenileri okunur kimlikle ekler", () => {
    const result = mergeServices(existing, [
      item({ name: "KESİM + FÖN", priceInfo: "1.000 TL", durationMinutes: 45 }),
      item({ name: "Fön", priceInfo: "450 TL" }),
      item({ name: "Ombre / Balyaj", priceInfo: "Kısa 3.000 TL · Uzun 5.000 TL", durationMinutes: 183 }),
      item({ name: "Kalıcı Oje", priceInfo: "600 TL", durationMinutes: 50, durationEstimated: false }),
      item({ name: "  " }),
    ]);
    expect(result.updated).toBe(1);
    expect(result.services[0]).toMatchObject({ id: "kesim", priceInfo: "1.000 TL", durationMinutes: 60 });
    expect(result.services[1].priceInfo).toBe("450 TL");
    expect(result.services.slice(2)).toEqual([
      { id: "ombre-balyaj", name: "Ombre / Balyaj", description: "", durationMinutes: 185, priceInfo: "Kısa 3.000 TL · Uzun 5.000 TL" },
      { id: "kalici-oje", name: "Kalıcı Oje", description: "", durationMinutes: 50, priceInfo: "600 TL" },
    ]);
    expect(result.addedIds).toEqual(["ombre-balyaj", "kalici-oje"]);
    expect(result.estimatedIds).toEqual(["ombre-balyaj"]);
  });

  it("model aynı hizmet dediyse (sameAs) yeni kayıt açmaz, mevcudun fiyatını günceller", () => {
    const result = mergeServices(existing, [item({ name: "Brezilya Fönü", priceInfo: "500 TL", sameAs: "Fön" })]);
    expect(result.addedIds).toEqual([]);
    expect(result.services.map((s) => [s.id, s.priceInfo])).toEqual([
      ["kesim", "900 TL"],
      ["fon", "500 TL"],
    ]);
  });

  it("değiştirme modunda listede olmayan mevcut hizmetleri çıkarır, eşleşenlerin kimliğini korur", () => {
    const result = mergeServices(existing, [item({ name: "Fön", priceInfo: "500 TL" }), item({ name: "Manikür" })], {
      replace: true,
    });
    expect(result.services.map((s) => s.id)).toEqual(["fon", "manikur"]);
    expect(result.removed).toBe(1);
  });

  it("süreyi 5–600 dakika aralığına ve 5'in katına yuvarlar", () => {
    const { services } = mergeServices([], [item({ name: "A", durationMinutes: 2 }), item({ name: "B", durationMinutes: 900 })]);
    expect(services.map((s) => s.durationMinutes)).toEqual([5, 600]);
  });
});

describe("fotoğraftan hizmet çıkarma", () => {
  it("görselleri modele gönderir ve çıkan listeyi döndürür", async () => {
    const calls: unknown[] = [];
    const parse: ParseMessage = async (params) => {
      calls.push(params);
      return {
        stop_reason: "end_turn",
        parsed_output: { services: [item("Manikür", "500 TL")], notes: "" },
      };
    };
    const result = await extractServicesFromImages({
      businessType: "nail_salon",
      images: [{ mediaType: "image/jpeg", data: "QUJD" }],
      existingServiceNames: ["Kalıcı oje"],
      parse,
    });
    expect(result.services[0].name).toBe("Manikür");
    const params = calls[0] as { messages: { content: { type: string; source?: { data: string } }[] }[] };
    expect(params.messages[0].content[0]).toMatchObject({ type: "image", source: { data: "QUJD" } });
    expect(JSON.stringify(params)).toContain("tırnak salonu");
    expect(JSON.stringify(params)).toContain("- Kalıcı oje");
    expect(JSON.stringify(params)).toContain("Protez tırnak: takma tırnak");
  });

  it("model reddederse veya çıktı yoksa boş liste ve not döndürür", async () => {
    const parse: ParseMessage = async () => ({ stop_reason: "refusal", parsed_output: null });
    const result = await extractServicesFromImages({ businessType: "barber", images: [], parse });
    expect(result.services).toEqual([]);
    expect(result.notes).toContain("okunamadı");
  });
});

function item(name: string, priceInfo: string) {
  return { name, priceInfo, durationMinutes: 45, durationEstimated: true, description: "", sameAs: "" };
}
