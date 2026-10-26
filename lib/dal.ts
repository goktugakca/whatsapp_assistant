import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { businesses } from "./business";
import { readSessionToken, SESSION_COOKIE, type SessionData } from "./session";
import { getStore } from "./store";

// Panelin yetki katmanı: her panel sayfası ve işlemi veriye erişmeden önce buradan geçer.
// proxy.ts sadece çerezin varlığına bakar; asıl karar burada verilir.

export type PanelSession = SessionData & { isAdmin: boolean };

export async function getSession(): Promise<PanelSession | null> {
  // Geliştirme ortamında panel şifresi tanımlı değilse panel açıktır (yönetici gibi).
  if (process.env.NODE_ENV !== "production" && !process.env.PANEL_PASSWORD) {
    return { sub: "admin", name: "admin", businessId: null, exp: Infinity, isAdmin: true };
  }
  const data = readSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!data) return null;
  if (data.businessId === null) return data.sub === "admin" ? { ...data, isAdmin: true } : null;

  // İşletme kullanıcısı silinmiş veya başka işletmeye taşınmışsa oturum geçersiz.
  const user = await (await getStore()).getPanelUser(data.sub);
  if (!user || user.businessId !== data.businessId) return null;
  return { ...data, isAdmin: false };
}

export async function requireSession(): Promise<PanelSession> {
  const session = await getSession();
  if (!session) redirect("/giris");
  return session;
}

export async function requireAdmin(): Promise<PanelSession> {
  const session = await requireSession();
  if (!session.isAdmin) redirect("/panel");
  return session;
}

// Sayfalar için: istenen işletme kullanıcının erişebileceği değilse kendi işletmesi gösterilir.
export async function resolvePanelBusiness(requested: unknown): Promise<{ session: PanelSession; businessId: string }> {
  const session = await requireSession();
  if (!session.isAdmin) return { session, businessId: session.businessId! };
  const id = typeof requested === "string" && businesses.some((b) => b.id === requested) ? requested : businesses[0].id;
  return { session, businessId: id };
}

// İşlemler (server action) için: yetkisizse hata fırlatır.
export async function assertBusinessAccess(businessId: string): Promise<PanelSession> {
  const session = await getSession();
  if (!session || (!session.isAdmin && session.businessId !== businessId)) throw new Error("Yetkisiz");
  return session;
}

export function visibleBusinesses(session: PanelSession) {
  return session.isAdmin ? businesses : businesses.filter((b) => b.id === session.businessId);
}
