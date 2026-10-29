// Fiyat alanı serbest metindir ("1.500 TL", "900–1.200 TL", "Kısa 1.500 · Uzun 2.500", "Muayene
// sonrası"). Asistan bunu aynen söyler. Burada yazım düzeltilir ("1500-2000" → "1.500–2.000 TL")
// ve sahibi için "asistan ne diyecek" önizlemesi üretilir; anlam değiştirilmez.

const tl = new Intl.NumberFormat("tr-TR");
const CURRENCY = /(tl|₺|lira)/i;

function formatNumber(raw: string): string {
  const value = Number(raw.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(value)) return raw;
  return value >= 100 ? tl.format(Math.round(value)) : raw; // "2 bin", "%20" gibi küçük sayılar dokunulmaz
}

export function normalizePriceText(input: string): string {
  let s = input.trim().replace(/\s+/g, " ");
  if (!s || !/\d/.test(s)) return s;
  // Aralık: "1500-2000", "1500 - 2000", "1500 ile 2000 arası" → "1.500–2.000"
  s = s.replace(/(\d[\d.,]*)\s*(?:-|–|—|ile)\s*(\d[\d.,]*)(\s*arası)?/gi, (_m, a, b) => `${formatNumber(a)}–${formatNumber(b)}`);
  // Tek sayılar: binlik ayracı
  s = s.replace(/\d[\d.,]*/g, (n) => (n.includes("–") ? n : formatNumber(n)));
  // Para birimi hiç yoksa her sayı grubunun (kademe) sonuna "TL".
  if (!CURRENCY.test(s)) {
    s = s.replace(/(\d[\d.–]*)(?=\s*(?:·|,|\/|$))/g, "$1 TL");
  }
  // "1.500 tl" → "1.500 TL"
  return s.replace(/\btl\b/gi, "TL").replace(/\s+TL/g, " TL");
}

export type PricePreview = { kind: "none" | "text" | "price"; text: string };

// Sahibi fiyat yazarken altında gösterilen açıklama.
export function describePrice(input: string): PricePreview {
  const s = input.trim();
  if (!s) return { kind: "none", text: "Boş: fiyat sorulunca asistan fiyat söylemez, işletmenin bilgi vereceğini söyler." };
  if (!/\d/.test(s)) return { kind: "text", text: `Rakam yok: asistan aynen "${s}" der.` };
  return { kind: "price", text: `Asistan böyle söyler: ${normalizePriceText(s)}` };
}
