import Link from "next/link";
import { connection } from "next/server";
import { businesses, loadBusiness } from "@/lib/business";
import { resolvePanelBusiness } from "@/lib/dal";
import { getStore, type PriceExample } from "@/lib/store";
import { PanelHeader } from "../panel-header";
import { deleteExample, setExampleIncluded, setExamplePrice } from "./actions";
import { ImportChats } from "./import-chats";

export const metadata = { title: "Fiyat örnekleri · Sırada" };

const dateFmt = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short", year: "numeric" });

// Salonun geçmiş yazışmalarından çıkan "fotoğraf → verilen fiyat" örnekleri. Asistan bunları
// fotoğrafla fiyat sorulduğunda o salonun fiyat mantığını öğrenmek için kullanacak.
export default async function ExamplesPage(props: PageProps<"/panel/ornekler">) {
  await connection();
  const { isletme } = await props.searchParams;
  const store = await getStore();
  const { session, businessId } = await resolvePanelBusiness(isletme);
  const business = (await loadBusiness(store, businessId)) ?? businesses[0];
  const examples = await store.listPriceExamples(business.id);

  const missing = examples.filter((e) => e.included && e.priceMin === undefined);
  const ready = examples.filter((e) => e.included && e.priceMin !== undefined);
  const excluded = examples.filter((e) => !e.included);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <PanelHeader session={session} basePath="/panel/ornekler" businessId={business.id} />
      <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Fotoğrafla fiyat örnekleri</h1>
          <p className="text-sm text-muted">{business.name}</p>
        </div>
        <Link href={`/panel?isletme=${business.id}`} className="text-sm underline">
          ← Panele dön
        </Link>
      </header>

      <p className="mt-4 max-w-3xl text-sm text-muted">
        Müşterilerin gönderdiği saç fotoğrafları ve ustanın verdiği fiyatlar. Asistan, fotoğrafla fiyat sorulduğunda
        bu salonun benzer örneklerine bakarak karar verir. Örnekler sadece bu işletmenin asistanında kullanılır.
      </p>

      <section className="mt-6">
        <ImportChats businessId={business.id} />
      </section>

      <dl className="mt-8 flex flex-wrap gap-8 text-sm">
        <Stat label="Kullanıma hazır" value={ready.length} />
        <Stat label="Fiyatı eksik" value={missing.length} highlight={missing.length > 0} />
        <Stat label="Hariç tutulan" value={excluded.length} />
      </dl>

      {examples.length === 0 ? (
        <p className="mt-6 text-sm text-muted">Henüz örnek yok.</p>
      ) : (
        <>
          {missing.length > 0 && (
            <ExampleGroup
              title="Fiyatı bulunamayanlar"
              hint="Salonun cevabında fiyat okunamadı. Fiyatı yazın ya da örneği hariç tutun."
              examples={missing}
              businessId={business.id}
            />
          )}
          <ExampleGroup title="Örnekler" examples={ready} businessId={business.id} />
          {excluded.length > 0 && <ExampleGroup title="Hariç tutulanlar" examples={excluded} businessId={business.id} />}
        </>
      )}
    </main>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`font-display text-3xl font-semibold leading-none ${highlight ? "text-accent" : ""}`}>{value}</dd>
    </div>
  );
}

function ExampleGroup({
  title,
  hint,
  examples,
  businessId,
}: {
  title: string;
  hint?: string;
  examples: PriceExample[];
  businessId: string;
}) {
  if (examples.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">
        {title} <span className="text-muted">({examples.length})</span>
      </h2>
      {hint && <p className="text-sm text-muted">{hint}</p>}
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {examples.map((e) => (
          <ExampleCard key={e.id} example={e} businessId={businessId} />
        ))}
      </div>
    </section>
  );
}

function ExampleCard({ example: e, businessId }: { example: PriceExample; businessId: string }) {
  return (
    <article className={`flex flex-col rounded-xl border border-border bg-card ${e.included ? "" : "opacity-60"}`}>
      <div className="flex gap-1 p-2">
        {e.mediaIds.map((id) => (
          <a key={id} href={`/api/media/${id}`} target="_blank" rel="noopener noreferrer" className="flex-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- yetki kontrollü kullanıcı görseli */}
            <img src={`/api/media/${id}`} alt="Müşterinin gönderdiği saç fotoğrafı" loading="lazy" className="h-40 w-full rounded-lg object-cover" />
          </a>
        ))}
      </div>
      <div className="flex-1 space-y-2 px-3 pb-3 text-sm">
        {e.customerText && <p className="line-clamp-3 rounded-lg bg-bubble-in px-2.5 py-1.5">{e.customerText}</p>}
        <p className="line-clamp-4 rounded-lg bg-bubble-out px-2.5 py-1.5">{e.staffReply}</p>
        <p className="text-xs text-muted">{dateFmt.format(new Date(e.saidAt))}</p>
      </div>
      <footer className="space-y-2 border-t border-border px-3 py-2.5">
        <form action={setExamplePrice} className="flex items-center gap-2">
          <input type="hidden" name="businessId" value={businessId} />
          <input type="hidden" name="id" value={e.id} />
          <input
            name="price"
            defaultValue={e.priceText && e.priceMin !== undefined ? formatPrice(e) : ""}
            placeholder="Fiyat, ör. 4.000 TL"
            aria-label="Verilen fiyat"
            className="field flex-1 py-1.5 text-sm"
          />
          <button className="btn btn-line btn-sm">Kaydet</button>
        </form>
        <div className="flex justify-between text-xs">
          <form action={setExampleIncluded}>
            <input type="hidden" name="businessId" value={businessId} />
            <input type="hidden" name="id" value={e.id} />
            <input type="hidden" name="included" value={e.included ? "false" : "true"} />
            <button className="underline">{e.included ? "Hariç tut" : "Tekrar dahil et"}</button>
          </form>
          <form action={deleteExample}>
            <input type="hidden" name="businessId" value={businessId} />
            <input type="hidden" name="id" value={e.id} />
            <button className="text-red-600 hover:underline">Sil</button>
          </form>
        </div>
      </footer>
    </article>
  );
}

const tl = new Intl.NumberFormat("tr-TR");
function formatPrice(e: PriceExample) {
  return e.priceMin === e.priceMax ? `${tl.format(e.priceMin!)} TL` : `${tl.format(e.priceMin!)}–${tl.format(e.priceMax!)} TL`;
}
