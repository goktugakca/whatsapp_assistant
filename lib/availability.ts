import type { Clinic } from "./clinic";

// Tarih ve saatler kliniğin yerel saatinde "YYYY-MM-DD" / "HH:mm" olarak çalışılır,
// dışarıya ofsetli ISO metin olarak verilir (2026-10-27T10:00:00+03:00).

export interface BusyRange {
  start: string; // ISO
  end: string; // ISO
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

export function freeSlots(params: {
  clinic: Clinic;
  date: string;
  durationMinutes: number;
  busy: BusyRange[];
  now?: Date;
}): string[] {
  const { clinic, date, durationMinutes, busy } = params;
  if (!DATE_RE.test(date)) return [];
  const hours = clinic.workingHours.find((h) => h.day === weekdayOf(date));
  if (!hours) return [];

  const now = (params.now ?? new Date()).getTime();
  const busyMs = busy.map((b) => [Date.parse(b.start), Date.parse(b.end)] as const);
  const open = toMinutes(hours.open);
  const close = toMinutes(hours.close);
  const slots: string[] = [];

  for (let t = open; t + durationMinutes <= close; t += clinic.slotMinutes) {
    const start = localIso(date, t, clinic.utcOffset);
    const startMs = Date.parse(start);
    const endMs = startMs + durationMinutes * 60_000;
    if (startMs <= now) continue;
    if (busyMs.some(([bs, be]) => startMs < be && bs < endMs)) continue;
    slots.push(start);
  }
  return slots;
}

// Modele "bugün" bilgisini kliniğin yerel saatiyle vermek için.
export function describeNow(clinic: Clinic, now = new Date()): string {
  const sign = clinic.utcOffset.startsWith("-") ? -1 : 1;
  const [oh, om] = clinic.utcOffset.slice(1).split(":").map(Number);
  const local = new Date(now.getTime() + sign * (oh * 60 + om) * 60_000);
  const days = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
  const date = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
  const time = `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
  return `${date} ${days[local.getUTCDay()]} ${time} (klinik yerel saati, UTC${clinic.utcOffset})`;
}
