import { loadBusiness } from "@/lib/business";
import { assertBusinessAccess } from "@/lib/dal";
import { runPhotoQuoteEval } from "@/lib/photo-quote-eval";
import { getStore } from "@/lib/store";

// Fotoğrafla fiyat sınavını çalıştırır (dakikalar sürebilir; sonuç kaydedilir ve sayfada gösterilir).
export const maxDuration = 300;

export async function POST(request: Request) {
  const businessId = new URL(request.url).searchParams.get("isletme") ?? "";
  try {
    await assertBusinessAccess(businessId);
  } catch {
    return new Response("Yetkisiz", { status: 401 });
  }
  const store = await getStore();
  const business = await loadBusiness(store, businessId);
  if (!business) return new Response("İşletme bulunamadı", { status: 404 });
  const result = await runPhotoQuoteEval({ business, store });
  await store.savePhotoQuoteEval(business.id, result);
  return Response.json({ tested: result.tested, hit: result.hit, miss: result.miss, abstain: result.abstain, error: result.error });
}
