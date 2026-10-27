import type { Business } from "../business";

export const barber: Business = {
  id: "demo-berber",
  type: "barber",
  name: "Ustura Berber",
  city: "Ankara",
  address: "Tunalı Hilmi Cad. No:5, Çankaya / Ankara",
  utcOffset: "+03:00",
  languages: ["Türkçe", "English"],
  slotMinutes: 15,
  services: [
    { id: "sac", name: "Saç kesimi", description: "Makas veya makine kesim, yıkama dahil.", durationMinutes: 30, priceInfo: "400 TL" },
    { id: "sakal", name: "Sakal tıraşı", description: "Sakal şekillendirme ve sıcak havlu.", durationMinutes: 15, priceInfo: "200 TL" },
    { id: "sac-sakal", name: "Saç + sakal", description: "Saç kesimi ve sakal tıraşı.", durationMinutes: 45, priceInfo: "550 TL" },
    { id: "cocuk", name: "Çocuk tıraşı", description: "12 yaş altı.", durationMinutes: 20, priceInfo: "300 TL" },
  ],
  staff: [
    {
      id: "mehmet",
      name: "Mehmet Usta",
      serviceIds: ["sac", "sakal", "sac-sakal", "cocuk"],
      prices: { sac: "500 TL", sakal: "250 TL", "sac-sakal": "700 TL" },
    },
    { id: "can", name: "Can", serviceIds: ["sac", "sakal", "sac-sakal", "cocuk"] },
  ],
  workingHours: [
    { day: 1, open: "09:00", close: "21:00" },
    { day: 2, open: "09:00", close: "21:00" },
    { day: 3, open: "09:00", close: "21:00" },
    { day: 4, open: "09:00", close: "21:00" },
    { day: 5, open: "09:00", close: "21:00" },
    { day: 6, open: "09:00", close: "21:00" },
  ],
  faq: [
    { q: "Randevusuz gelebilir miyim?", a: "Gelebilirsiniz ama sıra olabilir; randevulu müşterilerimiz önceliklidir." },
    { q: "Pazar açık mısınız?", a: "Pazar günleri kapalıyız." },
  ],
  policies: [],
};
