import { randomBytes } from "node:crypto";
import { appUrl } from "@/lib/calendar";
import { parseSignedRequest } from "@/lib/instagram";
import { getStore } from "@/lib/store";

// Meta'nın "verilerimi sil" isteği: işletme hesabının bağlantısı ve anahtarı hemen silinir.
// Müşteri yazışmaları salonun kaydıdır; silme talebi gizlilik sayfasındaki yolla salona iletilir.
export async function POST(request: Request) {
  const secret = process.env.INSTAGRAM_APP_SECRET;
  const signed = String((await request.formData()).get("signed_request") ?? "");
  const data = secret ? parseSignedRequest(signed, secret) : null;
  if (!data?.user_id) return new Response("Bad request", { status: 400 });
  const store = await getStore();
  const account = await store.findInstagramAccount(String(data.user_id));
  if (account) await store.deleteInstagramAccount(account.businessId);
  const code = randomBytes(8).toString("hex");
  return Response.json({ url: `${appUrl() ?? new URL(request.url).origin}/gizlilik#veri-silme`, confirmation_code: code });
}
