import Link from "next/link";
import { connection } from "next/server";
import { businesses, loadBusiness, photoQuotePolicy } from "@/lib/business";
import { resolvePanelBusiness } from "@/lib/dal";
import { MIN_EXAMPLES, formatRange } from "@/lib/photo-quote";
import { MAX_TEST_CASES, splitForEval, type EvalResult } from "@/lib/photo-quote-eval";
import { getStore } from "@/lib/store";
import { PanelHeader } from "../../panel-header";
import { RunEvalButton } from "./run-button";

export const metadata = { title: "Fiyat sınavı · Sırada" };

const dateFmt = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
const pct = (n: number, d: number) => (d === 0 ? "–" : `%${Math.round((100 * n) / d)}`);

// Sınav: asistan, ayrılan örneklere kalan örneklere bakarak fiyat verir; ustanın gerçek fiyatıyla
// karşılaştırılır. Salon buna bakarak "örneklerden fiyat ver" ayarını açıp açmamaya karar verir.
export default async function EvalPage(props: PageProps<"/panel/ornekler/sinav">) {
  await connection();
  const { isletme } = await props.searchParams;
  const store = await getStore();
  const { session, businessId } = await resolvePanelBusiness(isletme);
  const business = (await loadBusiness(store, businessId)) ?? businesses[0];
  const examples = await store.listPriceExamples(business.id);
  const { test, reference } = splitForEval(examples);
  const latest = await store.latestPhotoQuoteEval(business.id);
  const r = latest?.result as EvalResult | undefined;
  const enough = reference.length >= MIN_EXAMPLES - 1 && test.length > 0;
  const answered = r ? r.hit + r.miss : 0;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <PanelHeader session={session} basePath="/panel/ornekler/sinav" businessId={business.id} />
      <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Fiyat sınavı</h1>
          <p className="text-sm text-muted">{business.name}</p>
        </div>
        <Link href={`/panel/ornekler?isletme=${business.id}`} className="text-sm underline">
          ← Örneklere dön
        </Link>
      </header>

      <p className="mt-4 max-w-3xl text-sm text-muted">
        Örneklerinizin dörtte biri (en çok {MAX_TEST_CASES}) ayrılır; asistan onları görmeden, kalan örneklere bakarak fiyat
        verir. Verdiği fiyat ustanın o gün verdiği fiyatla karşılaştırılır (%15 pay). Emin olamadığında fiyat vermeyip
        size iletir; bu da sayılır.
      </p>

      <section className="mt-6 rounded-xl border-2 border-dashed border-accent/40 bg-card p-5">
        <p className="text-sm">
          {enough
            ? `${test.length} örnek sınanacak, ${reference.length} örnek referans olacak.`
            : `Sınav için en az ${MIN_EXAMPLES + 3} fiyatlı örnek gerekir; şu an ${reference.length + test.length} var.`}
        </p>
        <div className="mt-3">
          <RunEvalButton businessId={business.id} disabled={!enough} />
        </div>
      </section>

      {r && (
        <>
          <dl className="mt-8 flex flex-wrap gap-8 text-sm">
            <Stat label="Sınanan" value={String(r.tested)} />
            <Stat label="Fiyat verdiğinde isabet" value={pct(r.hit, answered)} sub={`${r.hit} / ${answered}`} />
            <Stat label="Size ilettiği" value={pct(r.abstain, r.tested)} sub={`${r.abstain} örnek`} />
            {r.error > 0 && <Stat label="Hata" value={String(r.error)} />}
          </dl>
          <p className="mt-2 text-xs text-muted">Son sınav: {dateFmt.format(new Date(r.createdAt))}</p>

          <p className="mt-6 max-w-3xl text-sm">
            {verdict(r)}{" "}
            {photoQuotePolicy(business) !== "examples" && (
              <>
                Açmak için <Link href={`/panel/ayarlar?isletme=${business.id}`} className="underline">Ayarlar</Link> →
                “Müşteri fotoğraf gönderip fiyat sorarsa” → “geçmiş örneklerinize göre”.
              </>
            )}
          </p>

          {r.byService.length > 0 && (
            <section className="mt-8">
              <h2 className="text-lg font-semibold">Hizmete göre</h2>
              <table className="mt-2 w-full max-w-2xl text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="py-1 pr-4 font-normal">Hizmet</th>
                    <th className="py-1 pr-4 font-normal">Sınanan</th>
                    <th className="py-1 pr-4 font-normal">İsabet</th>
                    <th className="py-1 pr-4 font-normal">Yanlış</th>
                    <th className="py-1 font-normal">Size iletti</th>
                  </tr>
                </thead>
                <tbody>
                  {r.byService.map((s) => (
                    <tr key={s.service} className="border-t border-border">
                      <td className="py-1.5 pr-4">{s.service}</td>
                      <td className="py-1.5 pr-4">{s.tested}</td>
                      <td className="py-1.5 pr-4">{s.hit}</td>
                      <td className={`py-1.5 pr-4 ${s.miss > 0 ? "text-danger" : ""}`}>{s.miss}</td>
                      <td className="py-1.5">{s.abstain}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="mt-8">
            <h2 className="text-lg font-semibold">Tek tek</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {r.cases.map((c) => (
                <article key={c.exampleId} className={`rounded-xl border bg-card p-3 text-sm ${c.outcome === "miss" ? "border-red-400" : "border-border"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- yetki kontrollü kullanıcı görseli */}
                  <img src={`/api/media/${c.mediaId}`} alt="Örnek fotoğraf" loading="lazy" className="h-32 w-full rounded-lg object-cover" />
                  {c.customerText && <p className="mt-2 line-clamp-2 text-xs text-muted">{c.customerText}</p>}
                  <p className="mt-2">
                    Usta: <b>{formatRange(c.actual.priceMin, c.actual.priceMax)}</b>
                  </p>
                  <p>
                    Asistan:{" "}
                    {c.outcome === "abstain" ? (
                      <span className="text-muted">fiyat vermedi, size iletirdi</span>
                    ) : c.outcome === "error" ? (
                      <span className="text-muted">hata</span>
                    ) : (
                      <b className={c.outcome === "miss" ? "text-danger" : "text-ok"}>{formatRange(c.quote!.priceMin, c.quote!.priceMax)}</b>
                    )}
                  </p>
                  {c.quote?.note && <p className="mt-1 text-xs text-muted">{c.quote.note}</p>}
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function verdict(r: EvalResult): string {
  const answered = r.hit + r.miss;
  if (answered === 0) return "Asistan hiçbir örnekte fiyat vermedi; örnekler çeşitli hizmetlere dağılmış olabilir, daha fazla örnek yükleyin.";
  const rate = r.hit / answered;
  if (rate >= 0.85) return "Fiyat verdiği örneklerin büyük çoğunluğunda ustayla aynı aralıkta. Bu ayarı açmak makul görünüyor.";
  if (rate >= 0.7) return "Çoğunlukla tutarlı ama her 4–5 cevaptan biri farklı. Yanlış çıkan hizmetlere bakın; o hizmetlerde daha fazla örnek yardımcı olur.";
  return "Henüz yeterince tutarlı değil. Şimdilik fotoğrafların size gelmesi daha güvenli; daha fazla örnek yükleyip tekrar sınayın.";
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-display text-3xl font-semibold leading-none">{value}</dd>
      {sub && <dd className="mt-1 text-xs text-muted">{sub}</dd>}
    </div>
  );
}
