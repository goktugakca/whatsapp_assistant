# Sırada (whatsapp_assistant)

Randevuyla çalışan işletmelerin (kuaför, berber, tırnak salonu, güzellik merkezi, klinik) WhatsApp'ına gelen müşteri mesajlarını 7/24 yanıtlayan, boş saatleri çalışan bazında bulan, randevu oluşturan ve gerektiğinde konuşmayı işletmeye devreden yapay zekâ asistanı.

> Ürün adı "Sırada". Meta'nın marka kuralları gereği ürün adında "WhatsApp" kullanılmamalı.

## Ne var?

| Sayfa / uç | Ne işe yarar |
|---|---|
| `/` | İşletmelere yönelik tanıtım ve pilot başvuru formu (doğrulama için) |
| `/demo?isletme=demo-berber` | WhatsApp kurulumu olmadan asistanı tarayıcıda deneme; işletmelere demo göstermek için |
| `/panel?isletme=demo-berber` | İşletme paneli: konuşmalar, toplanan müşteri bilgisi, devredilen konuşmalar, randevular (çalışan bazında), personel yanıtı |
| `/panel/takvim?isletme=demo-berber` | Haftalık takvim (çalışan renkleriyle), elle randevu ekleme ve iptal, Google/Apple Takvim abonelik linki |
| `/panel/ayarlar?isletme=demo-berber` | Çalışma saatleri, hizmetler ve fiyatlar, çalışanlar, SSS ve kurallar |
| `/randevu/<id>` | Müşterinin randevu sayfası: Google Takvim, Apple/Outlook (.ics) ve yol tarifi bağlantıları. WhatsApp onay mesajında gönderilir |
| `POST /api/whatsapp/webhook` | Meta'dan gelen WhatsApp mesajları (imza doğrulamalı) |
| `POST /api/demo/chat` | Demo sohbetinin arka ucu |

### Örnek işletmeler (`lib/businesses/`)

| id | Tür | Özellik |
|---|---|---|
| `demo-kuafor` | Kuaför | 3 çalışan; her biri farklı hizmetleri yapıyor, biri farklı saatlerde çalışıyor |
| `demo-berber` | Berber | 2 usta, 15 dakikalık aralıklar |
| `demo-tirnak` | Tırnak salonu | 2 uzman, iptal kuralı |
| `demo-dis` | Diş kliniği | Çalışan seçimi yok (tek takvim), çok dilli, tıbbi güvenlik kuralları |

**İşletme ayarları panelden düzenlenir** (`/panel/ayarlar`): genel bilgiler, çalışma saatleri, hizmetler ve fiyatlar, çalışanlar (yaptıkları hizmetler, kendi saatleri), sık sorulan sorular ve kurallar. Kaydedilen ayar `business_settings` tablosuna yazılır ve asistan bir sonraki mesajdan itibaren onu kullanır; tutarsız ayarlar (kapanış açılıştan önce, olmayan hizmete atanmış çalışan vb.) `lib/business-schema.ts` tarafından reddedilir. `lib/businesses/` altındaki dosyalar sadece başlangıç değeridir. Yeni bir işletme eklemek için oraya bir dosya ekleyip `lib/business.ts` içindeki `businesses` listesine koymak yeterli. Sektöre özel davranışlar (örneğin klinikte tıbbi tavsiye vermemek, tırnakta mevcut protezi sormak) `lib/verticals.ts` dosyasında tanımlı; işletme tipini seçince otomatik geliyor.

### Asistanın araçları (`lib/agent/tools.ts`)

- `check_availability`: İşletmenin ve çalışanların saatlerine, mevcut randevulara ve hizmeti kimin yapabildiğine göre boş saatleri ve o saatte müsait çalışanları verir.
- `book_appointment`: Sadece gerçekten boş olan bir saate randevu yazar; model saat uyduramaz. Çalışan tercihi yoksa müsait olan birine atar.
- `save_lead`: Müşterinin adını, dilini, istediği hizmeti ve ne zaman gelmek istediğini panele kaydeder.
- `show_options`: Boş saatleri, hizmetleri veya çalışanları tıklanabilir düğme olarak sunar. Demoda düğme, WhatsApp'ta etkileşimli mesaj olur (3'e kadar kısa seçenek düğme, fazlası liste).
- `reschedule_appointment`: Randevuyu yeni saate ve/veya başka çalışana taşır; eski saat boşalır.
- `handoff_to_human`: Konuşmayı işletmeye devreder; asistan o müşteriye artık otomatik yanıt vermez.
- `block_customer`: Küfür, taciz veya ısrarla uygunsuz istek yazan müşteriyi engeller; sonraki mesajları panelde görünür ama yanıtlanmaz. İşletme engeli panelden kaldırabilir.

