import type { Business } from "./business";
import type { Appointment } from "./store";

// Randevunun müşteriye ve takvim uygulamalarına gösterilen hali.
export interface AppointmentCard {
  id: string;
  businessName: string;
  serviceName: string;
  staffName?: string;
  customerName: string;
  start: string; // ISO
  end: string; // ISO
  priceInfo?: string;
  address: string;
  mapsUrl?: string;
}

export function toCard(business: Business, appointment: Appointment): AppointmentCard {
  const service = business.services.find((s) => s.id === appointment.serviceId);
  return {
    id: appointment.id,
    businessName: business.name,
    serviceName: service?.name ?? appointment.serviceId,
    staffName: business.staff.find((s) => s.id === appointment.staffId)?.name,
    customerName: appointment.customerName,
    start: appointment.start,
    end: appointment.end,
    priceInfo: service?.priceInfo,
    address: business.address,
    mapsUrl: business.mapsUrl,
  };
}

// Uygulamanın herkese açık adresi: WhatsApp mesajlarına ve takvim etkinliklerine konan
// bağlantılar için. Vercel bunu VERCEL_PROJECT_PRODUCTION_URL olarak kendisi verir.
export function appUrl(): string | undefined {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return undefined;
}

const icsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function title(card: AppointmentCard): string {
  return `${card.serviceName} · ${card.businessName}`;
}

function details(card: AppointmentCard): string {
  return [
    card.staffName && `Çalışan: ${card.staffName}`,
    card.priceInfo && `Fiyat: ${card.priceInfo}`,
    card.mapsUrl && `Harita: ${card.mapsUrl}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// Google Takvim'in "etkinlik ekle" sayfası; giriş veya entegrasyon gerektirmez.
export function googleCalendarUrl(card: AppointmentCard): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title(card),
    dates: `${icsDate(card.start)}/${icsDate(card.end)}`,
    details: details(card),
    location: card.address,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

export function outlookCalendarUrl(card: AppointmentCard): string {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: title(card),
    startdt: new Date(card.start).toISOString(),
    enddt: new Date(card.end).toISOString(),
    body: details(card),
    location: card.address,
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params}`;
}

// RFC 5545 metin kaçışları ve 75 baytlık satır katlama. (Bu dosya tarayıcıda da
// kullanıldığı için Buffer yerine TextEncoder.)
const utf8Length = (text: string) => new TextEncoder().encode(text).length;

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function fold(line: string): string {
  if (utf8Length(line) <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const char of line) {
    const size = utf8Length(char);
    const limit = parts.length === 0 ? 75 : 74; // devam satırları bir boşlukla başlar
    if (currentBytes + size > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export interface CalendarEvent {
  uid: string;
  start: string;
  end: string;
  summary: string;
  description?: string;
  location?: string;
}

export function toIcs(calendarName: string, events: CalendarEvent[], now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Randevu Asistani//TR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${icsDate(now.toISOString())}`,
      `DTSTART:${icsDate(e.start)}`,
      `DTEND:${icsDate(e.end)}`,
      `SUMMARY:${escapeText(e.summary)}`,
      ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
      ...(e.location ? [`LOCATION:${escapeText(e.location)}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function cardToEvent(card: AppointmentCard): CalendarEvent {
  return {
    uid: `${card.id}@randevu-asistani`,
    start: card.start,
    end: card.end,
    summary: title(card),
    description: details(card),
    location: card.address,
  };
}
