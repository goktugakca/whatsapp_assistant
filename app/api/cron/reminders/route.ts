import { sendTomorrowReminders } from "@/lib/reminders";
import { getStore } from "@/lib/store";

// Vercel Cron her gün çağırır (vercel.json). Vercel isteğe CRON_SECRET'ı Bearer olarak ekler.
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const report = await sendTomorrowReminders({ store: await getStore() });
  console.info(`hatırlatma: ${report.sent} gönderildi, ${report.skipped.length} atlandı, ${report.failed.length} hata`);
  return Response.json(report);
}
