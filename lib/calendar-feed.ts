import { createHmac, timingSafeEqual } from "node:crypto";

// İşletmenin Google Takvim / Apple Takvim'e abone olabileceği takvim linkinin anahtarı.
// Link tahmin edilemez olmalı; panel şifresinden (veya CALENDAR_FEED_SECRET'tan) türetilir.
// Şifre değişirse eski linkler geçersiz olur.
function secret(): string {
  return process.env.CALENDAR_FEED_SECRET || process.env.PANEL_PASSWORD || "gelistirme-ortami";
}

export function feedToken(businessId: string): string {
  return createHmac("sha256", secret()).update(`calendar-feed:${businessId}`).digest("hex").slice(0, 32);
}

export function isValidFeedToken(businessId: string, token: string): boolean {
  const expected = Buffer.from(feedToken(businessId));
  const received = Buffer.from(token);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
