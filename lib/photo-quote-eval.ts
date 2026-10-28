import type { Business } from "./business";
import { isHit, loadExampleImages, MIN_EXAMPLES, pickExamples, quoteFromExamples, type ParseQuote } from "./photo-quote";
import type { PriceExample, Store } from "./store";

// "Sınav": salonun örneklerinin bir kısmı ayrılır, asistan geri kalan örneklere bakarak bu
// ayrılanlara fiyat verir; verdiği fiyat ustanın gerçekte verdiğiyle karşılaştırılır. Böylece
// salon, asistanı fotoğrafla fiyat için açmadan önce ne kadar tutarlı olduğunu görür.

export const MAX_TEST_CASES = 30;
const CONCURRENCY = 4;

export interface EvalCase {
  exampleId: string;
  mediaId: string;
  customerText: string;
  actual: { priceMin: number; priceMax: number };
  quote?: { service: string; priceMin: number; priceMax: number; matchQuality: "high" | "medium" | "low"; note: string };
  outcome: "hit" | "miss" | "abstain" | "error"; // abstain: asistan fiyat vermeyip ustaya devrederdi
}

export interface EvalResult {
  createdAt: string;
  totalExamples: number;
  tested: number;
  hit: number;
  miss: number;
  abstain: number;
  error: number;
  byService: { service: string; tested: number; hit: number; miss: number; abstain: number }[];
  cases: EvalCase[];
}

// Her 4. fiyatlı örnek test olur (en çok MAX_TEST_CASES); kalanlar referans.
export function splitForEval(examples: PriceExample[], max = MAX_TEST_CASES): { test: PriceExample[]; reference: PriceExample[] } {
  const priced = examples
    .filter((e) => e.included && e.priceMin !== undefined && e.priceMax !== undefined && e.mediaIds.length > 0)
    .sort((a, b) => a.saidAt.localeCompare(b.saidAt));
  const test = priced.filter((_, i) => i % 4 === 3).slice(0, max);
  const testIds = new Set(test.map((e) => e.id));
  return { test, reference: priced.filter((e) => !testIds.has(e.id)) };
}

export async function runPhotoQuoteEval(params: {
  business: Business;
  store: Store;
  parse?: ParseQuote;
  max?: number;
}): Promise<EvalResult> {
  const { business, store } = params;
  const all = await store.listPriceExamples(business.id);
  const { test, reference } = splitForEval(all, params.max);
  const result: EvalResult = {
    createdAt: new Date().toISOString(),
    totalExamples: all.filter((e) => e.included && e.priceMin !== undefined).length,
    tested: 0,
    hit: 0,
    miss: 0,
    abstain: 0,
    error: 0,
    byService: [],
    cases: [],
  };
  if (reference.length < MIN_EXAMPLES - 1 || test.length === 0) return result;

  const run = async (e: PriceExample): Promise<EvalCase> => {
    const base: EvalCase = {
      exampleId: e.id,
      mediaId: e.mediaIds[0],
      customerText: e.customerText,
      actual: { priceMin: e.priceMin!, priceMax: e.priceMax! },
      outcome: "error",
    };
    try {
      const media = await store.getMedia(e.mediaIds[0]);
      if (!media) return base;
      const picked = pickExamples(reference, e.customerText, undefined, e.id);
      const quote = await quoteFromExamples({
        business,
        photo: { mediaType: media.mimeType as "image/jpeg", data: media.data.toString("base64") },
        question: e.customerText,
        examples: await loadExampleImages(store, picked),
        parse: params.parse,
      });
      if (!quote) return { ...base, outcome: "abstain" };
      const q = { service: quote.service, priceMin: quote.priceMin, priceMax: quote.priceMax, matchQuality: quote.matchQuality, note: quote.note };
      if (quote.matchQuality === "low") return { ...base, quote: q, outcome: "abstain" };
      return { ...base, quote: q, outcome: isHit(quote, base.actual) ? "hit" : "miss" };
    } catch (error) {
      console.error("Sınav örneği başarısız:", e.id, error);
      return base;
    }
  };

  // Birkaç örnek aynı anda; model çağrıları birkaç saniye sürüyor.
  const cases: EvalCase[] = [];
  for (let i = 0; i < test.length; i += CONCURRENCY) {
    cases.push(...(await Promise.all(test.slice(i, i + CONCURRENCY).map(run))));
  }
  result.cases = cases;
  result.tested = cases.length;
  for (const c of cases) result[c.outcome]++;

  const services = new Map<string, EvalResult["byService"][number]>();
  for (const c of cases) {
    const service = c.quote?.service?.trim() || "(belirsiz)";
    const row = services.get(service) ?? { service, tested: 0, hit: 0, miss: 0, abstain: 0 };
    row.tested++;
    if (c.outcome === "hit") row.hit++;
    else if (c.outcome === "miss") row.miss++;
    else if (c.outcome === "abstain") row.abstain++;
    services.set(service, row);
  }
  result.byService = [...services.values()].sort((a, b) => b.tested - a.tested);
  return result;
}
