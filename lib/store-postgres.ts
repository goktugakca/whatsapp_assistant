import { randomUUID } from "node:crypto";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import type {
  Appointment,
  Conversation,
  ConversationKey,
  Store,
  WaitlistEntry,
} from "./store";
import { conversationLockKey } from "./store";

// Store'un ihtiyaç duyduğu en küçük veritabanı arayüzü. Üretimde node-postgres,
// testlerde gömülü PGlite ile karşılanır.
export interface Database {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  // Aynı anahtar için tüm sunucular arasında karşılıklı dışlama (advisory lock).
  withLock<T>(key: string, fn: () => Promise<T>): Promise<T>;
}

export function createPgDatabase(connectionString: string): Database {
  // Sunucusuz ortamda her örnek kendi havuzunu açar; Neon'un havuzlanmış (-pooler)
  // adresini (DATABASE_URL) kullanın.
  const pool = new Pool({ connectionString, max: 5 });
  // Vercel Fluid compute'ta boşta kalan bağlantıların fonksiyon askıya alınmadan önce
  // düzgün kapanmasını sağlar; Vercel dışında etkisizdir.
  attachDatabasePool(pool);
  return {
    async query<T>(text: string, params?: unknown[]) {
      const result = await pool.query(text, params);
      return result.rows as T[];
    },
    async withLock<T>(key: string, fn: () => Promise<T>) {
      // İşlem (transaction) seviyesinde kilit: PgBouncer'ın transaction modunda da tek bir
      // sunucu bağlantısında kalır ve işlem bitince kendiliğinden bırakılır. fn çalışırken
      // bu bağlantı açık bir işlemde bekler; fn'in sorguları havuzdaki diğer bağlantıları kullanır.
      const client = await pool.connect();
      let ok = false;
      try {
        await client.query("begin");
        await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [key]);
        const result = await fn();
        ok = true;
        return result;
      } finally {
        await client.query(ok ? "commit" : "rollback").catch(() => {});
        client.release();
      }
    },
  };
}

const EXCLUSION_VIOLATION = "23P01";
const DEADLOCK = "40P01";

type Row = Record<string, unknown>;

const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : String(value));
const opt = (value: unknown) => (value === null || value === undefined ? undefined : String(value));

