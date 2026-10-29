# Eksikler ve hata taraması — 29 Ekim 2026

Üç ayrı inceleme birleştirildi: kod denetimi (tüm lib/app), panel ekranlarının tarayıcıda
denetimi (390/768/1280 px, açık/koyu tema) ve web araştırması (rakipler, veri setleri,
Anthropic önerileri, Meta/KVKK kuralları). Önem: 🔴 kritik/yüksek · 🟠 orta · 🟡 düşük.

**Hemen düzeltildi:** küfür filtresi "eksik", "klasik", "kesik", "götür", "sayarak", "boks"
gibi kelimeleri küfür sayıp müşteriyi engelleyebiliyordu (commit 05d190a).

---

## A. Kod: gerçek hatalar

| # | Bulgu | Yer | Önem |
|---|---|---|---|
| A1 | Mesaj işlenmeden önce "görüldü" işaretleniyor. Model/DB/gönderim hatası ya da 60 sn süre aşımında mesaj kalıcı kayboluyor; Meta tekrar gönderse "tekrar" sayılıp atılıyor. | `lib/inbound.ts` markMessageSeen, `app/api/*/webhook` | 🔴 |
| A2 | Konuşma kilidi (advisory lock) model çağrısı boyunca havuzdaki bir bağlantıyı tutuyor; havuz 5. Aynı anda 5 mesaj gelirse tüm istekler asılı kalır, hepsi kaybolur (A1 ile birleşir). | `lib/store-postgres.ts` withLock | 🔴 |
| A3 | Konuşma geçmişi sınırsız büyüyor; her istekte tamamı (+6 görsel) modele gidiyor. Sadık müşteride bir gün bağlam sınırı aşılır → her mesaj "size dönüş yapacağız". Maliyet de lineer artar. | `lib/store.ts`, `lib/agent/run.ts` | 🔴 |
| A4 | Herkese açık `/demo`, ilk işletmenin (pilot salonun) **gerçek takvimine gerçek randevu** yazıyor ve sınırsız model harcatıyor (rate limit yok). | `app/api/demo/chat/route.ts` | 🔴 |
| A5 | `listAppointments` tüm geçmiş randevuları, `listConversations` 200 konuşmanın tüm geçmişini (jsonb) çekiyor; her model turunda ve her panel açılışında. Pilot raporu 200'den fazla konuşmada eksik sayıyor. | `lib/store-postgres.ts` | 🟠→🔴 |
| A6 | Erteleme "önce yeni saate al, sonra eskisini iptal et" → aynı ustada çakışan saate (14:00→14:30) taşıma başarısız. | `lib/agent/tools.ts`, prompt | 🟠 |
| A7 | Hatırlatma cron'u tek hatada tamamen duruyor; Instagram token yenileme de aynı görevde. Randevuda kanal bilgisi yok → Instagram randevularına hatırlatma gitmiyor, kısa IGSID telefon sanılabilir. | `lib/reminders.ts`, `lib/phone.ts` | 🟠 |
| A8 | `business_settings.config` doğrulamasız okunuyor; Business'a zorunlu alan eklenince eski kayıt tüm asistanı düşürür. | `store-postgres.ts` getBusinessSettings | 🟠 |
| A9 | Yanıt gönderimi başarısız olsa da panelde "yanıtlandı" görünüyor; personel fark etmez. | `lib/inbound.ts` | 🟠 |
| A10 | WhatsApp 👍 tepkisi / sticker / unsupported olayı model turu başlatıp yanıt üretiyor. | `lib/whatsapp.ts` | 🟡 |
| A11 | 8 araç turunda hâlâ bitmediyse müşteriye "dönüş yapacağız" denip durum `bot` kalıyor; kimse dönmüyor. | `run.ts` | 🟡 |
| A12 | Engellenen müşteriye aynı turda düğmeler gidiyor; demo'da `blocked` kontrolü yok. | `run.ts`, demo route | 🟡 |
| A13 | Çalışan saati slot ızgarasına oturmuyorsa (12:15) hiç saat çıkmıyor. | `availability.ts`, schema | 🟡 |
| A14 | `processed_messages` hiç temizlenmiyor. | schema | 🟡 |
| A15 | Dışa aktarmada Türkçe harfle başlayan adlar (Şule, Özge, Çağla) redakte edilmiyor → örneklere ad sızar (KVKK). | `whatsapp-export.ts` redact `\b` | 🟡 |

