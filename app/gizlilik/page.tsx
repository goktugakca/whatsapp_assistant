import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Gizlilik politikası · Sırada",
  description: "Sırada WhatsApp randevu asistanının hangi verileri neden işlediği ve verilerin nasıl silindiği.",
};

// Meta, uygulamayı yayınlamak için herkese açık bir gizlilik politikası ve veri silme
// talimatı ister; ikisi de bu sayfada (#veri-silme).
const contactEmail = process.env.CONTACT_EMAIL;

function Contact() {
  return contactEmail ? (
    <a href={`mailto:${contactEmail}`} className="underline">
      {contactEmail}
    </a>
  ) : (
    <Link href="/#pilot" className="underline">
      ana sayfadaki iletişim formu
    </Link>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <Link href="/" className="text-sm text-muted">
        ← Sırada
      </Link>
      <h1 className="mt-4 text-3xl font-bold">Gizlilik politikası</h1>
      <p className="mt-2 text-sm text-muted">Son güncelleme: 27 Ekim 2026</p>

      <div className="mt-8 space-y-8 text-sm leading-6">
        <section>
          <p>
            Sırada, işletmelerin (kuaför, berber, tırnak salonu, klinik vb.) WhatsApp hattına gelen mesajları
            yanıtlayan ve randevu oluşturan bir yapay zekâ asistanıdır. Bu metin, asistanla yazışan müşterilerin ve
            paneli kullanan işletmelerin verilerinin nasıl işlendiğini açıklar. Müşteri verileri bakımından veri
            sorumlusu ilgili işletmedir; Sırada bu verileri işletme adına işler.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">İşlenen veriler</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>WhatsApp telefon numarası ve WhatsApp profil adı</li>
            <li>Asistana gönderilen mesajların içeriği ve asistanın yanıtları</li>
            <li>Randevu bilgileri: ad, hizmet, çalışan, tarih ve saat</li>
            <li>Pilot başvuru formunda bırakılan işletme adı, ad, telefon ve şehir</li>
            <li>Panel kullanıcılarının kullanıcı adı ve şifrenin geri döndürülemez özeti (şifrenin kendisi saklanmaz)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Kullanım amacı</h2>
          <p className="mt-2">
            Veriler yalnızca müşterinin sorularını yanıtlamak, randevu oluşturmak, değiştirmek veya iptal etmek,
            randevudan önce hatırlatma göndermek ve gerektiğinde konuşmayı işletme çalışanına devretmek için
            kullanılır. Reklam, profilleme veya üçüncü kişilere satış amacıyla kullanılmaz.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Hizmet sağlayıcılar</h2>
          <p className="mt-2">Hizmeti sunmak için aşağıdaki sağlayıcılar kullanılır:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Meta Platforms (WhatsApp Business Platform): mesajların iletilmesi</li>
            <li>Anthropic (Claude): mesajlara yanıt üretilmesi</li>
            <li>Vercel: uygulamanın barındırılması</li>
            <li>Neon: veritabanı</li>
          </ul>
          <p className="mt-2">
            Bu sağlayıcıların sunucuları yurt dışında bulunabilir; veriler yalnızca yukarıdaki amaçlar için aktarılır.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Saklama süresi</h2>
          <p className="mt-2">
            Konuşma ve randevu kayıtları, işletme hizmeti kullandığı sürece ya da silme talebi gelene kadar saklanır.
            İşletme hizmetten ayrıldığında ilgili veriler silinir.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Haklarınız</h2>
          <p className="mt-2">
            6698 sayılı KVKK kapsamında verilerinize erişme, düzeltilmesini veya silinmesini isteme ve işlenmesine
            itiraz etme hakkınız vardır. Talepleriniz için: <Contact />.
          </p>
        </section>

        <section id="veri-silme">
          <h2 className="text-lg font-semibold">Veri silme talimatı</h2>
          <p className="mt-2">
            Konuşmalarınızın ve randevularınızın silinmesini istiyorsanız, yazıştığınız WhatsApp numarasını ve
            işletmenin adını belirterek <Contact /> üzerinden bize ulaşın. Talebiniz en geç 30 gün içinde yerine
            getirilir ve size bilgi verilir.
          </p>
        </section>
      </div>
    </main>
  );
}
