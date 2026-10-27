import Link from "next/link";
import { AppointmentCardView } from "@/app/components/appointment-card";
import type { AppointmentCard } from "@/lib/calendar";
import { verticals } from "@/lib/verticals";
import { WaitlistForm } from "./waitlist-form";

// Tanıtım ve pilot başvurusu sayfası. Görsel dil: sıra fişi (krem kâğıt, siyah mürekkep,
// kırmızı vurgu, kesik çizgili ayraçlar).

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

// Bir randevunun baştan sona akışı; fişin arkasındaki kayıt gibi saatli.
const flow = [
  { at: "22:41", text: "Müşteri yazar: “Yarın akşam saç sakal için yer var mı?”" },
  { at: "22:41", text: "Asistan ustayı sorar. Mehmet Usta mı, Can mı, fark etmez mi?" },
  { at: "22:42", text: "Sadece Mehmet Usta'nın gerçekten boş saatlerini gösterir." },
  { at: "22:42", text: "Randevuyu yazar, müşteriye fişini gönderir. Panelinize düşer." },
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

// Ana sayfadaki örnek fiş. Gerçek bir randevu değil; düğmeleri gizli.
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
      <header className="flex items-center justify-between border-b-2 border-foreground py-4">
        <span className="font-display text-2xl font-bold uppercase tracking-wide">Sırada</span>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/demo" className="underline decoration-1 underline-offset-4">
            Canlı demo
          </Link>
          <Link href="/giris" className="text-muted">
            Giriş
          </Link>
        </nav>
      </header>

      <section className="grid items-center gap-12 py-12 sm:py-20 md:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted">{sectors.join(" · ")}</p>
          <h1 className="mt-4 font-display text-6xl font-bold uppercase leading-[0.9] tracking-tight sm:text-7xl">
            Siz yokken de <span className="text-accent">sıranız</span> işliyor.
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed">
            Sırada, salonunuzun WhatsApp&apos;ına gelen mesajlara cevap verir, boş saati bulur ve randevuyu
            deftere yazar. Gece de, bayramda da, eliniz boyadayken de.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-5">
            <a
              href="#pilot"
              className="btn"
            >
              30 gün ücretsiz deneyin
            </a>
            <Link href="/demo" className="text-sm font-medium underline decoration-1 underline-offset-4">
              Müşteri gibi yazıp görün →
            </Link>
          </div>
        </div>
        <div className="flex flex-col items-center gap-3 md:items-end">
          <div className="rotate-[1.5deg]">
            <AppointmentCardView card={sample} actions={false} />
          </div>
          <p className="max-w-sm text-center font-mono text-[11px] text-muted md:text-right">
            Örnek fiş: salon kapandıktan sonra, 22:42&apos;de kesildi.
          </p>
        </div>
      </section>

      <section className="border-t-2 border-foreground py-14">
        <h2 className="font-display text-4xl font-bold uppercase leading-none">Cevapsız mesaj, kaçan müşteri</h2>
        <ol className="mt-8 grid gap-8 sm:grid-cols-3">
          {problems.map((p, i) => (
            <li key={p.title}>
              <span className="font-mono text-sm text-accent">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-1 text-lg font-semibold">{p.title}</h3>
              <p className="mt-2 text-muted">{p.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-12 border-t-2 border-foreground py-14 md:grid-cols-2">
        <div>
          <h2 className="font-display text-4xl font-bold uppercase leading-none">Bir randevu nasıl yazılır</h2>
          <p className="mt-4 max-w-sm text-muted">
            Müşteri uygulama indirmez, üye olmaz. Her zamanki gibi WhatsApp&apos;tan yazar.
          </p>
        </div>
        <ol className="font-mono text-sm">
          {flow.map((f, i) => (
            <li key={i} className="flex gap-4 border-b border-dashed border-border py-3 first:pt-0">
              <span className="w-24 shrink-0 text-muted">{f.at}</span>
              <span className="font-sans">{f.text}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t-2 border-foreground py-14">
        <h2 className="font-display text-4xl font-bold uppercase leading-none">Neler yapar</h2>
        <dl className="mt-8 grid gap-x-12 sm:grid-cols-2">
          {features.map(([title, body]) => (
            <div key={title} className="border-b border-dashed border-border py-4">
              <dt className="font-semibold">{title}</dt>
              <dd className="mt-1 text-muted">{body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="grid gap-10 border-t-2 border-foreground py-14 md:grid-cols-2">
        <div>
          <h2 className="font-display text-4xl font-bold uppercase leading-none">Hesabı basit</h2>
          <p className="mt-4 max-w-md text-lg leading-relaxed">
            Ayda tek bir kaçan boya randevusunu ya da birkaç tıraşı kurtarması, kendini ödemesine yeter.
          </p>
        </div>
        <ul className="space-y-3 self-end font-mono text-sm">
          <li className="flex justify-between border-b border-dashed border-border pb-3">
            <span>Kurulum</span>
            <span>Bizden</span>
          </li>
          <li className="flex justify-between border-b border-dashed border-border pb-3">
            <span>İlk 30 gün</span>
            <span>Ücretsiz</span>
          </li>
          <li className="flex justify-between">
            <span>Taahhüt</span>
            <span>Yok</span>
          </li>
        </ul>
      </section>

      <section id="pilot" className="ticket rounded-lg border border-border bg-card p-6 sm:p-10">
        <div className="flex items-baseline justify-between font-mono text-[11px] uppercase tracking-widest text-muted">
          <span>Pilot başvurusu</span>
          <span>İlk salonlar</span>
        </div>
        <h2 className="mt-3 font-display text-4xl font-bold uppercase leading-none">Sıranızı alın</h2>
        <p className="mt-3 mb-8 max-w-lg text-muted">
          Sırada&apos;yı ilk salonlarla birlikte geliştiriyoruz. Bilgilerinizi bırakın, sizi arayalım; hizmet ve
          fiyatlarınızı biz girelim.
        </p>
        <WaitlistForm businessTypes={sectors} />
      </section>

      <footer className="mt-12 flex flex-wrap justify-between gap-2 font-mono text-[11px] text-muted">
        <span>Sırada bağımsız bir üründür. WhatsApp, Meta Platforms, Inc.&apos;in markasıdır.</span>
        <Link href="/gizlilik" className="underline">
          Gizlilik politikası
        </Link>
      </footer>
    </main>
  );
}
