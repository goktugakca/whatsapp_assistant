import Link from "next/link";
import { WaitlistForm } from "./waitlist-form";

// Doğrulama sayfası: kliniklere değer önerisini anlatır ve pilot başvurusu toplar.
const problems = [
  {
    title: "Gece gelen mesajlar kayboluyor",
    body: "Yurt dışındaki hasta gece 02:00'de yazıyor, sabah dönene kadar başka kliniğe geçmiş oluyor.",
  },
  {
    title: "Dil engeli",
    body: "İngilizce, Arapça, Almanca sorulara anında ve doğru yanıt verecek personel bulmak zor ve pahalı.",
  },
  {
    title: "Aynı sorular, her gün",
    body: "Fiyat, transfer, konaklama, tedavi süresi… Ekibiniz gününü kopyala-yapıştır ile geçiriyor.",
  },
];

const features = [
  "7/24 yanıt, ortalama birkaç saniye",
  "Türkçe, İngilizce, Arapça, Almanca",
  "Fiyat aralığı, transfer, konaklama gibi soruları sizin bilgilerinizle yanıtlar",
  "Hastanın tedavi, ülke ve tarih bilgisini toplayıp panelde özetler",
  "Uygun saatleri kontrol edip randevu oluşturur",
  "Emin olmadığında veya acil durumda konuşmayı anında ekibinize devreder",
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-20">
      <section className="max-w-3xl">
        <p className="mb-4 inline-block rounded-full border border-border px-3 py-1 text-xs font-medium text-muted">
          Diş ve estetik klinikleri için
        </p>
        <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          WhatsApp&apos;ınıza gelen hiçbir hasta cevapsız kalmasın.
        </h1>
        <p className="mt-5 text-lg text-muted">
          Klinik Asistan, hasta sorularını 7/24 ve dört dilde yanıtlayan, bilgilerini toplayan ve randevu oluşturan yapay
          zekâ resepsiyonistinizdir. Ekibiniz sadece hazır hastalarla ilgilenir.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="#pilot" className="rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground">
            Ücretsiz pilota başvur
          </a>
          <Link href="/demo" className="rounded-lg border border-border px-5 py-3 text-sm font-semibold">
            Canlı demoyu dene
          </Link>
        </div>
      </section>

      <section className="mt-20 grid gap-4 sm:grid-cols-3">
        {problems.map((p) => (
          <div key={p.title} className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-semibold">{p.title}</h2>
            <p className="mt-2 text-sm text-muted">{p.body}</p>
          </div>
        ))}
      </section>

      <section className="mt-20 grid gap-10 sm:grid-cols-2">
        <div>
          <h2 className="text-2xl font-bold">Ne yapar?</h2>
          <ul className="mt-5 space-y-3">
            {features.map((f) => (
              <li key={f} className="flex gap-3 text-sm">
                <span aria-hidden className="mt-0.5 text-accent">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-2xl font-bold">Basit hesap</h2>
          <p className="mt-4 text-sm text-muted">
            Bir implant veya kaplama hastası kliniğe ortalama binlerce euro kazandırır. Asistan ayda sadece bir ya da iki
            kaybolan hastayı geri kazandırsa bile kendini fazlasıyla öder.
          </p>
          <p className="mt-4 text-sm text-muted">
            Pilot süresince ücretsiz. Kurulumu ve klinik bilgilerinizin girilmesini biz yapıyoruz.
          </p>
        </div>
      </section>

      <section id="pilot" className="mt-20 rounded-2xl border border-border bg-card p-6 sm:p-10">
        <h2 className="text-2xl font-bold">Pilot programa katılın</h2>
        <p className="mt-2 mb-6 text-sm text-muted">
          İlk 10 klinikle birlikte geliştiriyoruz. Bilgilerinizi bırakın, sizi arayalım.
        </p>
        <WaitlistForm />
      </section>

      <footer className="mt-16 text-center text-xs text-muted">
        Klinik Asistan, tıbbi tavsiye vermez; tıbbi sorular ve acil durumlar her zaman klinik ekibine yönlendirilir.
      </footer>
    </main>
  );
}
