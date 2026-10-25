import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { KeyedQueue } from "@/lib/keyed-queue";
import type { Database } from "@/lib/store-postgres";

// Testler için gömülü Postgres: gerçek şema, gerçek kısıtlar, sunucu gerektirmez.
export async function createTestDatabase(): Promise<Database & { close(): Promise<void> }> {
  const pg = new PGlite({ extensions: { btree_gist } });
  await pg.exec(await readFile(new URL("../lib/db/schema.sql", import.meta.url), "utf8"));
  const locks = new KeyedQueue(); // PGlite tek süreçte çalışır; kilit süreç içi kuyrukla eşdeğer.
  return {
    async query<T>(text: string, params?: unknown[]) {
      const result = await pg.query<T>(text, params);
      return result.rows;
    },
    withLock: (key, fn) => locks.run(key, fn),
    close: () => pg.close(),
  };
}
