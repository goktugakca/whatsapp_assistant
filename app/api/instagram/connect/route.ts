import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { appUrl } from "@/lib/calendar";
import { assertBusinessAccess } from "@/lib/dal";
import { authorizeUrl, instagramAppConfig, STATE_COOKIE } from "@/lib/instagram";


// Panelden "Instagram'ı bağla": işletme sahibini Instagram'ın izin ekranına yönlendirir.
// state çerezi geri dönüşün bu tarayıcıdan ve bu işletme için başlatıldığını doğrular.
export async function GET(request: Request) {
  const businessId = new URL(request.url).searchParams.get("isletme") ?? "";
  try {
    await assertBusinessAccess(businessId);
  } catch {
    return new Response("Yetkisiz", { status: 401 });
  }
  const config = instagramAppConfig();
  const base = appUrl() ?? new URL(request.url).origin;
  if (!config) return Response.redirect(`${base}/panel/ayarlar?isletme=${businessId}&instagram=ayar-yok`, 303);

  const state = `${randomBytes(16).toString("base64url")}.${businessId}`;
  (await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 15 * 60,
    path: "/api/instagram",
  });
  return Response.redirect(
    authorizeUrl({ appId: config.appId, redirectUri: `${base}/api/instagram/callback`, state }),
    303,
  );
}
