import { createHmac, timingSafeEqual } from "node:crypto";

// Panel oturumu: imzalı çerez (veritabanına gitmeden doğrulanabilir; proxy.ts de kullanır).
// İçerik gizli değil, sadece değiştirilemez. Yetki kararı yine sunucuda verilir (lib/dal.ts).
export const SESSION_COOKIE = "oturum";
export const SESSION_DAYS = 7;

export interface SessionData {
  sub: string; // "admin" veya panel kullanıcısının kimliği
  name: string; // ekranda gösterilen kullanıcı adı
  businessId: string | null; // null = yönetici, tüm işletmeler
  exp: number; // saniye cinsinden bitiş
}

function secret(): string | undefined {
  const value = process.env.SESSION_SECRET || process.env.PANEL_PASSWORD;
  if (value) return value;
  return process.env.NODE_ENV === "production" ? undefined : "gelistirme-oturum-anahtari";
}

const sign = (payload: string, key: string) => createHmac("sha256", key).update(payload).digest("base64url");

export function createSessionToken(data: Omit<SessionData, "exp">, now = Date.now()): string {
  const key = secret();
  if (!key) throw new Error("SESSION_SECRET veya PANEL_PASSWORD tanımlı değil");
  const payload = Buffer.from(
    JSON.stringify({ ...data, exp: Math.floor(now / 1000) + SESSION_DAYS * 86400 }),
  ).toString("base64url");
  return `${payload}.${sign(payload, key)}`;
}

export function readSessionToken(token: string | undefined, now = Date.now()): SessionData | null {
  const key = secret();
  if (!token || !key) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload, key));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionData;
    return typeof data.exp === "number" && data.exp * 1000 > now ? data : null;
  } catch {
    return null;
  }
}
