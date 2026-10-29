import { disconnectInstagram } from "../actions";
import type { InstagramAccount } from "@/lib/store";

const dateFmt = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", year: "numeric" });

const RESULTS: Record<string, { ok: boolean; text: string }> = {
  bagli: { ok: true, text: "Instagram hesabı bağlandı. Gelen mesajlara artık asistan yanıt verir." },
  iptal: { ok: false, text: "Bağlantı tamamlanmadı: Instagram'da izin verilmedi." },
  hata: { ok: false, text: "Bağlantı kurulamadı. Tekrar deneyin; sorun sürerse bize yazın." },
  "ayar-yok": { ok: false, text: "Instagram bağlantısı bu kurulumda henüz açık değil." },
};

// Ayarlar sayfasında Instagram bölümü: bağla / bağlı hesap / bağlantıyı kaldır.
export function InstagramSection({
  businessId,
  account,
  configured,
  result,
  now,
}: {
  businessId: string;
  account?: InstagramAccount;
  configured: boolean;
  result?: string;
  now: number;
}) {
  const message = result ? RESULTS[result] : undefined;
  const daysLeft = account ? Math.floor((Date.parse(account.tokenExpiresAt) - now) / 86_400_000) : 0;
  return (
    <section id="instagram" className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <h2 className="font-display text-xl font-semibold">Instagram mesajları</h2>
      <p className="mt-1 text-sm text-muted">
        Instagram&apos;daki işletme hesabınıza gelen mesajlara da aynı asistan yanıt verir; konuşmalar panelde
        WhatsApp&apos;takilerle birlikte görünür.
      </p>
      {message && (
        <p role="status" className={`mt-3 text-sm ${message.ok ? "text-ok" : "text-danger"}`}>
          {message.text}
        </p>
      )}
      {account ? (
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="text-sm">
            <p>
              Bağlı hesap: <b>{account.username ? `@${account.username}` : account.accountId}</b>
            </p>
            <p className="text-xs text-muted">
              Bağlandı: {dateFmt.format(new Date(account.connectedAt))}
              {daysLeft <= 0 ? (
                <span className="text-danger"> · Erişim süresi doldu, yeniden bağlayın.</span>
              ) : daysLeft <= 7 ? (
                <span className="text-accent"> · Erişim {daysLeft} gün içinde yenilenecek.</span>
              ) : null}
            </p>
          </div>
          <a href={`/api/instagram/connect?isletme=${businessId}`} className="btn btn-line btn-sm">
            Yeniden bağla
          </a>
          <form action={disconnectInstagram}>
            <input type="hidden" name="businessId" value={businessId} />
            <button className="text-sm text-danger hover:underline">Bağlantıyı kaldır</button>
          </form>
        </div>
      ) : configured ? (
        <div className="mt-4">
          <a href={`/api/instagram/connect?isletme=${businessId}`} className="btn">
            Instagram&apos;ı bağla
          </a>
          <p className="mt-2 text-xs text-muted">
            Instagram&apos;da işletme (veya içerik üretici) hesabıyla giriş yapmanız istenir. Hesap ayarlarında
            &ldquo;Mesajlara erişime izin ver&rdquo; açık olmalıdır.
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">Instagram bağlantısı bu kurulumda henüz açık değil.</p>
      )}
    </section>
  );
}
