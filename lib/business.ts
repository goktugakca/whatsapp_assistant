// İşletme yapılandırması. Randevuyla çalışan her işletme (kuaför, berber, tırnak salonu,
// klinik…) bu yapıyla tanımlanır. Pilot aşamasında kayıtlar kodda; sonra veritabanına taşınacak.

import { barber } from "./businesses/barber";
import { dentalClinic } from "./businesses/dental-clinic";
import { hairSalon } from "./businesses/hair-salon";
import { nailSalon } from "./businesses/nail-salon";

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Pazar

export type BusinessType = "hair_salon" | "barber" | "nail_salon" | "dental_clinic";

export interface Service {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  priceInfo: string; // Serbest metin: "450–750 TL" gibi. Asistan fiyat olarak sadece bunu söyler.
}

export interface WorkingHours {
  day: Weekday;
  open: string; // "09:00"
  close: string; // "18:00"
}

// Randevu verilen kişi (usta, kuaför, hekim). Hiç çalışan tanımlanmamışsa işletme
// tek bir takvim gibi davranır: aynı anda tek randevu.
export interface Staff {
  id: string;
  name: string;
  serviceIds: string[];
  workingHours?: WorkingHours[]; // Tanımlı değilse işletmenin saatleri geçerli
}

export interface Business {
  id: string;
  type: BusinessType;
  name: string;
  city: string;
  address: string;
  mapsUrl?: string;
  utcOffset: string; // "+03:00" (Türkiye 2016'dan beri sabit UTC+3)
  languages: string[];
  whatsappPhoneNumberId?: string; // Meta'nın verdiği phone_number_id; webhook'ta işletmeyi bulmak için
  services: Service[];
  staff: Staff[];
  workingHours: WorkingHours[];
  slotMinutes: number;
  faq: { q: string; a: string }[];
  policies: string[]; // Asistanın uyması gereken işletmeye özel kurallar
}

export const businesses: Business[] = [hairSalon, barber, nailSalon, dentalClinic];

export function getBusinessById(id: string): Business | undefined {
  return businesses.find((b) => b.id === id);
}

// Pilotta tek bir WhatsApp numarası, WHATSAPP_BUSINESS_ID ile seçilen işletmeye bağlanır.
export function getBusinessByPhoneNumberId(phoneNumberId: string): Business | undefined {
  const explicit = businesses.find((b) => b.whatsappPhoneNumberId === phoneNumberId);
  if (explicit) return explicit;
  if (phoneNumberId && phoneNumberId === process.env.WHATSAPP_PHONE_NUMBER_ID) {
    return getBusinessById(process.env.WHATSAPP_BUSINESS_ID ?? businesses[0].id);
  }
  return undefined;
}

export function phoneNumberIdFor(business: Business): string | undefined {
  if (business.whatsappPhoneNumberId) return business.whatsappPhoneNumberId;
  const connectedId = process.env.WHATSAPP_BUSINESS_ID ?? businesses[0].id;
  return business.id === connectedId ? process.env.WHATSAPP_PHONE_NUMBER_ID : undefined;
}
