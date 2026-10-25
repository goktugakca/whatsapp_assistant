import type { Business, Staff, WorkingHours } from "./business";

// Tarih ve saatler işletmenin yerel saatinde "YYYY-MM-DD" / "HH:mm" olarak çalışılır,
// dışarıya ofsetli ISO metin olarak verilir (2026-10-27T10:00:00+03:00).

// Çalışanı olmayan işletmeler tek bir takvim gibi davranır; bu sahte kaynak kimliği onu temsil eder.
export const SINGLE_RESOURCE = "_";

export interface BusyRange {
  start: string; // ISO
  end: string; // ISO
  staffId?: string; // Yoksa SINGLE_RESOURCE
}

export interface Slot {
  start: string;
  staffIds: string[]; // Bu saatte hizmeti verebilecek boş çalışanlar
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function localIso(date: string, minutes: number, utcOffset: string): string {
  return `${date}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00${utcOffset}`;
}

// Takvim günündeki haftanın günü; saat diliminden bağımsız.
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Hizmeti verebilen kaynaklar: çalışan tanımlıysa o hizmeti yapanlar, değilse tek takvim.
export function resourcesFor(
  business: Business,
  serviceId: string,
  staffId?: string,
): Pick<Staff, "id" | "workingHours">[] {
  if (business.staff.length === 0) return [{ id: SINGLE_RESOURCE }];
  return business.staff.filter((s) => s.serviceIds.includes(serviceId) && (!staffId || s.id === staffId));
}

export function freeSlots(params: {
  business: Business;
  date: string;
  serviceId: string;
  staffId?: string; // Belirli bir çalışan istenirse
  busy: BusyRange[];
  now?: Date;
}): Slot[] {
  const { business, date, busy } = params;
  if (!DATE_RE.test(date)) return [];
  const service = business.services.find((s) => s.id === params.serviceId);
  if (!service) return [];

  const weekday = weekdayOf(date);
  const businessHours = business.workingHours.find((h) => h.day === weekday);
  if (!businessHours) return [];

  const now = (params.now ?? new Date()).getTime();
  const durationMs = service.durationMinutes * 60_000;
  const resources = resourcesFor(business, service.id, params.staffId).flatMap((r) => {
    const hours: WorkingHours | undefined = r.workingHours
      ? r.workingHours.find((h) => h.day === weekday)
      : businessHours;
    if (!hours) return [];
    const busyMs = busy
      .filter((b) => (b.staffId ?? SINGLE_RESOURCE) === r.id)
      .map((b) => [Date.parse(b.start), Date.parse(b.end)] as const);
    return [{ id: r.id, open: toMinutes(hours.open), close: toMinutes(hours.close), busyMs }];
  });

  const slots: Slot[] = [];
  const open = toMinutes(businessHours.open);
  const close = toMinutes(businessHours.close);
  for (let t = open; t + service.durationMinutes <= close; t += business.slotMinutes) {
    const start = localIso(date, t, business.utcOffset);
    const startMs = Date.parse(start);
    if (startMs <= now) continue;
    const endMs = startMs + durationMs;
    const staffIds = resources
      .filter((r) => t >= r.open && t + service.durationMinutes <= r.close)
      .filter((r) => !r.busyMs.some(([bs, be]) => startMs < be && bs < endMs))
      .map((r) => r.id);
    if (staffIds.length > 0) slots.push({ start, staffIds });
  }
  return slots;
}

// Modele "şu an" bilgisini işletmenin yerel saatiyle vermek için.
export function describeNow(business: Business, now = new Date()): string {
  const sign = business.utcOffset.startsWith("-") ? -1 : 1;
  const [oh, om] = business.utcOffset.slice(1).split(":").map(Number);
  const local = new Date(now.getTime() + sign * (oh * 60 + om) * 60_000);
  const days = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
  const date = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
  const time = `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
  return `${date} ${days[local.getUTCDay()]} ${time} (işletmenin yerel saati, UTC${business.utcOffset})`;
}
