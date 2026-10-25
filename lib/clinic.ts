// Klinik yapılandırması. Pilot aşamada her klinik bu yapıda bir kayıtla tanımlanır;
// ileride panelden düzenlenebilir hale gelecek ve veritabanına taşınacak.

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Pazar

export interface Service {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  priceInfo: string; // Serbest metin: "Diş başı 250–400 EUR" gibi. Asistan sadece bunu söyler.
}

export interface WorkingHours {
  day: Weekday;
  open: string; // "09:00"
  close: string; // "18:00"
}

export interface Clinic {
  id: string;
  name: string;
  city: string;
  address: string;
  mapsUrl?: string;
  utcOffset: string; // "+03:00" (Türkiye 2016'dan beri sabit UTC+3)
  languages: string[];
  whatsappPhoneNumberId?: string; // Meta'nın verdiği phone_number_id; webhook'ta kliniği bulmak için
  services: Service[];
  workingHours: WorkingHours[];
  slotMinutes: number;
  faq: { q: string; a: string }[];
  policies: string[]; // Asistanın uyması gereken kliniğe özel kurallar
}

export const demoClinic: Clinic = {
  id: "demo-dis",
  name: "Demo Diş Kliniği",
  city: "İstanbul",
  address: "Halaskargazi Cad. No:1, Şişli / İstanbul",
  mapsUrl: "https://maps.google.com/?q=Şişli+İstanbul",
  utcOffset: "+03:00",
  languages: ["Türkçe", "English", "العربية", "Deutsch"],
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
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
    {
      q: "Konaklama ayarlıyor musunuz?",
      a: "Anlaşmalı otellerimizde indirimli konaklama ayarlayabiliyoruz.",
    },
    {
      q: "Tedavi kaç gün sürer?",
      a: "İmplant ve kaplama tedavileri genellikle 5–7 günlük ilk ziyaret gerektirir; kesin süre muayene sonrası belirlenir.",
    },
    {
      q: "Ödeme seçenekleri neler?",
      a: "Nakit (TL, EUR, USD) ve kredi kartı kabul ediyoruz.",
    },
  ],
  policies: [
    "Kesin fiyatı ve tedavi planını muayene veya röntgen değerlendirmesinden önce taahhüt etme; sadece yukarıdaki fiyat aralıklarını paylaş.",
    "Tıbbi teşhis koyma veya ilaç önerme. Ağrı, şişlik, kanama gibi acil durumlarda hastayı hemen insana devret.",
  ],
};

const clinics: Clinic[] = [demoClinic];

export function getClinicById(id: string): Clinic | undefined {
  return clinics.find((c) => c.id === id);
}

export function getClinicByPhoneNumberId(phoneNumberId: string): Clinic | undefined {
  return clinics.find((c) => c.whatsappPhoneNumberId === phoneNumberId);
}
