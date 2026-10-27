import Link from "next/link";
import { AppointmentCardView } from "@/app/components/appointment-card";
import type { AppointmentCard } from "@/lib/calendar";
import { verticals } from "@/lib/verticals";
import { WaitlistForm } from "./waitlist-form";

// Tanıtım ve pilot başvurusu sayfası. Görsel dil: salonun çizgili randevu defteri (mavi
// tükenmez, pembe kenar çizgisi, fosforlu kalem).

const problems = [
  {
    title: "Eliniz doluyken",
    body: "Müşteri koltuktayken telefona bakamazsınız. Cevap alamayan kişi bir sonraki salona yazar.",
  },
  {
    title: "Kapandıktan sonra",
    body: "Randevu istekleri akşam, gece ve kapalı günlerde de gelir. Kimse sabaha kadar beklemez.",
  },
  {
    title: "Her gün aynı sorular",
    body: "Fiyat ne kadar, yarın yer var mı, adres nerede? Hepsine sizin bilgilerinizle cevap verir.",
  },
];

// Bir randevunun baştan sona akışı; deftere saat saat yazılmış gibi.
const flow = [
  { at: "22:41", text: "Müşteri yazar: “Yarın akşam saç sakal için yer var mı?”" },
  { at: "22:41", text: "Asistan ustayı sorar. Mehmet Usta mı, Can mı, fark etmez mi?" },
  { at: "22:42", text: "Sadece Mehmet Usta'nın gerçekten boş saatlerini gösterir." },
  { at: "22:42", text: "Randevuyu deftere yazar, müşteriye onayını gönderir. Panelinize düşer." },
  { at: "Ertesi gün", text: "Randevudan önce müşteriye hatırlatma gider." },
];

const features = [
  ["Her ustanın kendi takvimi", "Kim hangi gün çalışıyor, hangi hizmeti kaça yapıyor; asistan bilir."],
  ["Tek dokunuşla seçim", "Hizmet, usta ve saat WhatsApp'ta düğme olarak gelir. Müşteri yazmakla uğraşmaz."],
  ["Hatırlatma", "Randevudan önce müşteriye haber verir. Unutulan randevu azalır."],
  ["İptal ve erteleme", "Müşteri randevusunu kendisi iptal eder veya kaydırır; saat başkasına açılır."],
  ["Gerektiğinde size bırakır", "Emin olmadığı bir şeyde veya müşteri isterse konuşmayı size devreder."],
  ["Aylık döküm", "Kaç kişi yazdı, kapalıyken kaç randevu geldi, bunlar kaç lira ediyor."],
];

// Ana sayfadaki örnek defter sayfası. Gerçek bir randevu değil; düğmeleri gizli.
const sample: AppointmentCard = {
  id: "00002f00-0000-4000-8000-000000000000", // No. 047
  businessName: "Ustura Berber",
  serviceName: "Saç + sakal",
  staffName: "Mehmet Usta",
  customerName: "Murat",
  start: "2026-10-28T19:00:00+03:00",
  end: "2026-10-28T19:45:00+03:00",
  priceInfo: "700 TL",
  address: "Tunalı Hilmi Cad. No:5, Çankaya",
};

