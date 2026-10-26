import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { describe, expect, it } from "vitest";

// Canlıdaki veritabanı eski şemayla kuruldu; yeni şema onun üzerine hatasız ve tekrar
// tekrar uygulanabilmeli (her Vercel yayınında çalışıyor).
const OLD_APPOINTMENTS = `
create extension if not exists btree_gist;
create table conversations (id uuid primary key, business_id text not null, channel text not null,
  contact text not null, contact_name text, status text not null default 'bot', handoff_reason text,
  lead jsonb, history jsonb not null default '[]'::jsonb, transcript jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (business_id, channel, contact));
create table appointments (id uuid primary key, business_id text not null,
  conversation_id uuid not null references conversations (id) on delete cascade,
  customer_name text not null, contact text not null, service_id text not null, staff_id text,
  resource text generated always as (coalesce(staff_id, '_')) stored,
  start_at timestamptz not null, end_at timestamptz not null, created_at timestamptz not null default now(),
  check (end_at > start_at),
  constraint appointments_no_overlap exclude using gist (business_id with =, resource with =, tstzrange(start_at, end_at) with &&));
`;

describe("şema geçişi", () => {
  it("eski şemanın üzerine iki kez uygulanır, eski randevuyu korur ve iptali destekler", async () => {
    const pg = new PGlite({ extensions: { btree_gist } });
    await pg.exec(OLD_APPOINTMENTS);
    await pg.exec(`insert into conversations (id, business_id, channel, contact) values
      ('00000000-0000-0000-0000-000000000001', 'b', 'demo', 'x');
      insert into appointments (id, business_id, conversation_id, customer_name, contact, service_id, staff_id, start_at, end_at)
      values ('00000000-0000-0000-0000-0000000000a1', 'b', '00000000-0000-0000-0000-000000000001', 'Ali', 'x', 's', 'm',
        '2026-10-26T10:00:00+03:00', '2026-10-26T10:30:00+03:00');`);

    const schema = await readFile(new URL("../lib/db/schema.sql", import.meta.url), "utf8");
    await pg.exec(schema);
    await pg.exec(schema);

    const old = await pg.query<{ source: string }>("select source from appointments");
    expect(old.rows).toEqual([{ source: "assistant" }]);

    const insert = `insert into appointments (id, business_id, customer_name, contact, service_id, staff_id, start_at, end_at, source)
      values ($1, 'b', 'Veli', 'y', 's', 'm', '2026-10-26T10:00:00+03:00', '2026-10-26T10:30:00+03:00', 'panel')`;
    await expect(pg.query(insert, ["00000000-0000-0000-0000-0000000000a2"])).rejects.toMatchObject({ code: "23P01" });

    await pg.exec("update appointments set cancelled_at = now()");
    await pg.query(insert, ["00000000-0000-0000-0000-0000000000a3"]); // iptal sonrası saat boş, sohbet yok

    const constraints = await pg.query<{ conname: string }>(
      "select conname from pg_constraint where conname like 'appointments_no_overlap%'",
    );
    expect(constraints.rows.map((r) => r.conname)).toEqual(["appointments_no_overlap_active"]);
    await pg.close();
  }, 30_000); // Gömülü Postgres'in açılışı birkaç saniye sürüyor
});
