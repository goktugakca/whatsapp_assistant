# Randevu Asistanı (whatsapp_assistant)

Randevuyla çalışan işletmelerin (kuaför, berber, tırnak salonu, güzellik merkezi, klinik) WhatsApp'ına gelen müşteri mesajlarını 7/24 yanıtlayan, boş saatleri çalışan bazında bulan, randevu oluşturan ve gerektiğinde konuşmayı işletmeye devreden yapay zekâ asistanı.

> "Randevu Asistanı" çalışma adıdır. Meta'nın marka kuralları gereği ürün adında "WhatsApp" kullanılmamalı.

## Ne var?

| Sayfa / uç | Ne işe yarar |
|---|---|
| `/` | İşletmelere yönelik tanıtım ve pilot başvuru formu (doğrulama için) |
| `/demo?isletme=demo-berber` | WhatsApp kurulumu olmadan asistanı tarayıcıda deneme; işletmelere demo göstermek için |
| `/panel?isletme=demo-berber` | İşletme paneli: konuşmalar, toplanan müşteri bilgisi, devredilen konuşmalar, randevular (çalışan bazında), personel yanıtı |
| `POST /api/whatsapp/webhook` | Meta'dan gelen WhatsApp mesajları (imza doğrulamalı) |
| `POST /api/demo/chat` | Demo sohbetinin arka ucu |

### Örnek işletmeler (`lib/businesses/`)

| id | Tür | Özellik |
|---|---|---|
| `demo-kuafor` | Kuaför | 3 çalışan; her biri farklı hizmetleri yapıyor, biri farklı saatlerde çalışıyor |
| `demo-berber` | Berber | 2 usta, 15 dakikalık aralıklar |
| `demo-tirnak` | Tırnak salonu | 2 uzman, iptal kuralı |
| `demo-dis` | Diş kliniği | Çalışan seçimi yok (tek takvim), çok dilli, tıbbi güvenlik kuralları |

Yeni bir işletme eklemek için `lib/businesses/` altına bir dosya ekleyip `lib/business.ts` içindeki `businesses` listesine koymak yeterli. Sektöre özel davranışlar (örneğin klinikte tıbbi tavsiye vermemek, tırnakta mevcut protezi sormak) `lib/verticals.ts` dosyasında tanımlı; işletme tipini seçince otomatik geliyor.

### Asistanın araçları (`lib/agent/tools.ts`)

- `check_availability`: İşletmenin ve çalışanların saatlerine, mevcut randevulara ve hizmeti kimin yapabildiğine göre boş saatleri ve o saatte müsait çalışanları verir.
- `book_appointment`: Sadece gerçekten boş olan bir saate randevu yazar; model saat uyduramaz. Çalışan tercihi yoksa müsait olan birine atar.
- `save_lead`: Müşterinin adını, dilini, istediği hizmeti ve ne zaman gelmek istediğini panele kaydeder.
- `handoff_to_human`: Konuşmayı işletmeye devreder; asistan o müşteriye artık otomatik yanıt vermez.

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

## Mimari ve bilinen sınırlar

- **Veri katmanı** (`lib/store.ts`): `DATABASE_URL` varsa Postgres (`lib/store-postgres.ts`), yoksa bellek. İki uygulama da aynı testlerden geçer (`tests/store.test.ts`; Postgres testleri gömülü PGlite ile, sunucu gerekmeden koşar).
- **Çakışan randevu imkânsız:** Kontrol ve kayıt tek adımda yapılır. Postgres'te aynı işletme + çalışan için eklemeler kısa bir kilitle sıraya girer, ayrıca bir `EXCLUDE` kısıtı zaman aralığı çakışan iki kaydı veritabanı seviyesinde reddeder. Gerçek Postgres 16'da, aynı saate 10'ar eşzamanlı istekle denendi: her saate tam olarak usta sayısı kadar randevu yazıldı.
- **Konuşma kilidi:** Aynı müşterinin mesajları, personel yanıtları ve asistan turları konuşma başına bir kilitle sıraya girer (Postgres işlem seviyesinde advisory lock; PgBouncer transaction modunda da doğru çalışır). Birden fazla sunucuda da birbirini ezmez. Kilit, asistan turu süresince bir veritabanı bağlantısını açık bir işlemde tutar; veritabanında `idle_in_transaction_session_timeout` en az 2 dakika olmalı.
- **Mesaj tekrar kontrolü** veritabanında (`processed_messages`).
- **İşletme yapılandırması kodda.** Pilotta her işletme için dosya eklenir; sonra panelden düzenlenecek.
- **Takvim dahili.** Google Takvim entegrasyonu yol haritasında. Çalışanların izin günleri ve öğle arası henüz yok.
- **Sadece metin.** Sesli mesaj ve görseller şimdilik okunmuyor; asistana kısa bir not olarak iletiliyor. Kuaför ve berber müşterileri sık sesli mesaj attığı için bu, yol haritasında öne alınmalı.
- Model: varsayılan `claude-opus-5-5`, sohbet hızı için `low` efor. Reddedilen isteklerde sunucu tarafı yedek model (`fallbacks: "default"`) açık.

## Yol haritası

1. Randevu hatırlatma şablon mesajları (gelmeyen müşteri oranını düşürmek için; salonlarda en çok istenen özellik olması bekleniyor)
2. Sesli mesajı metne çevirme
3. Panelden işletme bilgisi, çalışan ve izin günü düzenleme; çoklu işletme ve kullanıcı girişi
4. Randevu iptal ve erteleme aracı
5. Google Takvim entegrasyonu
6. Raporlama: yanıt süresi, randevuya dönüşüm, mesai dışı gelen talepler

Doğrulama planı ve işletme görüşme kiti: [`docs/dogrulama-kiti.md`](docs/dogrulama-kiti.md).
