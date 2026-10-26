"use server";

import { cookies } from "next/headers";
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

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) return { error: "Kullanıcı adı ve şifre gerekli.", username };

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
  if (!token) return { error: "Kullanıcı adı veya şifre hatalı.", username };

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