function toConversation(r: Row): Conversation {
  return {
    id: String(r.id),
    businessId: String(r.business_id),
    channel: r.channel as Conversation["channel"],
    contact: String(r.contact),
    contactName: opt(r.contact_name),
    status: r.status as Conversation["status"],
    handoffReason: opt(r.handoff_reason),
    lead: (r.lead as Conversation["lead"]) ?? undefined,
    history: r.history as Conversation["history"],
    transcript: r.transcript as Conversation["transcript"],
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

function toAppointment(r: Row): Appointment {
  return {
    id: String(r.id),
    businessId: String(r.business_id),
    conversationId: String(r.conversation_id),
    customerName: String(r.customer_name),
    contact: String(r.contact),
    serviceId: String(r.service_id),
    staffId: opt(r.staff_id),
    start: iso(r.start_at),
    end: iso(r.end_at),
    createdAt: iso(r.created_at),
  };
}

function toWaitlistEntry(r: Row): WaitlistEntry {
  return {
    id: String(r.id),
    businessName: String(r.business_name),
    businessType: opt(r.business_type),
    contactName: String(r.contact_name),
    phone: String(r.phone),
    city: opt(r.city),
    createdAt: iso(r.created_at),
  };
}

export class PostgresStore implements Store {
  constructor(private db: Database) {}

  // Bağlantıyı ve şemanın kurulu olduğunu doğrular (/api/health).
  async ping() {
    await this.db.query("select 1 from conversations limit 1");
  }

  async findOrCreateConversation(input: ConversationKey & { contactName?: string }) {
    const [row] = await this.db.query<Row>(
      `insert into conversations (id, business_id, channel, contact, contact_name)
       values ($1, $2, $3, $4, $5)
       on conflict (business_id, channel, contact)
       do update set contact_name = coalesce(conversations.contact_name, excluded.contact_name)
       returning *`,
      [randomUUID(), input.businessId, input.channel, input.contact, input.contactName ?? null],
    );
    return toConversation(row);
  }

  async getConversation(id: string) {
    const [row] = await this.db.query<Row>("select * from conversations where id = $1", [id]);
    return row ? toConversation(row) : undefined;
  }

  async saveConversation(c: Conversation) {
    c.updatedAt = new Date().toISOString();
    await this.db.query(
      `update conversations set
         contact_name = $2, status = $3, handoff_reason = $4, lead = $5,
         history = $6, transcript = $7, updated_at = $8
       where id = $1`,
      [
        c.id,
        c.contactName ?? null,
        c.status,
        c.handoffReason ?? null,
        c.lead ? JSON.stringify(c.lead) : null,
        JSON.stringify(c.history),
        JSON.stringify(c.transcript),
        c.updatedAt,
      ],
    );
  }

  async listConversations(businessId: string) {
    const rows = await this.db.query<Row>(
      "select * from conversations where business_id = $1 order by updated_at desc limit 200",
      [businessId],
    );
    return rows.map(toConversation);
  }

  async listAppointments(businessId: string) {
    const rows = await this.db.query<Row>(
      "select * from appointments where business_id = $1 order by start_at",
      [businessId],
    );
    return rows.map(toAppointment);
  }

  async addAppointmentIfFree(input: Omit<Appointment, "id" | "createdAt">) {
    // Kilit (insertAppointment) deadlock'u pratikte önler; yine de Postgres bir isteği
    // deadlock ile iptal ederse yeniden denenir: ya eklenir ya da çakışma döner.
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.insertAppointment(input);
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === EXCLUSION_VIOLATION) return null;
        if (code === DEADLOCK && attempt < 5) {
          await new Promise((r) => setTimeout(r, 10 + Math.random() * 40 * attempt));
          continue;
        }
        throw error;
      }
    }
  }

  private async insertAppointment(input: Omit<Appointment, "id" | "createdAt">) {
    // Aynı işletme + kaynak için eklemeler, deyim bitene kadar tutulan bir kilitle sıraya
    // girer: ikinci istek birincinin kaydını görür ve deadlock yerine çakışma hatası alır.
    const [row] = await this.db.query<Row>(
      `with lock as (select pg_advisory_xact_lock(hashtextextended($2 || ':' || coalesce($7, '_'), 0)))
       insert into appointments
         (id, business_id, conversation_id, customer_name, contact, service_id, staff_id, start_at, end_at)
       select $1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz from lock
       returning *`,
      [
        randomUUID(),
        input.businessId,
        input.conversationId,
        input.customerName,
        input.contact,
        input.serviceId,
        input.staffId ?? null,
        input.start,
        input.end,
      ],
    );
    return toAppointment(row);
  }

  async markMessageSeen(messageId: string) {
    const rows = await this.db.query(
      "insert into processed_messages (id) values ($1) on conflict do nothing returning id",
      [messageId],
    );
    return rows.length === 1;
  }

  async addWaitlistEntry(input: Omit<WaitlistEntry, "id" | "createdAt">) {
    const [row] = await this.db.query<Row>(
      `insert into waitlist (id, business_name, business_type, contact_name, phone, city)
       values ($1, $2, $3, $4, $5, $6) returning *`,
      [randomUUID(), input.businessName, input.businessType ?? null, input.contactName, input.phone, input.city ?? null],
    );
    return toWaitlistEntry(row);
  }

  async listWaitlist() {
    const rows = await this.db.query<Row>("select * from waitlist order by created_at desc limit 200");
    return rows.map(toWaitlistEntry);
  }

  withConversationLock<T>(key: ConversationKey, fn: () => Promise<T>): Promise<T> {
    return this.db.withLock(`conversation:${conversationLockKey(key)}`, fn);
  }
}
