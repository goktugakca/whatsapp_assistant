// İşletme yapılandırması. Randevuyla çalışan her işletme (kuaför, berber, tırnak salonu,
// klinik…) bu yapıyla tanımlanır. Başlangıç değerleri lib/businesses/ altında; işletme
// panelden değiştirdiğinde güncel hali veritabanında tutulur (loadBusiness).

import { barber } from "./businesses/barber";
import { dentalClinic } from "./businesses/dental-clinic";
import { hairSalon } from "./businesses/hair-salon";
import { nailSalon } from "./businesses/nail-salon";
import type { Store } from "./store";

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
  // Hizmet kimliği -> bu çalışanın fiyatı. Olmayan hizmette hizmetin genel fiyatı geçerli.
  prices?: Record<string, string>;
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

// Hizmetin fiyatı; çalışan belliyse ve ona özel fiyat girilmişse o.
export function priceFor(business: Business, serviceId: string, staffId?: string): string | undefined {
  const own = business.staff.find((s) => s.id === staffId)?.prices?.[serviceId]?.trim();
  return own || business.services.find((s) => s.id === serviceId)?.priceInfo;
}

// Örnek işletmeler: demo ve panelde listelenir, ayarı hiç kaydedilmemişse başlangıç değeri.
export const businesses: Business[] = [hairSalon, barber, nailSalon, dentalClinic];

export function getDefaultBusiness(id: string): Business | undefined {
  return businesses.find((b) => b.id === id);
}

// İşletmenin güncel hali: panelden kaydedilmiş ayar varsa o, yoksa başlangıç değeri.
export async function loadBusiness(store: Store, id: string): Promise<Business | undefined> {
  return (await store.getBusinessSettings(id)) ?? getDefaultBusiness(id);
}

// Pilotta tek bir WhatsApp numarası, WHATSAPP_BUSINESS_ID ile seçilen işletmeye bağlanır.
export function businessIdForPhoneNumber(phoneNumberId: string): string | undefined {
  const explicit = businesses.find((b) => b.whatsappPhoneNumberId === phoneNumberId);
  if (explicit) return explicit.id;
  if (phoneNumberId && phoneNumberId === process.env.WHATSAPP_PHONE_NUMBER_ID) {
    return process.env.WHATSAPP_BUSINESS_ID ?? businesses[0].id;
  }
  return undefined;
}

export function phoneNumberIdFor(business: Business): string | undefined {
  if (business.whatsappPhoneNumberId) return business.whatsappPhoneNumberId;
  const connectedId = process.env.WHATSAPP_BUSINESS_ID ?? businesses[0].id;
  return business.id === connectedId ? process.env.WHATSAPP_PHONE_NUMBER_ID : undefined;
}
