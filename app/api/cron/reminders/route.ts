import { refreshInstagramTokens } from "@/lib/instagram-tokens";
import { sendTomorrowReminders } from "@/lib/reminders";
import { getStore } from "@/lib/store";

// Vercel Cron her gün çağırır (vercel.json). Vercel isteğe CRON_SECRET'ı Bearer olarak ekler.
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const store = await getStore();
  // Üç iş birbirinden bağımsız; biri hata verse diğerleri çalışır.
  const results = await Promise.allSettled([
    sendTomorrowReminders({ store }),
    refreshInstagramTokens({ store }), // Instagram anahtarları 60 günde dolar
    store.forgetMessagesBefore(new Date(Date.now() - 7 * 86_400_000).toISOString()), // tekrar denetimi kayıtları
  ]);
  const [reminders, instagram, cleanup] = results;
  for (const r of results) if (r.status === "rejected") console.error("Günlük görev hatası:", r.reason);
  if (reminders.status === "fulfilled") {
    const report = reminders.value;
    console.info(`hatırlatma: ${report.sent} gönderildi, ${report.skipped.length} atlandı, ${report.failed.length} hata`);
  }
  const ok = results.every((r) => r.status === "fulfilled");
  return Response.json(
    {
      reminders: reminders.status === "fulfilled" ? reminders.value : { error: String(reminders.reason) },
      instagram: instagram.status === "fulfilled" ? instagram.value : { error: String(instagram.reason) },
      cleanup: cleanup.status,
    },
    { status: ok ? 200 : 500 },
  );
}
