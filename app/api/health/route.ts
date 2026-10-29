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
    instagram: Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET),
    panelPassword: Boolean(process.env.PANEL_PASSWORD),
    // Üretimde her biri ayrı tanımlı olmalı; yoksa PANEL_PASSWORD'den türetilir ve şifre
    // değişince oturumlar, takvim bağlantıları ve Instagram bağlantıları birlikte kırılır.
    separateSecrets: Boolean(process.env.SESSION_SECRET && process.env.INSTAGRAM_TOKEN_KEY && process.env.CALENDAR_FEED_SECRET),
    region: process.env.VERCEL_REGION,
  };
  const healthy = database !== "error";
  return Response.json(checks, { status: healthy ? 200 : 503 });
}
