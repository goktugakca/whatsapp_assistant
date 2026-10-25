# Doğrulama Kiti

Amaç: kod yazmaya devam etmeden önce şu üç soruya gerçek kliniklerden cevap almak.

1. Sorun gerçekten var mı? WhatsApp'tan gelen mesajlar kayboluyor mu, gecikiyor mu?
2. Değerli mi? Kaybolan bir hasta kliniğe ne kadar kaybettiriyor?
3. Para öder mi? Bugün bu iş için kime ya da neye ne harcıyorlar?

**2 haftalık hedef:** 15–20 görüşme, en az 3 klinikten "pilotu başlatalım" sözü.

---

## 1. Kimlerle görüşülecek?

Öncelik sırası:
1. Sağlık turizmi yapan diş klinikleri (İstanbul, Antalya, İzmir)
2. Estetik ve saç ekimi klinikleri (yabancı hasta oranı yüksek)
3. Yabancı hastası olmayan ama WhatsApp'tan yoğun randevu alan yerel diş klinikleri (karşılaştırma için)

Nereden bulunur:
- Google Haritalar'da "dental clinic Istanbul": İngilizce yorumu çok olan klinikler yabancı hasta alıyor demektir.
- Instagram'da #dentalturkey, #hollywoodsmileturkey etiketleri
- Sağlık turizmi aracı firmaları (bir aracı firma onlarca kliniğe kapı açabilir)
- Tanıdık diş hekimleri ve diş hekimliği fakültesi mezun grupları

Kiminle konuşmalı: Klinik sahibi veya hasta koordinatörü. WhatsApp'a fiilen bakan kişi en değerli bilgiyi verir.

---

## 2. İlk temas mesajları

### WhatsApp / Instagram DM (kısa)

> Merhaba, ben [Adınız]. Yurt dışından hasta alan kliniklerin WhatsApp'a gelen mesajları nasıl yönettiğini araştırıyorum. Bir şey satmıyorum; 15 dakikanızı ayırıp deneyimlerinizi anlatır mısınız? Karşılığında görüştüğüm kliniklerden öğrendiklerimi özetleyip size gönderirim.

### Yüz yüze uğrarken

> Kliniklerin WhatsApp'tan gelen yabancı hasta sorularıyla ilgili bir araştırma yapıyorum. Hasta koordinatörünüzle 10 dakika konuşabilir miyim?

İpucu: İlk görüşmelerde demo göstermeyin. Önce dinleyin. Demo, sorunu doğruladıktan sonra, görüşmenin sonunda gelir.

---

## 3. Görüşme soruları (15–20 dk)

Kural: Geleceği değil geçmişi sorun. "Kullanır mısınız?" yerine "En son ne oldu?" diye sorun.

**Mevcut durum**
1. Hastalar size en çok hangi kanaldan ulaşıyor? Oranı kabaca nedir?
2. WhatsApp'a günde kaç mesaj geliyor? Kaçı yeni hasta?
3. Mesajlara kim bakıyor? Mesai dışında ne oluyor?
4. Hangi dillerde mesaj geliyor? Türkçe dışındakilere kim yanıt veriyor?

**Sorun**
5. En son ne zaman bir hastayı geç yanıt yüzünden kaybettiğinizi düşündünüz? Ne oldu?
6. Bir mesaja ortalama ne kadar sürede dönüyorsunuz? Gece gelen mesaja?
7. En sık sorulan 5 soru ne? Bunlara yanıt vermek günde ne kadar zaman alıyor?

**Değer**
8. Ortalama bir yabancı hasta size ne kadar gelir bırakıyor?
9. WhatsApp'a yazan 10 kişiden kaçı sonunda tedaviye geliyor?

**Mevcut çözümler ve bütçe**
10. Bunun için şu an bir yazılım, ajans ya da ek personel kullanıyor musunuz? Ne kadar ödüyorsunuz?
11. Daha önce bir chatbot denediniz mi? Neden bıraktınız?

**Kapanış (demo burada)**
12. (Demoyu gösterin.) Bunun sizde çalıştığını görmek için ne gerekir?
13. 2 haftalık ücretsiz pilot yapsak, başarıyı neyle ölçerdiniz?
14. Bunu konuşmamız gereken başka biri var mı? (karar verici, ortak)

---

## 4. Not şablonu (her görüşme için)

| Alan | Not |
|---|---|
| Klinik / şehir / kişi | |
| Yabancı hasta oranı | |
| Günlük WhatsApp mesajı | |
| Mesai dışı durum | |
| Diller | |
| Hasta başı gelir | |
| Mesajdan tedaviye dönüşüm | |
| Mevcut çözüm ve maliyet | |
| En güçlü acı (kendi cümlesiyle) | |
| Pilot ilgisi (0–3) | 0: yok · 1: kibar ilgi · 2: "deneyelim" · 3: tarih verdi veya ödeme teklif etti |
| Sonraki adım | |

---

## 5. Karar kriterleri (2 hafta sonra)

**Devam:** Görüşmelerin yarısından fazlasında mesai dışı veya yabancı dil mesajları açık bir sorun, ve en az 3 klinik pilot ilgisinde 2–3 seviyesinde.

**Pivot:** Sorun var ama farklı bir yerde (ör. Instagram DM daha önemli, ya da asıl sorun gelmeyen hastalar). Ürünü oraya kaydır.

**Dur:** Klinikler sorunu küçük görüyor veya ajanslar zaten ucuza çözüyor. Başka segmente geç (ör. estetik, veteriner, güzellik).

---

## 6. Pilot nasıl yürütülür?

1. Kliniğin fiyat listesi, SSS, çalışma saatleri ve kurallarını `lib/clinic.ts` formatında birlikte doldurun.
2. İlk hafta asistanı sadece mesai dışında açın; personel sabah paneli kontrol etsin.
3. Her gün konuşmaları okuyun; yanlış veya eksik yanıtları istem ve klinik bilgisine yansıtın.
4. Ölçün:
   - İlk yanıt süresi (önce / sonra)
   - Mesai dışı yanıtlanan konuşma sayısı
   - Asistanın oluşturduğu randevu ve toplanan lead sayısı
   - Ekibe devredilme oranı ve nedenleri
   - Hatalı yanıt sayısı (hedef: sıfır kritik hata)
5. 2. haftanın sonunda sonuçları klinikle paylaşın ve ücretli devam teklif edin.