## B. Güvenlik

| # | Bulgu | Önem |
|---|---|---|
| B1 | Admin girişinde deneme sınırı yok; tüm işletmeler tek şifrenin arkasında. | 🟠 |
| B2 | `PANEL_PASSWORD` aynı anda oturum imzası, takvim bağlantısı ve **Instagram token şifreleme** anahtarı. Şifre değişince IG bağlantıları `openToken`'da patlar (try dışında → mesaj kaybı). Production'da `SESSION_SECRET`, `INSTAGRAM_TOKEN_KEY`, `CALENDAR_FEED_SECRET` zorunlu olmalı. | 🟠 |
| B3 | Instagram görsel indirme yönlendirmeleri takip ediyor; `https` zorunlu değil. | 🟠 |
| B4 | Log'a müşteri fotoğrafının imzalı CDN adresi yazılıyor. | 🟡 |
| B5 | Takvim feed'i müşteri telefonlarını Google'a gönderiyor (bilinçli; KVKK notu). | 🟡 |
| ✓ | Sağlam: tüm server action'larda yetki kontrolü, webhook imzaları, OAuth state, XSS yolu yok, zip tarayıcıda açılıyor, medya uçlarında işletme kontrolü. | |

## C. Ürün / mantık boşlukları

- **C1** Aynı müşteri WhatsApp + Instagram'dan yazınca iki ayrı kişi; Instagram'dan WhatsApp randevusunu göremez/iptal edemez. 🟠
- **C2** Handoff'ta işletmeye bildirim yok; panel açık değilse müşteri saatlerce yanıtsız. 🟠
- **C3** `check_availability` "any" ile tüm ustaların fiyatı dönüyor; model fiyatı söyleyip randevu başka ustaya düşerse karttaki fiyat farklı olabilir. 🟠
- **C4** `photoQuotes: "assistant"` (listeden tahmin) en riskli mod; panelde uyarı yok. 🟡
- **C5** Panelden çalışan silinince eski randevuları kimseyi bloke etmiyor; çalışansızdan çalışanlıya geçişte eski randevular çakışabilir. 🟡
- **C6** İşletme listesi kodda sabit; yeni salon = deploy. Pilot için kabul, büyümede engel. (tasarım)
- **C7** Instagram'da 24 saat sonra bot yazamaz (HUMAN_AGENT etiketi botlara kapalı) → hatırlatma imkânsız; randevu sonunda WhatsApp numarası/opt-in istemek gerekir.

## D. Panel ekranları (tarayıcı denetimi)

Ekran görüntüleri: `/tmp/claude-0/-home-user/3197ce7b-f6d4-5716-9dc5-062fe869d987/scratchpad/ui-denetim/`

🔴
- **D1** Konuşma kutusu en üstten açılıyor; asistanın son yanıtı yarım satır kesik. "Sizi bekliyor" durumunda en kritik bilgi gizli. → en alta kaydırarak aç.
- **D2** Telefonda takvim yatay kaydırmalı, açılışta Pzt–Çar görünüyor; "bugün" ekran dışında, ipucu yok. → bugüne otomatik kaydır / 3 günlük görünüm.
- **D3** "İptal et" (randevu) tek tık, onaysız, geri bildirimsiz. → onay + "geri al".
- **D4** "Engelle" onaysız ve 41×16 px silik metin. → confirm + belirgin düğme.

