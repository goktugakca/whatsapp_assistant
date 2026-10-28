import { cookies } from "next/headers";
import { appUrl } from "@/lib/calendar";
import { assertBusinessAccess } from "@/lib/dal";
import { connectAccount, instagramAppConfig, sealToken, STATE_COOKIE } from "@/lib/instagram";
import { getStore } from "@/lib/store";

// Instagram izin ekranından dönüş: kodu uzun ömürlü anahtara çevirip işletmeye bağlar.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = appUrl() ?? url.origin;
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  jar.delete({ name: STATE_COOKIE, path: "/api/instagram" });

  const state = url.searchParams.get("state") ?? "";
  const businessId = state.split(".")[1] ?? "";
  const back = (result: string) =>
    Response.redirect(`${base}/panel/ayarlar?isletme=${encodeURIComponent(businessId)}&instagram=${result}#instagram`, 303);

  if (!expected || expected !== state) return back("hata");
  try {
    await assertBusinessAccess(businessId);
  } catch {
    return new Response("Yetkisiz", { status: 401 });
  }
  const code = url.searchParams.get("code");
  if (!code) return back("iptal"); // Kullanıcı izin vermedi
  const config = instagramAppConfig();
  if (!config) return back("ayar-yok");

  try {
    const account = await connectAccount({ code, redirectUri: `${base}/api/instagram/callback`, ...config });
    await (await getStore()).saveInstagramAccount({
      businessId,
      accountId: account.accountId,
      username: account.username,
      sealedToken: sealToken(account.token),
      tokenExpiresAt: account.expiresAt,
      connectedAt: new Date().toISOString(),
    });
    return back("bagli");
  } catch (error) {
    console.error("Instagram bağlanamadı:", error);
    return back("hata");
  }
}
