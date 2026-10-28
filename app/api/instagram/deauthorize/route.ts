import { parseSignedRequest } from "@/lib/instagram";
import { getStore } from "@/lib/store";

// İşletme Instagram ayarlarından uygulamanın erişimini kaldırınca Meta buraya bildirir;
// bağlantı ve erişim anahtarı silinir.
export async function POST(request: Request) {
  const secret = process.env.INSTAGRAM_APP_SECRET;
  const signed = String((await request.formData()).get("signed_request") ?? "");
  const data = secret ? parseSignedRequest(signed, secret) : null;
  if (!data?.user_id) return new Response("Bad request", { status: 400 });
  const store = await getStore();
  const account = await store.findInstagramAccount(String(data.user_id));
  if (account) await store.deleteInstagramAccount(account.businessId);
  return new Response("OK", { status: 200 });
}
