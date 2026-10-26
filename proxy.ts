import { NextResponse, type NextRequest } from "next/server";
import { readSessionToken, SESSION_COOKIE } from "@/lib/session";

// Panel sayfalarına girişsiz gelen kullanıcıyı giriş sayfasına yönlendirir. Bu sadece hızlı
// bir ön kontrol (çerez imzası); hangi işletmeyi görebileceğine lib/dal.ts karar verir.
export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV !== "production" && !process.env.PANEL_PASSWORD) return NextResponse.next();
  if (readSessionToken(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  const login = new URL("/giris", request.url);
  login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/panel/:path*"],
};