Model hata verirse veya yanıtlamayı reddederse, müşteriye güvenli bir "size döneceğiz" mesajı gider ve konuşma işletmeye devredilir.

## Kurulum

```bash
npm install
cp .env.example .env.local   # değerleri doldurun
npm run dev                  # http://localhost:3000
```

Sadece demo için `ANTHROPIC_API_KEY` yeterli; `DATABASE_URL` yoksa veriler bellekte tutulur. Panel geliştirme ortamında parolasız açılır; production'da `PANEL_PASSWORD` zorunlu.

### Veritabanı

Proje Neon'a bağlı (`neon.ts`; proje kimliği gitignore'daki `.neon` dosyasında).

```bash
npm i -g neon@latest
neon login           # tarayıcıyla giriş
neon deploy          # neon.ts'i uygular, DATABASE_URL ve DATABASE_URL_UNPOOLED'ı .env.local'a çeker
npm run db:migrate   # şemayı uygular (havuzsuz DATABASE_URL_UNPOOLED ile); tekrar çalıştırmak güvenli
```

- Uygulama havuzlu `DATABASE_URL`'i (`-pooler`) `node-postgres` ile kullanır; Vercel'de `attachDatabasePool` ile Fluid compute'a bağlanır.
- Şema: `lib/db/schema.sql`. `btree_gist` eklentisi gerekir (Neon'da var).
- Neon dışında herhangi bir Postgres 13+ ile de çalışır; sadece `DATABASE_URL` vermek yeterli.

```bash
npm test           # birim testleri (vitest)
npm run typecheck
npm run lint
npm run build
```

## Vercel'e yayınlama

1. [vercel.com](https://vercel.com)'da GitHub ile giriş yapın → **Add New… → Project** → `whatsapp_assistant` reposunu **Import** edin. Framework otomatik olarak Next.js seçilir; başka ayar gerekmez.
2. **Environment Variables** bölümüne ekleyin:
   - `DATABASE_URL` (Neon, `-pooler` içeren adres)
   - `DATABASE_URL_UNPOOLED` (Neon, `-pooler` içermeyen adres)
   - `ANTHROPIC_API_KEY`
   - `PANEL_PASSWORD` (panel bu olmadan production'da açılmaz)
   - WhatsApp bağlanınca: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_BUSINESS_ID`
3. **Deploy**. Her yayında `vercel-build` önce şemayı veritabanına uygular (`scripts/migrate.mjs`), sonra uygulamayı derler. Şema uygulanamazsa yayın durur; eski sürüm çalışmaya devam eder.
4. Kontrol: `https://<adres>/api/health` → `{"database":"ok","anthropic":true,...}` görmelisiniz. `database: "error"` ise `databaseError` alanındaki koda bakın.

Fonksiyonlar Frankfurt'ta (`fra1`, `vercel.json`) çalışır; Neon veritabanı da aynı bölgede olmalı.

## WhatsApp bağlantısı (Cloud API)

1. [Meta for Developers](https://developers.facebook.com/)'ta bir uygulama oluşturun, WhatsApp ürününü ekleyin.
2. API Setup sayfasından `WHATSAPP_PHONE_NUMBER_ID` ve erişim anahtarını alın. Kalıcı kullanım için System User ile süresiz bir anahtar oluşturun (`WHATSAPP_ACCESS_TOKEN`).
3. Uygulama ayarlarından App Secret'ı alın (`WHATSAPP_APP_SECRET`).
4. Numaranın hangi işletmeye bağlı olduğunu `WHATSAPP_BUSINESS_ID` ile seçin (ör. `demo-berber`).
5. Uygulamayı HTTPS bir adrese yayınlayın (ör. Vercel). Webhook adresi: `https://<alan-adınız>/api/whatsapp/webhook`, doğrulama anahtarı: `WHATSAPP_VERIFY_TOKEN`.
6. Webhook alanlarından `messages`'a abone olun.
7. Test numaranızdan WhatsApp mesajı atın; yanıt gelmeli ve konuşma `/panel`'de görünmeli.

Notlar:
- Müşterinin başlattığı konuşmalarda 24 saat içinde serbest metinle yanıt verilebilir ve bu mesajlar ücretsizdir. 24 saat sonra yazmak (hatırlatma vb.) onaylı şablon mesaj gerektirir; henüz yok.
- Meta'nın Ocak 2026 kuralı genel amaçlı sohbet robotlarını yasaklıyor. Bu ürün işletmeye özel müşteri hizmeti olduğu için kapsam dışında, ama asistanı her zaman işletmenin konularına bağlı tutun.
- Birden fazla işletmeyi gerçek numaralarla bağlamak için her işletmeye `whatsappPhoneNumberId` alanı girilebilir.

## Instagram bağlantısı

Aynı asistan Instagram mesajlarına da yanıt verir; konuşmalar panelde WhatsApp'takilerle birlikte görünür.
Kurulum (Instagram API with Instagram Login; Facebook sayfası gerekmez):

1. Meta uygulamanıza **Instagram** ürününü ekleyin, "API setup with Instagram login" bölümünden Instagram app ID ve
   app secret'ı alın (`INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`). Bunlar WhatsApp'ın app ID/secret'ından farklıdır.
2. Business login settings'e OAuth dönüş adresini yazın: `https://<alan-adınız>/api/instagram/callback`.
   Deauthorize: `/api/instagram/deauthorize`, veri silme: `/api/instagram/data-deletion`.
3. Webhook adresi `https://<alan-adınız>/api/instagram/webhook`, doğrulama metni `INSTAGRAM_VERIFY_TOKEN`
   (yoksa `WHATSAPP_VERIFY_TOKEN`); `messages` alanına abone olun.
4. İşletme sahibi panelde **Ayarlar → Instagram mesajları → Instagram'ı bağla** ile kendi hesabıyla giriş yapar.
   Hesap işletme veya içerik üretici hesabı olmalı ve ayarlarda "Mesajlara erişime izin ver" açık olmalı.
5. Uygulama yayında değilken sadece uygulamaya "Instagram tester" olarak eklenen hesaplar bağlanabilir; başka
   salonlar için `instagram_business_manage_messages` izninin App Review'dan geçmesi ve işletme doğrulaması gerekir.

Erişim anahtarı 60 gün geçerlidir; günlük görev (`/api/cron/reminders`) bitimine iki hafta kala yeniler.
Anahtar veritabanında `INSTAGRAM_TOKEN_KEY` ile şifreli durur. Hesap bağlantısı panelden veya Instagram
ayarlarından kaldırılınca silinir. Hızlı yanıt düğmeleri (en fazla 13), fotoğraf alma ve 1000 karakter sınırı
için bölme desteklenir; hatırlatma şablonu yalnızca WhatsApp'ta vardır.

## Mimari ve bilinen sınırlar

- **Veri katmanı** (`lib/store.ts`): `DATABASE_URL` varsa Postgres (`lib/store-postgres.ts`), yoksa bellek. İki uygulama da aynı testlerden geçer (`tests/store.test.ts`; Postgres testleri gömülü PGlite ile, sunucu gerekmeden koşar).
- **Çakışan randevu imkânsız:** Kontrol ve kayıt tek adımda yapılır. Postgres'te aynı işletme + çalışan için eklemeler kısa bir kilitle sıraya girer, ayrıca bir `EXCLUDE` kısıtı zaman aralığı çakışan iki kaydı veritabanı seviyesinde reddeder. Gerçek Postgres 16'da, aynı saate 10'ar eşzamanlı istekle denendi: her saate tam olarak usta sayısı kadar randevu yazıldı.
- **Konuşma kilidi:** Aynı müşterinin mesajları, personel yanıtları ve asistan turları konuşma başına bir kilitle sıraya girer (Postgres işlem seviyesinde advisory lock; PgBouncer transaction modunda da doğru çalışır). Birden fazla sunucuda da birbirini ezmez. Kilit, asistan turu süresince bir veritabanı bağlantısını açık bir işlemde tutar; veritabanında `idle_in_transaction_session_timeout` en az 2 dakika olmalı.
- **Mesaj tekrar kontrolü** veritabanında (`processed_messages`).
- **İşletmeler kodda tanımlı.** Yeni işletme `lib/businesses/` altına dosya olarak eklenir; ayarları sonra panelden düzenlenir. Panelden yeni işletme oluşturma henüz yok.
- **Takvim dahili.** Google Takvim entegrasyonu yol haritasında. Çalışanların izin günleri ve öğle arası henüz yok.
- **Sadece metin.** Sesli mesaj ve görseller şimdilik okunmuyor; asistana kısa bir not olarak iletiliyor. Kuaför ve berber müşterileri sık sesli mesaj attığı için bu, yol haritasında öne alınmalı.
- Model: varsayılan `claude-haiku-5-5` (hızlı ve ucuz), `low` efor. `ANTHROPIC_MODEL` ile değiştirilebilir (ör. `claude-sonnet-5-5`); Opus, Sonnet ve Fable modellerinde reddedilen isteklerde sunucu tarafı yedek model (`fallbacks: "default"`) otomatik açılır. Vercel loglarında her yanıtın süresi `asistan: ...ms` satırında görünür.

## Fiyat listesini fotoğraftan alma

Ayarlar → Hizmetler ve fiyatlar bölümünde işletme sahibi tabela, menü veya fiyat listesinin fotoğrafını (en fazla 5) yükler. Fotoğraflar tarayıcıda küçültülür, `ANTHROPIC_IMPORT_MODEL` (varsayılan `claude-opus-5-5`) hizmetleri, fiyatları ve tahmini süreleri çıkarır. Sonuç forma eklenir ve kaydedilmeden önce kontrol edilir:

- Aynı hizmet (aynı ad ya da sektör sözlüğüne göre farklı adla aynı işlem) yeni kayıt açmaz, mevcut hizmetin fiyatı güncellenir.
- Süresi listede yazmayan hizmetlerin süresi tahminidir ve sarıyla işaretlenir.
- "Mevcut hizmetleri bu listeyle değiştir" seçilirse listede olmayan hizmetler çıkarılır.

Sektör sözlüğü (`lib/glossary.ts`), müşterilerin aynı işlem için kullandığı farklı adları (ombre/balyaj, brezilya fönü/keratin, skin fade, jel tırnak…) içerir ve asistanın istemine de eklenir.

## Geçmiş sohbetlerden fiyat örnekleri ve fotoğrafla fiyat

Panel → **Fotoğrafla fiyat örnekleri** (`/panel/ornekler`). Salon, WhatsApp'ta her sohbeti
"Sohbeti dışa aktar → Medyayı dahil et" ile zip olarak alır ve hepsini birden yükler.
Zipler tarayıcıda açılır (`lib/whatsapp-export.ts`); sunucuya sadece müşterinin fotoğrafı,
yanında yazdığı metin ve salonun fiyatlı cevabı gider. Gönderen adları tutulmaz, metinlerdeki
müşteri adı, telefon ve e-posta silinir. Fiyatı okunamayan örnekler listede işaretlenir, salon
elle yazar. Aynı fotoğraf ikinci kez eklenmez. Örnekler sadece o işletmenin kaydında durur.

Örnekler modele "eğitim" olarak değil, soru anında referans olarak verilir (`lib/photo-quote.ts`):
müşteri fotoğrafla fiyat sorduğunda asistan `quote_from_photo` aracını çağırır; araç soruya en yakın
12 örneği (fotoğraf + ustanın verdiği fiyat) ve müşterinin fotoğrafını `ANTHROPIC_PHOTO_MODEL`
(varsayılan `claude-opus-5-5`) ile karşılaştırıp aralık döndürür. Benzer örnek yoksa veya emin
değilse fiyat vermez, fotoğraf ustaya gider. Bu mod Ayarlar → "Müşteri fotoğraf gönderip fiyat
sorarsa" → "geçmiş örneklerinize göre" ile açılır; en az 10 fiyatlı örnek gerekir.

**Fiyat sınavı** (`/panel/ornekler/sinav`): açmadan önce tutarlılığı ölçmek için. Örneklerin dörtte
biri (en çok 30) ayrılır, asistan kalanlara bakarak onlara fiyat verir; ustanın gerçek fiyatıyla
%15 payla karşılaştırılır. İsabet, yanlış ve "size iletirdi" sayıları hizmete göre dökülür, her örnek
tek tek görülür. Sonuç `photo_quote_evals` tablosunda saklanır.

## Tanıtım filmi

`video/` klasöründe Remotion ile kodla üretilen 28 saniyelik dikey (1080×1920) tanıtım filmi var; ana uygulamadan bağımsızdır.

```bash
cd video && npm install
npm run studio   # tarayıcıda önizleme ve düzenleme
npm run render   # out/sirada-reklam.mp4
```

Metinler ve zamanlamalar `video/src/Reklam.tsx` içinde. Yazı tipleri `video/public/fonts` altında, böylece internet olmadan da aynı görüntü çıkar.

## Panel girişi

- `/giris` sayfasından girilir. **Yönetici:** kullanıcı adı `admin`, şifre `PANEL_PASSWORD`. Tüm işletmeleri görür, **Kullanıcılar** sayfasından işletme kullanıcısı oluşturur ve siler.
- **İşletme kullanıcısı** sadece kendi işletmesinin panelini, takvimini ve ayarlarını görür; adres çubuğunda başka işletme yazsa bile kendi işletmesi açılır, işlemler sunucuda reddedilir (`lib/dal.ts`).
- Şifreler `scrypt` ile özetlenip saklanır (`lib/password.ts`). Oturum 7 gün geçerli, imzalı bir çerezdir (`lib/session.ts`); imza anahtarı `SESSION_SECRET` (yoksa `PANEL_PASSWORD`). Anahtar değişirse herkesin oturumu kapanır. Silinen kullanıcının açık oturumu hemen geçersiz olur.
- Geliştirme ortamında `PANEL_PASSWORD` tanımlı değilse panel girişsiz açılır.

## Randevu hatırlatmaları

Her gün 18:00'de (İstanbul, `vercel.json` → `crons`) ertesi günün randevusu olan müşterilere WhatsApp'tan hatırlatma gider (`lib/reminders.ts`). Aynı kişiye iki kez gitmez; gönderim başarısız olursa sonraki çalıştırmada tekrar denenir. Hatırlatma müşterinin konuşmasına da yazılır, müşteri "iptal" diye yanıt verirse asistan randevuyu bulup iptal edebilir.

WhatsApp, son 24 saatte yazmamış bir müşteriye sadece **Meta'nın onayladığı şablonla** yazmaya izin verir. Kurulum:

1. Meta Business Manager → WhatsApp Manager → **Message templates → Create template**. Kategori **Utility**, dil **Turkish**, ad örneğin `randevu_hatirlatma`. Gövde:
   ```
   Merhaba {{1}}, yarın {{3}} için {{2}} randevunuzu hatırlatırız. Görüşmek üzere, {{4}}.
   Değişiklik veya iptal için bu mesaja yanıt verebilirsiniz.
   ```
   Örnek değerler: `Ali`, `Saç kesimi`, `27 Ekim Salı 10:00`, `Ustura Berber`.
2. Onaylanınca Vercel'e: `WHATSAPP_REMINDER_TEMPLATE=randevu_hatirlatma` (dil kodu farklıysa `WHATSAPP_REMINDER_LANGUAGE`, varsayılan `tr`).
3. Vercel'e `CRON_SECRET` ekleyin (rastgele uzun bir metin); Vercel cron isteklerine bunu kendisi ekler.

Hatırlatma sadece telefon numarası olan randevulara gider: WhatsApp'tan alınan randevular ve panelden telefonla girilenler. Demo randevuları atlanır. Panel takviminde gönderilenler "🔔 hatırlatıldı" ile görünür.

## Devredilen konuşma bildirimi

Ayarlar → Genel bilgiler → "haber verilecek WhatsApp numarası". Asistan bir konuşmayı personele
bıraktığında bu numaraya kısa bir WhatsApp mesajı gider (`lib/notify.ts`). Meta'da onaylı bir
şablon varsa (`WHATSAPP_HANDOFF_TEMPLATE`, gövde: `{{1}} sizi bekliyor: {{2}}`) her zaman ulaşır;
yoksa serbest metin denenir ve ancak sahibi son 24 saatte işletme numarasına yazdıysa teslim edilir.

## Google Takvim

- **Şimdi:** Panel takviminde işletmeye özel bir abonelik linki var (`/api/takvim/<işletme>/<anahtar>.ics`). Google Takvim'e "URL ile" eklenince randevular görünür. Tek yönlüdür ve Google bu linki birkaç saatte bir yeniler. Anahtar `PANEL_PASSWORD`'den (veya `CALENDAR_FEED_SECRET`'tan) türetilir; şifre değişince link de değişir.
- **Müşteri tarafı:** Her randevu için "Google Takvim'e ekle" bağlantısı ve `.ics` dosyası; entegrasyon gerektirmez.
- **Sonra (pilot işletmelerle):** İki yönlü Google Calendar API entegrasyonu: randevular anında işletmenin takvimine yazılır, takvimdeki dolu saatler asistana kapalı görünür. Google Cloud projesi, OAuth onay ekranı ve Google'ın uygulama doğrulaması gerekir.

## Yol haritası

1. Panelden yeni işletme oluşturma (kayıt akışı)
2. Sesli mesajı metne çevirme
3. Çalışan izin günleri ve tatiller
4. İki yönlü Google Takvim entegrasyonu
5. Raporlama: yanıt süresi, randevuya dönüşüm, mesai dışı gelen talepler

Doğrulama planı ve işletme görüşme kiti: [`docs/dogrulama-kiti.md`](docs/dogrulama-kiti.md).
