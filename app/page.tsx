import Link from "next/link";
import { verticals } from "@/lib/verticals";
import { WaitlistForm } from "./waitlist-form";

// Doğrulama sayfası: işletmelere değer önerisini anlatır ve pilot başvurusu toplar.
const problems = [
  {
    title: "Eliniz doluyken gelen mesajlar",
    body: "Müşteri koltuktayken telefona bakamıyorsunuz. Yazan kişi cevap alamayınca başka salona geçiyor.",
  },
  {
    title: "Kapalıyken gelen talepler",
    body: "Randevu isteklerinin önemli kısmı akşam, gece ve kapalı günlerde geliyor; sabah dönene kadar iş kaçıyor.",
  },
  {
    title: "Aynı sorular, her gün",
    body: "Fiyat ne kadar, yarın yer var mı, adres nerede, kim müsait… Gününüz kopyala-yapıştır ile geçiyor.",
  },
];

const features = [
  "Müşteri sadece WhatsApp'tan yazar; uygulama indirmesi veya üye olması gerekmez",
  "Fiyat, adres, çalışma saati gibi soruları sizin bilgilerinizle anında yanıtlar",
  "Hangi çalışanın ne zaman boş olduğunu bilir, müşteri isterse belirli ustaya randevu verir",
  "Randevuyu oluşturur ve panelinize düşürür",
  "Türkçe'nin yanında İngilizce ve diğer dillerde de yanıt verir",
  "Emin olmadığında veya müşteri isterse konuşmayı size devreder",
];

const sectors = Object.values(verticals).map((v) => v.label);

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-20">
      <section className="max-w-3xl">
        <div className="mb-4 flex flex-wrap gap-2">
          {sectors.map((s) => (
            <span key={s} className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted">
              {s}
            </span>
          ))}
        </div>
        <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Siz işinize bakın, randevuları WhatsApp&apos;ta asistanınız alsın.
        </h1>
        <p className="mt-5 text-lg text-muted">
          Randevu Asistanı, WhatsApp&apos;ınıza gelen mesajları 7/24 yanıtlar, müşterinin istediği hizmet ve çalışana göre
          boş saatleri bulur ve randevuyu oluşturur. Kuaför, berber, tırnak salonu, güzellik merkezi ve klinikler için.
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
            Cevapsız kalan her mesaj, kaçan bir randevu demek. Haftada birkaç kaçan müşteriyi geri kazanmak bile
            asistanın maliyetini fazlasıyla karşılar.
          </p>
          <p className="mt-4 text-sm text-muted">
            Pilot süresince ücretsiz. Hizmet, fiyat ve çalışan bilgilerinizin girilmesini biz yapıyoruz.
          </p>
        </div>
      </section>

      <section id="pilot" className="mt-20 rounded-2xl border border-border bg-card p-6 sm:p-10">
        <h2 className="text-2xl font-bold">Pilot programa katılın</h2>
        <p className="mt-2 mb-6 text-sm text-muted">
          İlk işletmelerle birlikte geliştiriyoruz. Bilgilerinizi bırakın, sizi arayalım.
        </p>
        <WaitlistForm businessTypes={sectors} />
      </section>

      <footer className="mt-16 text-center text-xs text-muted">
        Randevu Asistanı bağımsız bir üründür; WhatsApp, Meta Platforms, Inc.&apos;in markasıdır.
      </footer>
    </main>
  );
}
