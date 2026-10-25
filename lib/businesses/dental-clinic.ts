import type { Business } from "../business";

export const dentalClinic: Business = {
  id: "demo-dis",
  type: "dental_clinic",
  name: "Demo Diş Kliniği",
  city: "İstanbul",
  address: "Halaskargazi Cad. No:1, Şişli / İstanbul",
  mapsUrl: "https://maps.google.com/?q=Şişli+İstanbul",
  utcOffset: "+03:00",
  languages: ["Türkçe", "English", "العربية", "Deutsch"],
  slotMinutes: 30,
  services: [
    {
      id: "muayene",
      name: "Muayene ve panoramik röntgen",
      description: "İlk değerlendirme, panoramik röntgen ve tedavi planı.",
      durationMinutes: 30,
      priceInfo: "Ücretsiz (tedavi planı dahil)",
    },
    {
      id: "implant",
      name: "İmplant",
      description: "Titanyum implant uygulaması. Tedavi planı muayene sonrası netleşir.",
      durationMinutes: 60,
      priceInfo: "İmplant başı 450–750 EUR (marka ve kemik durumuna göre)",
    },
    {
      id: "zirkonyum",
      name: "Zirkonyum kaplama",
      description: "Estetik zirkonyum kron.",
      durationMinutes: 60,
      priceInfo: "Diş başı 180–250 EUR",
    },
    {
      id: "beyazlatma",
      name: "Diş beyazlatma",
      description: "Klinik tipi ofis beyazlatma, tek seans.",
      durationMinutes: 60,
      priceInfo: "200 EUR",
    },
  ],
  staff: [],
  workingHours: [
    { day: 1, open: "09:00", close: "18:00" },
    { day: 2, open: "09:00", close: "18:00" },
    { day: 3, open: "09:00", close: "18:00" },
    { day: 4, open: "09:00", close: "18:00" },
    { day: 5, open: "09:00", close: "18:00" },
    { day: 6, open: "10:00", close: "15:00" },
  ],
  faq: [
    {
      q: "Havalimanı transferi var mı?",
      a: "Yurt dışından gelen hastalarımız için İstanbul Havalimanı ve Sabiha Gökçen'den ücretsiz transfer sağlıyoruz.",
    },
    { q: "Konaklama ayarlıyor musunuz?", a: "Anlaşmalı otellerimizde indirimli konaklama ayarlayabiliyoruz." },
    {
      q: "Tedavi kaç gün sürer?",
      a: "İmplant ve kaplama tedavileri genellikle 5–7 günlük ilk ziyaret gerektirir; kesin süre muayene sonrası belirlenir.",
    },
    { q: "Ödeme seçenekleri neler?", a: "Nakit (TL, EUR, USD) ve kredi kartı kabul ediyoruz." },
  ],
  policies: [],
};
