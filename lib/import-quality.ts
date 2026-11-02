import type { PriceExample, StyleExample } from "./store";

// "Geçmiş yazışmalar" sayfasındaki kalite özeti: içe aktarılan örneklerin sağlıklı olup
// olmadığını tek bakışta gösterir (sayılar, fiyat dağılımı, hitap, olası sorunlar).

const ADDRESS_WORDS = ["abi", "abla", "hocam", "kardeşim", "kral", "reis", "canım", "efendim", "hanım", "bey", "usta", "dostum", "güzelim", "kanka"];
const EMOJI = /\p{Extended_Pictographic}/u;

export interface QualityReport {
  price: { total: number; priced: number; missing: number; excluded: number; min?: number; median?: number; max?: number; multiPhoto: number };
  style: { total: number; included: number; avgReply: number; withEmoji: number; topAddress: { word: string; count: number }[] };
  issues: { kind: string; text: string }[];
}

export function buildQualityReport(prices: PriceExample[], styles: StyleExample[]): QualityReport {
  const priced = prices.filter((e) => e.included && e.priceMin !== undefined);
  const values = priced.map((e) => e.priceMin!).sort((a, b) => a - b);
  const includedStyles = styles.filter((s) => s.included);
  const counts = new Map<string, number>();
  for (const s of includedStyles) {
    const words = new Set(s.staffReply.toLocaleLowerCase("tr").split(/[^a-zçğıöşü]+/));
    for (const w of ADDRESS_WORDS) if (words.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const issues: QualityReport["issues"] = [];
  for (const s of includedStyles) {
    if (/\d{5,}/.test(s.staffReply) || /\d{5,}/.test(s.customerText)) issues.push({ kind: "Gizlenmemiş uzun sayı", text: s.staffReply.slice(0, 120) });
    else if (s.staffReply.trim().split(/\s+/).length <= 1) issues.push({ kind: "Tek kelimelik cevap", text: s.staffReply });
  }
  for (const e of priced) {
    if (e.priceMin! < 150 || e.priceMax! > 50_000) issues.push({ kind: "Olağandışı fiyat", text: `${e.priceText ?? ""}`.slice(0, 120) });
  }
  return {
    price: {
      total: prices.length,
      priced: priced.length,
      missing: prices.filter((e) => e.included && e.priceMin === undefined).length,
      excluded: prices.filter((e) => !e.included).length,
      min: values[0],
      median: values.length ? values[Math.floor(values.length / 2)] : undefined,
      max: values.at(-1),
      multiPhoto: prices.filter((e) => e.mediaIds.length > 1).length,
    },
    style: {
      total: styles.length,
      included: includedStyles.length,
      avgReply: includedStyles.length ? Math.round(includedStyles.reduce((n, s) => n + s.staffReply.length, 0) / includedStyles.length) : 0,
      withEmoji: includedStyles.filter((s) => EMOJI.test(s.staffReply)).length,
      topAddress: [...counts].map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count).slice(0, 6),
    },
    issues: issues.slice(0, 15),
  };
}