const sectors = Object.values(verticals).map((v) => v.label);

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-12 sm:px-6">
      <header className="flex items-center justify-between border-b border-border py-4">
        <span className="hand text-[34px] font-bold leading-none">Sırada</span>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/demo" className="text-accent underline decoration-1 underline-offset-4">
            Canlı demo
          </Link>
          <Link href="/giris" className="text-muted">
            Giriş
          </Link>
        </nav>
      </header>

      <section className="grid items-center gap-12 py-12 sm:py-20 md:grid-cols-[1.15fr_1fr]">
        <div>
          <p className="text-[13px] text-muted">{sectors.join(" · ")}</p>
          <h1 className="mt-4 font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Randevu defteriniz <span className="marker">siz yokken de</span> doluyor.
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-muted">
            Sırada, salonunuzun WhatsApp&apos;ına gelen mesajlara cevap verir, boş saati bulur ve randevuyu deftere
            yazar. Gece de, bayramda da, eliniz boyadayken de.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-5">
            <a href="#pilot" className="btn">
              30 gün ücretsiz deneyin
            </a>
            <Link href="/demo" className="text-sm font-medium text-accent underline decoration-1 underline-offset-4">
              Müşteri gibi yazıp görün
            </Link>
          </div>
        </div>
        <div className="flex flex-col items-center gap-3 md:items-end">
          <div className="-rotate-1">
            <AppointmentCardView card={sample} actions={false} />
          </div>
          <p className="hand max-w-sm text-center text-xl md:text-right">
            ↑ salon kapandıktan sonra, 22:42&apos;de yazıldı
          </p>
        </div>
      </section>

      <section className="border-t border-border py-14">
        <h2 className="font-display text-3xl font-semibold tracking-tight">Cevapsız mesaj, kaçan müşteri</h2>
        <ol className="mt-8 grid gap-8 sm:grid-cols-3">
          {problems.map((p, i) => (
            <li key={p.title}>
              <span className="hand text-3xl">{i + 1}.</span>
              <h3 className="mt-1 text-lg font-semibold">{p.title}</h3>
              <p className="mt-2 text-muted">{p.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-10 border-t border-border py-14 md:grid-cols-[1fr_1.3fr]">
        <div>
          <h2 className="font-display text-3xl font-semibold tracking-tight">Bir randevu nasıl yazılır</h2>
          <p className="mt-4 max-w-sm text-muted">
            Müşteri uygulama indirmez, üye olmaz. Her zamanki gibi WhatsApp&apos;tan yazar; gerisini asistan deftere
            işler.
          </p>
        </div>
        <ol className="ruled overflow-hidden rounded-xl border border-border pt-[var(--line)] pb-[var(--line)] [--gutter:96px] [--line:36px]">
          {flow.map((f, i) => (
            <li key={i} className="flex leading-[var(--line)]">
              <span className="hand w-[var(--gutter)] shrink-0 pr-3 text-right text-2xl">{f.at}</span>
              <span className="pl-4 pr-4 text-[15px]">{f.text}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-border py-14">
        <h2 className="font-display text-3xl font-semibold tracking-tight">Neler yapar</h2>
        <dl className="mt-8 grid gap-x-12 sm:grid-cols-2">
          {features.map(([title, body]) => (
            <div key={title} className="border-b border-border py-4">
              <dt className="font-semibold">{title}</dt>
              <dd className="mt-1 text-muted">{body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="grid gap-10 border-t border-border py-14 md:grid-cols-2">
        <div>
          <h2 className="font-display text-3xl font-semibold tracking-tight">Hesabı basit</h2>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-muted">
            Ayda tek bir kaçan boya randevusunu ya da birkaç tıraşı kurtarması, kendini ödemesine yeter.
          </p>
        </div>
        <ul className="space-y-3 self-end text-[15px]">
          <li className="flex justify-between border-b border-border pb-3">
            <span>Kurulum</span>
            <span className="hand text-2xl leading-none">bizden</span>
          </li>
          <li className="flex justify-between border-b border-border pb-3">
            <span>İlk 30 gün</span>
            <span className="hand text-2xl leading-none">ücretsiz</span>
          </li>
          <li className="flex justify-between">
            <span>Taahhüt</span>
            <span className="hand text-2xl leading-none">yok</span>
          </li>
        </ul>
      </section>

      <section id="pilot" className="rounded-2xl border border-border bg-card p-6 sm:p-10">
        <p className="hand text-2xl">ilk salonlar</p>
        <h2 className="mt-1 font-display text-3xl font-semibold tracking-tight">Defterinizi bize verin</h2>
        <p className="mt-3 mb-8 max-w-lg text-muted">
          Sırada&apos;yı ilk salonlarla birlikte geliştiriyoruz. Bilgilerinizi bırakın, sizi arayalım; hizmet, fiyat ve
          çalışan bilgilerinizi biz girelim.
        </p>
        <WaitlistForm businessTypes={sectors} />
      </section>

      <footer className="mt-12 flex flex-wrap justify-between gap-2 text-[12px] text-muted">
        <span>Sırada bağımsız bir üründür. WhatsApp, Meta Platforms, Inc.&apos;in markasıdır.</span>
        <Link href="/gizlilik" className="underline">
          Gizlilik politikası
        </Link>
      </footer>
    </main>
  );
}
