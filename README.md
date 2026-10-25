# Klinik Asistan

Diş ve estetik kliniklerinin WhatsApp'ına gelen hasta mesajlarını 7/24 ve birkaç dilde yanıtlayan, hasta bilgisini toplayan, randevu oluşturan ve gerektiğinde konuşmayı ekibe devreden yapay zekâ asistanı.

> Çalışma adı. Ürün adı netleşince değiştirilecek.

## Ne var?

| Sayfa / uç | Ne işe yarar |
|---|---|
| `/` | Kliniklere yönelik tanıtım ve pilot başvuru formu (doğrulama için) |
| `/demo` | WhatsApp kurulumu olmadan asistanı tarayıcıda deneme; kliniklere demo göstermek için |
| `/panel` | Klinik paneli: konuşmalar, toplanan hasta bilgisi, devredilen konuşmalar, randevular, personel yanıtı |
| `POST /api/whatsapp/webhook` | Meta'dan gelen WhatsApp mesajları (imza doğrulamalı) |
| `POST /api/demo/chat` | Demo sohbetinin arka ucu |

### Asistanın araçları (`lib/agent/tools.ts`)

- `check_availability`: Kliniğin çalışma saatleri ve mevcut randevulara göre boş saatleri verir.
- `book_appointment`: Sadece gerçekten boş olan bir saate randevu yazar; model saat uyduramaz.
- `save_lead`: Hastanın adı, ülkesi, dili, tedavisi ve ne zaman gelmek istediğini panele kaydeder.
- `handoff_to_human`: Konuşmayı personele devreder; asistan o hastaya artık otomatik yanıt vermez.

Model hata verirse veya yanıtlamayı reddederse, hastaya güvenli bir "ekibimiz dönecek" mesajı gider ve konuşma ekibe devredilir.

## Kurulum

```bash
npm install
cp .env.example .env.local   # değerleri doldurun
npm run dev                  # http://localhost:3000
```

Sadece demo için `ANTHROPIC_API_KEY` yeterli. Panel geliştirme ortamında parolasız açılır; production'da `PANEL_PASSWORD` zorunlu.

```bash
npm test           # birim testleri (vitest)
npm run typecheck
npm run lint
npm run build
```

## WhatsApp bağlantısı (Cloud API)

1. [Meta for Developers](https://developers.facebook.com/)'ta bir uygulama oluşturun, WhatsApp ürününü ekleyin.
2. API Setup sayfasından `WHATSAPP_PHONE_NUMBER_ID` ve erişim anahtarını alın. Kalıcı kullanım için System User ile süresiz bir anahtar oluşturun (`WHATSAPP_ACCESS_TOKEN`).
3. Uygulama ayarlarından App Secret'ı alın (`WHATSAPP_APP_SECRET`).
4. Uygulamayı HTTPS bir adrese yayınlayın (ör. Vercel). Webhook adresi: `https://<alan-adınız>/api/whatsapp/webhook`, doğrulama anahtarı: `WHATSAPP_VERIFY_TOKEN`.
5. Webhook alanlarından `messages`'a abone olun.
6. Test numaranızdan WhatsApp mesajı atın; yanıt gelmeli ve konuşma `/panel`'de görünmeli.

Notlar:
- Hastanın başlattığı konuşmalarda 24 saat içinde serbest metinle yanıt verilebilir ve bu mesajlar ücretsizdir. 24 saat sonra yazmak (hatırlatma vb.) onaylı şablon mesaj gerektirir; henüz yok.
- Meta'nın Ocak 2026 kuralı genel amaçlı sohbet robotlarını yasaklıyor. Bu ürün işletmeye özel müşteri hizmeti olduğu için kapsam dışında, ama asistanı her zaman kliniğin konularına bağlı tutun.

## Mimari ve bilinen sınırlar

- **Veri bellekte duruyor** (`lib/store.ts` → `InMemoryStore`). Sunucu yeniden başlayınca konuşmalar silinir. Pilottan önceki ilk iş: aynı `Store` arayüzüyle Postgres uygulaması.
- **Tek süreç varsayımı.** Aynı hastanın mesajları süreç içinde sıraya alınıyor (`lib/inbound.ts`). Birden fazla sunucuda bunun için kuyruk veya veritabanı kilidi gerekir. Mesaj tekrar kontrolü de veritabanına taşınmalı.
- **Klinik yapılandırması kodda** (`lib/clinic.ts`). Pilotta her klinik için kayıt eklenir; sonra panelden düzenlenecek.
- **Takvim dahili.** Google Takvim entegrasyonu yol haritasında.
- **Sadece metin.** Sesli mesaj ve görseller (ör. röntgen fotoğrafı) şimdilik okunmuyor; asistana kısa bir not olarak iletiliyor.
- Model: varsayılan `claude-opus-5-5`, sohbet hızı için `low` efor. Reddedilen isteklerde sunucu tarafı yedek model (`fallbacks: "default"`) açık.

## Yol haritası

1. Postgres (Neon/Supabase) + kalıcı mesaj tekrar kontrolü
2. Google Takvim entegrasyonu
3. Randevu hatırlatma şablon mesajları (gelmeme oranını düşürmek için)
4. Panelden klinik bilgisi düzenleme, çoklu klinik ve kullanıcı girişi
5. Sesli mesajı metne çevirme, görsel kabulü
6. Raporlama: yanıt süresi, randevuya dönüşüm, dil dağılımı

Doğrulama planı ve klinik görüşme kiti: [`docs/dogrulama-kiti.md`](docs/dogrulama-kiti.md).
