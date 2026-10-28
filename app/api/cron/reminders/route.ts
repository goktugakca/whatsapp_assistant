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
  const report = await sendTomorrowReminders({ store });
  console.info(`hatırlatma: ${report.sent} gönderildi, ${report.skipped.length} atlandı, ${report.failed.length} hata`);
  // Aynı günlük görevde Instagram anahtarları da yenilenir (60 günde dolar).
  const instagram = await refreshInstagramTokens({ store });
  return Response.json({ ...report, instagram });
}
