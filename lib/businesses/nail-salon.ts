import type { Business } from "../business";

export const nailSalon: Business = {
  id: "demo-tirnak",
  type: "nail_salon",
  name: "Oje Stüdyo",
  city: "İzmir",
  address: "Kıbrıs Şehitleri Cad. No:20, Alsancak / İzmir",
  utcOffset: "+03:00",
  languages: ["Türkçe", "English"],
  slotMinutes: 30,
  services: [
    { id: "manikur", name: "Manikür", description: "Klasik manikür.", durationMinutes: 45, priceInfo: "500 TL" },
    { id: "kalici-oje", name: "Kalıcı oje", description: "Manikür + kalıcı oje.", durationMinutes: 60, priceInfo: "750 TL" },
    { id: "protez", name: "Protez tırnak", description: "Jel veya akrilik protez tırnak.", durationMinutes: 120, priceInfo: "1.400–1.800 TL" },
    { id: "nail-art", name: "Nail art (ek)", description: "Tasarıma göre, tırnak başı.", durationMinutes: 30, priceInfo: "Tırnak başı 50–150 TL" },
    { id: "pedikur", name: "Pedikür", description: "Klasik pedikür.", durationMinutes: 60, priceInfo: "650 TL" },
  ],
  staff: [
    { id: "buse", name: "Buse", serviceIds: ["manikur", "kalici-oje", "protez", "nail-art"] },
    { id: "ece", name: "Ece", serviceIds: ["manikur", "kalici-oje", "pedikur"] },
  ],
  workingHours: [
    { day: 1, open: "10:00", close: "19:00" },
    { day: 2, open: "10:00", close: "19:00" },
    { day: 3, open: "10:00", close: "19:00" },
    { day: 4, open: "10:00", close: "19:00" },
    { day: 5, open: "10:00", close: "19:00" },
    { day: 6, open: "10:00", close: "18:00" },
  ],
  faq: [
    { q: "Kalıcı oje ne kadar dayanır?", a: "Doğru bakımla genellikle 2–3 hafta dayanır." },
    { q: "Başka yerde yapılmış protezi çıkarıyor musunuz?", a: "Evet, çıkarma işlemi 30 dakika sürer ve 250 TL'dir." },
  ],
  policies: ["Randevu iptali en az 3 saat önceden bildirilmeli; bunu randevu onayında hatırlat."],
};
