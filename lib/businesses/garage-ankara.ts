import type { Business } from "../business";

// Pilot işletme: boş başlar. Hizmetler, fiyatlar, çalışanlar ve saatler panelden (fiyat
// bağlantısı, fotoğraf veya elle) girilir. Herkese açık demoda görünmez.
export const garageAnkara: Business = {
  id: "garage-ankara",
  type: "hair_salon",
  name: "Garage Ankara",
  city: "Ankara",
  address: "",
  utcOffset: "+03:00",
  languages: ["Türkçe"],
  slotMinutes: 30,
  services: [],
  staff: [],
  // Geçici; sahibi Ayarlar'dan düzeltir.
  workingHours: [
    { day: 1, open: "10:00", close: "20:00" },
    { day: 2, open: "10:00", close: "20:00" },
    { day: 3, open: "10:00", close: "20:00" },
    { day: 4, open: "10:00", close: "20:00" },
    { day: 5, open: "10:00", close: "20:00" },
    { day: 6, open: "10:00", close: "20:00" },
  ],
  faq: [],
  policies: [],
  pilot: true,
};
