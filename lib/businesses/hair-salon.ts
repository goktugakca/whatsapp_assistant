import type { Business } from "../business";

export const hairSalon: Business = {
  id: "demo-kuafor",
  type: "hair_salon",
  name: "Demo Kuaför",
  city: "İstanbul",
  address: "Bağdat Cad. No:10, Kadıköy / İstanbul",
  utcOffset: "+03:00",
  languages: ["Türkçe", "English"],
  slotMinutes: 30,
  services: [
    { id: "kesim", name: "Kesim + fön", description: "Yıkama, kesim ve fön.", durationMinutes: 60, priceInfo: "900–1.200 TL" },
    { id: "fon", name: "Fön", description: "Yıkama ve fön.", durationMinutes: 30, priceInfo: "450 TL" },
    { id: "boya", name: "Dip boya", description: "Dip boya ve fön.", durationMinutes: 90, priceInfo: "1.500–2.000 TL" },
    { id: "rofle", name: "Röfle / balyaj", description: "Saç uzunluğuna göre süre değişir.", durationMinutes: 180, priceInfo: "3.500–6.000 TL" },
    { id: "keratin", name: "Keratin bakımı", description: "Brezilya fönü / keratin.", durationMinutes: 150, priceInfo: "4.000–7.000 TL" },
  ],
  staff: [
    { id: "elif", name: "Elif", serviceIds: ["kesim", "fon", "boya", "rofle", "keratin"] },
    { id: "deniz", name: "Deniz", serviceIds: ["kesim", "fon", "boya"] },
    {
      id: "selin",
      name: "Selin",
      serviceIds: ["fon", "rofle", "keratin"],
      workingHours: [
        { day: 3, open: "12:00", close: "20:00" },
        { day: 4, open: "12:00", close: "20:00" },
        { day: 5, open: "12:00", close: "20:00" },
        { day: 6, open: "10:00", close: "19:00" },
      ],
    },
  ],
  workingHours: [
    { day: 2, open: "10:00", close: "20:00" },
    { day: 3, open: "10:00", close: "20:00" },
    { day: 4, open: "10:00", close: "20:00" },
    { day: 5, open: "10:00", close: "20:00" },
    { day: 6, open: "10:00", close: "19:00" },
    { day: 0, open: "11:00", close: "17:00" },
  ],
  faq: [
    { q: "Pazartesi açık mısınız?", a: "Pazartesi kapalıyız; Salı–Cumartesi 10:00–20:00, Pazar 11:00–17:00 açığız." },
    { q: "Otopark var mı?", a: "Salonun arka sokağında ücretli otopark var." },
    { q: "Ödeme seçenekleri neler?", a: "Nakit ve kredi kartı kabul ediyoruz." },
  ],
  policies: ["Randevuya 15 dakikadan fazla geç kalınırsa randevu kısaltılabilir veya ertelenebilir; bunu nazikçe belirt."],
};
