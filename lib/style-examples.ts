import type { StyleExample } from "./store";

// Sistem istemine konacak üslup örnekleri: dahil edilenlerden, birbirinin tekrarı olmayan,
// en yeni ~25 çift (toplam ~6.000 karakter). Liste değişmedikçe istem aynı kalır, önbellek bozulmaz.
const MAX_EXAMPLES = 25;
const MAX_CHARS = 6000;

export function pickStyleExamples(list: StyleExample[]): { customerText: string; staffReply: string }[] {
  const seen = new Set<string>();
  const picked: { customerText: string; staffReply: string }[] = [];
  let chars = 0;
  for (const e of list) {
    if (!e.included) continue;
    const key = e.staffReply.toLocaleLowerCase("tr").replace(/\s+/g, " ").slice(0, 40);
    if (seen.has(key)) continue; // "Tamam, bekliyoruz" gibi aynı cevaplar bir kez
    const size = e.customerText.length + e.staffReply.length;
    if (chars + size > MAX_CHARS) continue;
    seen.add(key);
    picked.push({ customerText: e.customerText, staffReply: e.staffReply });
    chars += size;
    if (picked.length >= MAX_EXAMPLES) break;
  }
  return picked;
}
