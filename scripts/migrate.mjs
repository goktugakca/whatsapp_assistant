// Şemayı veritabanına uygular. Tekrar çalıştırmak güvenlidir.
// Kullanım: npm run db:migrate
// Şema değişiklikleri havuzsuz (direct) bağlantıyla yapılmalı; Neon bunu
// DATABASE_URL_UNPOOLED olarak verir. Yoksa DATABASE_URL kullanılır.
import { readFile } from "node:fs/promises";
import pg from "pg";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_UNPOOLED veya DATABASE_URL tanımlı değil (.env.local dosyasına ekleyin).");
  process.exit(1);
}

const sql = await readFile(new URL("../lib/db/schema.sql", import.meta.url), "utf8");
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(sql);
  console.log("Şema uygulandı.");
} finally {
  await client.end();
}
