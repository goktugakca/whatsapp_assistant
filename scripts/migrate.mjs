// Şemayı veritabanına uygular. Tekrar çalıştırmak güvenlidir.
// Kullanım: npm run db:migrate
// Şema değişiklikleri havuzsuz (direct) bağlantıyla yapılmalı; Neon bunu
// DATABASE_URL_UNPOOLED olarak verir. Yoksa DATABASE_URL kullanılır.
// --if-configured: veritabanı adresi yoksa hata vermeden atla (Vercel build'i için).
import { readFile } from "node:fs/promises";
import pg from "pg";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  if (process.argv.includes("--if-configured")) {
    console.log("Veritabanı adresi tanımlı değil; şema adımı atlandı.");
    process.exit(0);
  }
  console.error("DATABASE_URL_UNPOOLED veya DATABASE_URL tanımlı değil (.env.local dosyasına ekleyin).");
  process.exit(1);
}

const sql = await readFile(new URL("../lib/db/schema.sql", import.meta.url), "utf8");
const client = new pg.Client({
  connectionString: url.replace(/([?&])sslmode=(prefer|require|verify-ca)(?=&|$)/, "$1sslmode=verify-full"),
});
await client.connect();
try {
  await client.query(sql);
  console.log("Şema uygulandı.");
} finally {
  await client.end();
}