🟠
- **D5** Saat kutuları en-US tarayıcıda "10:00 AI" diye kesik; tarih alanı Amerikan sıralı. → genişlik / `lang="tr"`.
- **D6** Takvim formunda "Hizmet" seçeneği kesiliyor ("Saç kesimi (30 dl"). → tam satır.
- **D7** Telefonda randevu tablosu "İletişim" sütunu ekran dışında. → kart düzeni.
- **D8** Koyu temada kırmızı metinler (Engelle/İptal/Sil) 2.6:1 kontrast. → red-400.
- **D9** 404 sayfası İngilizce, markasız ("This page could not be found"). → Türkçe `not-found.tsx`.
- **D10** Örneklerde geçersiz fiyat ("abc") sessizce siliniyor. → uyarı.
- **D11** 390'da "Panele dön" iki satıra bölünüp metinle çakışıyor (kullanıcılar, takvim).
- **D12** Ayarlar'da yapışkan Kaydet çubuğu yarı saydam, içerik altından okunuyor.
- **D13** "Sil" düğmeleri telefonda satır genişliğinde, 768'de dikey kırılıyor.
- **D14** Geçersiz `isletme` parametresi sessizce ilk işletmeye düşüyor.
- **D15** Demo veri: Ustura Berber Pazar kapalı ama Pazar 18:00/19:00 randevu var.

🟡
- Rapor boş durumu sekiz "0" kartı; demo'da API yokken "mesajınızı aldık" (çalışmadığı anlaşılmıyor), örnek cümleler tıklanabilir değil; ana sayfa 768'de defter illüstrasyonu kesik; tarayıcı doğrulama mesajları İngilizce; 5 form alanı etiketsiz; küçük dokunma hedefleri (<24 px); "Bu hafta" linki Perşembe tarihi üretiyor.

