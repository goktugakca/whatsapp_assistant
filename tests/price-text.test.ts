import { describe, expect, it } from "vitest";
import { describePrice, normalizePriceText } from "@/lib/price-text";

describe("normalizePriceText", () => {
  it("yazımı düzeltir, anlamı değiştirmez", () => {
    expect(normalizePriceText("1500")).toBe("1.500 TL");
    expect(normalizePriceText("1500-2000")).toBe("1.500–2.000 TL");
    expect(normalizePriceText("1500 ile 2000 arası")).toBe("1.500–2.000 TL");
    expect(normalizePriceText(" 1.500 tl ")).toBe("1.500 TL");
    expect(normalizePriceText("900 TL'den başlar")).toBe("900 TL'den başlar");
    expect(normalizePriceText("Kısa 1500 · Orta 2000 · Uzun 2500")).toBe("Kısa 1.500 TL · Orta 2.000 TL · Uzun 2.500 TL");
    expect(normalizePriceText("Kısa 1.500 TL · Uzun 2.500 TL")).toBe("Kısa 1.500 TL · Uzun 2.500 TL");
    expect(normalizePriceText("Muayene sonrası")).toBe("Muayene sonrası");
    expect(normalizePriceText("")).toBe("");
  });

  it("önizleme üç durumu ayırır", () => {
    expect(describePrice("").kind).toBe("none");
    expect(describePrice("Ustaya göre").kind).toBe("text");
    expect(describePrice("1500").text).toContain("1.500 TL");
  });
});
