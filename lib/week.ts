// Haftalık takvim için tarih yardımcıları. Günler işletmenin yerel saatine göre
// "YYYY-MM-DD" metni olarak tutulur; saat dilimi sabit ofsetlidir (Türkiye UTC+3).

function offsetMinutes(utcOffset: string): number {
  const sign = utcOffset.startsWith("-") ? -1 : 1;
  const [h, m] = utcOffset.slice(1).split(":").map(Number);
  return sign * (h * 60 + m);
}

const pad = (n: number) => String(n).padStart(2, "0");

function fromUtcDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function toUtcDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toUtcDate(value).getTime());
}

// Verilen anın işletmenin yerel takvimindeki günü.
export function localDate(at: Date | string, utcOffset: string): string {
  const ms = new Date(at).getTime() + offsetMinutes(utcOffset) * 60_000;
  return fromUtcDate(new Date(ms));
}

// Verilen anın yerel gün içindeki dakikası (00:00 = 0).
export function localMinutes(at: Date | string, utcOffset: string): number {
  const ms = new Date(at).getTime() + offsetMinutes(utcOffset) * 60_000;
  const d = new Date(ms);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function addDays(date: string, days: number): string {
  const d = toUtcDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtcDate(d);
}

// Haftanın Pazartesi günü.
export function mondayOf(date: string): string {
  const weekday = toUtcDate(date).getUTCDay(); // 0 = Pazar
  return addDays(date, weekday === 0 ? -6 : 1 - weekday);
}

export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}
