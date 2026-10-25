import { connection } from "next/server";
import { getStore } from "@/lib/store";
import { PostgresStore } from "@/lib/store-postgres";

// Yayından sonra neyin bağlı olduğunu görmek için: GET /api/health
// Sadece durum bilgisi döner; hiçbir gizli değeri veya hata ayrıntısını göstermez.
export async function GET() {
  await connection();

  let database: "ok" | "memory" | "error" = "memory";
  let databaseError: string | undefined;
  try {
    const store = await getStore();
    if (store instanceof PostgresStore) {
      await store.ping();
      database = "ok";
    }
  } catch (error) {
    database = "error";
    databaseError = (error as { code?: string }).code ?? "unknown";
  }

  const checks = {
    database,
    databaseError,
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    whatsapp: Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_APP_SECRET && process.env.WHATSAPP_VERIFY_TOKEN,
    ),
    panelPassword: Boolean(process.env.PANEL_PASSWORD),
    region: process.env.VERCEL_REGION,
  };
  const healthy = database !== "error";
  return Response.json(checks, { status: healthy ? 200 : 503 });
}
