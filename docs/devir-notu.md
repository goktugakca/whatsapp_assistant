# Devir notu — 24 Kasım 2026

Bulut oturumundan yerel oturuma geçiş için. Ürün: **Sırada**, Türkiye'deki kuaför/berber/tırnak/klinik
işletmeleri için WhatsApp + Instagram yapay zekâ resepsiyonisti (Next.js 16, Neon Postgres, Anthropic SDK).
Kodun tamamı `main`'de; eksikler listesi `docs/eksikler.md`.

## Canlı ortam
- Yeni adres: **https://sirada.akcalabs.com** (Türkiye'den açılıyor). Eski `whatsapp-assistant-phi-ecru.vercel.app`
  Türkiye'de bazı ağlarda açılmıyor ama Meta webhook'ları için çalışmaya devam ediyor.
- Alan adı: akcalabs.com, DNS Cloudflare'de. `sirada` CNAME → Vercel'in verdiği adres (DNS only). Vercel projesi:
  `whatsapp-assistant`.
- `/api/health` tüm kontrolleri `true` döndürüyor (veritabanı, Anthropic, WhatsApp, Instagram, ayrı gizli anahtarlar).
- Panel girişi: kullanıcı adı `admin`, şifre Vercel'deki `PANEL_PASSWORD`.

## Hemen sıradaki iş: yeni alan adına geçişi tamamla
1. Vercel'de `APP_URL=https://sirada.akcalabs.com` tanımla ve redeploy et (randevu linkleri, Instagram OAuth dönüşü).
   ÖNCE Meta'da Instagram yönlendirme adresini ekle, yoksa "Instagram'ı bağla" bozulur.
2. Meta (Sırada Asistan uygulaması) adreslerini yeni alan adına çevir:
   - WhatsApp webhook: `https://sirada.akcalabs.com/api/whatsapp/webhook`
   - Instagram webhook: `https://sirada.akcalabs.com/api/instagram/webhook`
   - Instagram business login → redirect: `https://sirada.akcalabs.com/api/instagram/callback`,
     deauthorize: `/api/instagram/deauthorize`, data deletion: `/api/instagram/data-deletion`
   - Uygulama ayarlarındaki gizlilik politikası linki: `https://sirada.akcalabs.com/gizlilik`
   Verify token'lar aynı kalır.
3. Instagram'ı panelden bir kez yeniden bağla.
4. Kullanıcı kendi Instagram'ını (goktugakca) asistandan kaldırmak istiyor:
   instagram.com/accounts/manage_access → Aktif → Sırada Asistan-IG → Kaldır.

## Garage Ankara (pilot, `garage-ankara`)
- Panelde beşinci sekme; demoda görünmez. Fiyat listesi linkten içe aktarıldı.
- 165 ekran görüntüsü yüklendi → 285 üslup örneği, 13 fotoğraflı fiyat örneği (4 fiyatlı).
- Yapılacak:
  - Geçmiş yazışmalar → "Otomatik mesajları temizle" (salonun KVKK karşılama mesajı örneklere girmişti).
  - Eksik fiyatları elle gir; fiyat tablosu ve makyaj görselini hariç tut.
  - Ayarlar → fotoğraf fiyat modu: "Asistan ön fiyat versin" (liste kademeleri).
  - Ustalar, saatler, adres; bildirim numarası.
- Örneklerden fiyat modu için en az 10 (güvenilirlik için 30–50) fiyatlı örnek gerekiyor; sonra Fiyat sınavı.

## Sizin tarafınızda bekleyenler
- Meta şablon onayları: `randevu_hatirlatma`, `personel_bildirim` (`{{1}} sizi bekliyor: {{2}}`).
- Kalıcı WhatsApp System User token'ı (geçici token 24 saatte düşüyor).
- Instagram App Review (tester olmayan salonlar için).
- Vercel token'ı (30 gün) ve Cloudflare DNS token'ı (yalnızca akcalabs.com) alan adı kurulumu için verildi;
  bulut ortamında saklı. İş bitince Vercel ve Cloudflare'den silinebilir.

## Teknik notlar
- `CLAUDE.md` / `AGENTS.md`: Next.js 16, kod yazmadan önce `node_modules/next/dist/docs/`.
- Testler: `npx vitest run` (PGlite ile Postgres testleri dahil), `npx tsc --noEmit`, `npx eslint .`, `npx next build`.
- Commit sonu: `Co-Authored-By` satırı ve oturum linki; model adı kodda veya commit'te geçmez.
- Müşteri yazışmaları ve fotoğrafları sohbete değil, panele yüklenir; örnekler işletmeye özeldir, adlar/numaralar gizlenir.
