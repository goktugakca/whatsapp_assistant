"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { timingSafeEqual } from "node:crypto";
import { verifyPassword } from "@/lib/password";
import { createSessionToken, SESSION_COOKIE, SESSION_DAYS } from "@/lib/session";
import { getStore } from "@/lib/store";

// Hata durumunda form sıfırlanınca kullanıcı adı kaybolmasın (şifre bilerek geri verilmez).
export type LoginState = { error: string; username?: string } | null;

function safeEqual(a: string, b: string): boolean {
  const [x, y] = [Buffer.from(a), Buffer.from(b)];
  return x.length === y.length && timingSafeEqual(x, y);
}

// Sadece site içi adreslere geri dön (açık yönlendirmeyi önlemek için).
function safeNext(value: FormDataEntryValue | null): string {
  const next = String(value ?? "");
  return next.startsWith("/panel") ? next : "/panel";
}

// Kaba kuvvet freni (süreç belleğinde): aynı kullanıcı adı + IP için 15 dakikada 5 hatalı
// denemeden sonra kilit. Sunucusuz ortamda örnek başına tutulur; yine de otomatik denemeyi
// pratikte işe yaramaz hale getirir.
const FAIL_WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;
const failures = new Map<string, number[]>();
const failKey = (username: string, ip: string) => `${username}@${ip}`;
function recentFailures(key: string): number[] {
  const now = Date.now();
  const list = (failures.get(key) ?? []).filter((t) => now - t < FAIL_WINDOW_MS);
  if (list.length === 0) failures.delete(key);
  else failures.set(key, list);
  return list;
}
function isLockedOut(username: string, ip: string): boolean {
  return recentFailures(failKey(username, ip)).length >= MAX_FAILURES;
}
function recordFailure(username: string, ip: string) {
  const key = failKey(username, ip);
  failures.set(key, [...recentFailures(key), Date.now()]);
  if (failures.size > 5000) failures.clear();
}
function clearFailures(username: string, ip: string) {
  failures.delete(failKey(username, ip));
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) return { error: "Kullanıcı adı ve şifre gerekli.", username };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "?";
  if (isLockedOut(username, ip)) {
    return { error: "Çok fazla başarısız deneme. 15 dakika sonra tekrar deneyin.", username };
  }

  let token: string | undefined;
  const adminPassword = process.env.PANEL_PASSWORD;
  if (username === "admin") {
    if (adminPassword && safeEqual(password, adminPassword)) {
      token = createSessionToken({ sub: "admin", name: "admin", businessId: null });
    }
  } else {
    const user = await (await getStore()).findPanelUserByUsername(username);
    if (user && (await verifyPassword(password, user.passwordHash))) {
      token = createSessionToken({ sub: user.id, name: user.username, businessId: user.businessId });
    }
  }
  // Hangi bilginin yanlış olduğunu söylemiyoruz.
  if (!token) {
    recordFailure(username, ip);
    return { error: "Kullanıcı adı veya şifre hatalı.", username };
  }
  clearFailures(username, ip);

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  redirect(safeNext(formData.get("next")));
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/giris");
}