**Teknik olmayan kuaförün anlamayacağı ifadeler:** "Pilot raporu" (→ Aylık özet), "ortanca", "Randevuların en az değeri", "Devretme nedeni" (→ Size bırakıldı çünkü…), "Asistanı bu konuşmada yeniden aç" (→ Asistan yanıtlamaya devam etsin), "· asistan / · panelden" (→ WhatsApp'tan alındı / elle eklendi), ".ics adresi", "Medyayı dahil et", "Kullanıma hazır / Fiyatı eksik", "dörtte biri ayrılır… %15 pay", "Sizi bekliyor" (ne beklediği).

## E. Asistanı iyileştirme (araştırma özeti)

Anthropic'in resmî önerileri ve sektör pratiklerinden Sırada'ya uyan maddeler, iş yüküyle:

1. **Mutlak zaman bağlamı + teyit kuralı** (küçük): istemde bugünün tarihi/günü var; eklenecek: göreli ifadeyi ("haftaya", "öbür gün", "bu hafta sonu", "ayın 5'i", "akşamüstü") mutlak tarihe çevirip gün adıyla teyit ettir; "öğleden sonra"yı sabit saate değil aralığa çevir.
2. **İstem dilini yumuşat** (küçük): "MUST/CRITICAL" ve "emin değilsen aracı kullan" ifadeleri aşırı tetikleme yapıyor; "Use when…" yeterli. İptal/değişiklik için açık onay adımı.
3. **Araç tanımlarını genişlet** (küçük–orta): her araç 3–4 cümle, `input_examples`; hata mesajları eyleme dönük ("dolu; en yakın boşlar: …"). Erteleme için tek `reschedule_appointment` aracı (A6'yı da çözer).
4. **Prompt caching düzeni** (küçük): tools → system → örnek kütüphanesi sabit prefix; her istekte değişen "[Şu an: …]" bloğu breakpoint'ten sonra.
5. **Sınav seti (eval)** (orta): 20–50 gerçek başarısızlıktan τ-bench formatında vaka (persona + başlangıç takvimi + beklenen son takvim + iletilmesi zorunlu bilgi), pass^k ile tutarlılık; hem "yapmalı" hem "yapmamalı" (uydurma fiyat, izinsiz iptal). Türkçe zaman ifadesi paketi 50–100 deterministik vaka. Veri kaynağı: SGD "Services" alanı (salon/diş randevuları), Multi3WOZ Türkçe (7.440 diyalog, MIT), Taskmaster self-dialog yöntemiyle Claude'a sentetik Türkçe diyalog yazdırma.
6. **Handoff sebep kodları + haftalık inceleme** (küçük): açık insan talebi (anında), 3 başarısız tur, duygu düşüşü, politika dışı, araç hatası.
7. **Hatırlatma dizisi** (orta): onay → 24 s önce buton onayı ("Geliyorum / Değiştir / İptal") → riskli randevuda 2–3 s önce. Utility şablonda promosyon yok (marketing'e düşer). Cochrane: SMS hatırlatma katılımı %68→%79.
8. **Instagram → WhatsApp köprüsü** (orta): rezervasyon sonunda "hatırlatmaları WhatsApp'tan alalım mı?" opt-in.
9. **KVKK paketi** (orta): chatbot'a özel aydınlatma (ilk mesajda link + "yapay zekâ asistanıyım"), salonla veri işleyen sözleşmesi, Claude API yurt dışı aktarım analizi (KVKK 24 Kasım 2025 "15 Soruda Üretken YZ" rehberi). Avukat teyidi.
10. **LLM hakem** (orta): farklı model, boyut başına ayrı hakem (tarih doğruluğu / fiyat uydurmama / ton / gereksiz devretme), 30–50 vakayla insan kalibrasyonu.
11. Yeniden randevu daveti (orta): hizmet eşiği (erkek kesim 6 hf, boya 5–8 hf), 3 dokunuş sonra dur, marketing şablonu + opt-in.
12. Google yorumu isteme (orta): çıkıştan 1–2 saat sonra tek mesaj.

Pazar notları: Fresha, Booksy (ChatGPT içinden rezervasyon), Treatwell (AI resepsiyonist, Eylül 2026), Square Assistant hepsi 2026'da AI resepsiyonist çıkardı; Meta'nın kendi "Business Agent"ı en büyük stratejik rakip. Türkiye'de Velora (WhatsApp+Instagram AI resepsiyonist iddiası), Kuafix, Salon Randevu (WhatsApp +4,99 $/ay eklenti), Randevo (1.249 ₺/ay), Kommo. Savunulabilir alan: Türkçe doğruluk, KVKK uyumlu kurulum, WA+IG tek akış, ölçülebilir no-show düşüşü. Meta 1 Ekim 2026'dan itibaren pencere içi serbest mesajları da ücretlendiriyor (numara başına ilk 1.000/ay ücretsiz); Türkiye utility ~0,0009 $. Asıl maliyet LLM çağrısı.

## F. Önerilen sıra (fotoğraf eğitiminden önce)

1. 🔴 A1 + A2: mesaj kaybını bitir (işaretlemeyi başarıdan sonraya al; kilidi model çağrısı dışına çıkar ya da ayrı havuz + zaman aşımı).
2. 🔴 A4: demo randevularını gerçek takvimden ayır, demo'ya rate limit.
3. 🔴 A3 + A5: geçmişi son N tur + özetle sınırla; randevuları tarih aralığıyla çek; panelde history çekme.
4. 🔴 D1–D4: panel son mesaj, telefonda takvim, iptal/engel onayı.
5. 🟠 A6 (reschedule aracı), A7 (cron dayanıklılığı + randevuya kanal), A9 (gönderim hatası → handoff), B2 (ayrı gizli anahtarlar, health'te uyarı), B1 (giriş yavaşlatma).
6. 🟠 D5–D15 ve dil sadeleştirmeleri.
7. E1–E4 istem/araç iyileştirmeleri, sonra E5 sınav seti; fotoğraf örnekleri bunun üstüne gelir.
