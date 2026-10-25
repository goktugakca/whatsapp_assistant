import { NextResponse, type NextRequest } from "next/server";
import { isPanelAuthorized } from "@/lib/panel-auth";

// Klinik paneli için basit parola koruması (HTTP Basic Auth). Pilot aşaması için yeterli;
// birden fazla klinik geldiğinde gerçek kullanıcı girişine geçilecek.
export function proxy(request: NextRequest) {
  if (isPanelAuthorized(request.headers.get("authorization"))) return NextResponse.next();

  return new NextResponse("Giriş gerekli", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Klinik Paneli", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/panel/:path*"],
};
