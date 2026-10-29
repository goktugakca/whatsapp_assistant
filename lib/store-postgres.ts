import { randomUUID } from "node:crypto";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import type {
  InstagramAccount,
  PhotoQuoteEval,
  Appointment,
  Media,
  NewAppointment,
  NewPriceExample,
  PriceExample,
  PanelUser,
  Conversation,
  ConversationKey,
  Store,
  WaitlistEntry,
} from "./store";
import type { Business } from "./business";
import { conversationLockKey } from "./store";

// Store'un ihtiyaç duyduğu en küçük veritabanı arayüzü. Üretimde node-postgres,
// testlerde gömülü PGlite ile karşılanır.
export interface Database {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  // Aynı anahtar için tüm sunucular arasında karşılıklı dışlama (advisory lock).
  withLock<T>(key: string, fn: () => Promise<T>): Promise<T>;
}

// Neon adresleri sslmode=require ile gelir; pg bunu zaten verify-full gibi uygular ama her
// bağlantıda uyarı basar. Aynı davranışı açıkça istemek uyarıyı susturur.
export function withExplicitSslMode(url: string): string {
  return url.replace(/([?&])sslmode=(prefer|require|verify-ca)(?=&|$)/, "$1sslmode=verify-full");
}

export function createPgDatabase(url: string): Database {
  const connectionString = withExplicitSslMode(url);
  // Sunucusuz ortamda her örnek kendi havuzunu açar; Neon'un havuzlanmış (-pooler)
  // adresini (DATABASE_URL) kullanın.
  // Sorgular için havuz; bağlantı 10 sn içinde alınamazsa hata (sonsuza kadar beklemek yerine).
  const pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 10_000 });
  // Konuşma kilitleri ayrı havuzda: kilit, asistan turu boyunca (model çağrıları dahil) bir
  // bağlantıyı açık işlemde tutar. Aynı havuzdan olsaydı aynı anda 5 konuşma tüm bağlantıları
  // kilitte tutar, sorgular bağlantı bulamaz ve her şey asılı kalırdı.
  const lockPool = new Pool({ connectionString, max: 20, connectionTimeoutMillis: 10_000 });
  // Vercel Fluid compute'ta boşta kalan bağlantıların fonksiyon askıya alınmadan önce
  // düzgün kapanmasını sağlar; Vercel dışında etkisizdir.
  attachDatabasePool(pool);
  attachDatabasePool(lockPool);
  return {
    async query<T>(text: string, params?: unknown[]) {
      const result = await pool.query(text, params);
      return result.rows as T[];
    },
    async withLock<T>(key: string, fn: () => Promise<T>) {
      // İşlem (transaction) seviyesinde kilit: PgBouncer'ın transaction modunda da tek bir
      // sunucu bağlantısında kalır ve işlem bitince kendiliğinden bırakılır. fn çalışırken
      // bu bağlantı açık bir işlemde bekler; fn'in sorguları havuzdaki diğer bağlantıları kullanır.
      const client = await lockPool.connect();
      let ok = false;
      try {
        await client.query("begin");
        // Kilit en fazla 50 sn beklenir (önceki tur takılı kaldıysa sonsuza kadar beklemesin).
        await client.query("set local lock_timeout = '50s'");
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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
    conversationId: opt(r.conversation_id),
    source: (r.source as Appointment["source"]) ?? "assistant",
    customerName: String(r.customer_name),
    contact: String(r.contact),
    serviceId: String(r.service_id),
    staffId: opt(r.staff_id),
    start: iso(r.start_at),
    end: iso(r.end_at),
    createdAt: iso(r.created_at),
    cancelledAt: r.cancelled_at ? iso(r.cancelled_at) : undefined,
    reminderSentAt: r.reminder_sent_at ? iso(r.reminder_sent_at) : undefined,
  };
}

function toPanelUser(r: Row): PanelUser {
  return {
    id: String(r.id),
    username: String(r.username),
    passwordHash: String(r.password_hash),
    businessId: String(r.business_id),
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
      "select * from appointments where business_id = $1 and cancelled_at is null order by start_at",
      [businessId],
    );
    return rows.map(toAppointment);
  }

  async listAppointmentsCreatedBetween(businessId: string, from: string, to: string) {
    const rows = await this.db.query<Row>(
      "select * from appointments where business_id = $1 and created_at >= $2 and created_at < $3 order by created_at",
      [businessId, from, to],
    );
    return rows.map(toAppointment);
  }

  async getAppointment(id: string) {
    if (!UUID_RE.test(id)) return undefined;
    const [row] = await this.db.query<Row>("select * from appointments where id = $1", [id]);
    return row ? toAppointment(row) : undefined;
  }

  async cancelAppointment(businessId: string, id: string) {
    if (!UUID_RE.test(id)) return false;
    const rows = await this.db.query(
      `update appointments set cancelled_at = now()
       where id = $1 and business_id = $2 and cancelled_at is null returning id`,
      [id, businessId],
    );
    return rows.length === 1;
  }

  async listAppointmentsForReminder(from: string, to: string) {
    const rows = await this.db.query<Row>(
      `select * from appointments
       where cancelled_at is null and reminder_sent_at is null and start_at >= $1 and start_at < $2
       order by start_at`,
      [from, to],
    );
    return rows.map(toAppointment);
  }

  async claimReminder(id: string) {
    const rows = await this.db.query(
      `update appointments set reminder_sent_at = now()
       where id = $1 and reminder_sent_at is null and cancelled_at is null returning id`,
      [id],
    );
    return rows.length === 1;
  }

  async releaseReminder(id: string) {
    await this.db.query("update appointments set reminder_sent_at = null where id = $1", [id]);
  }

  async addAppointmentIfFree(input: NewAppointment) {
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

  private async insertAppointment(input: NewAppointment) {
    // Aynı işletme + kaynak için eklemeler, deyim bitene kadar tutulan bir kilitle sıraya
    // girer: ikinci istek birincinin kaydını görür ve deadlock yerine çakışma hatası alır.
    const [row] = await this.db.query<Row>(
      `with lock as (select pg_advisory_xact_lock(hashtextextended($2 || ':' || coalesce($7, '_'), 0)))
       insert into appointments
         (id, business_id, conversation_id, customer_name, contact, service_id, staff_id, start_at, end_at, source)
       select $1, $2, $3::uuid, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz, $10 from lock
       returning *`,
      [
        randomUUID(),
        input.businessId,
        input.conversationId ?? null,
        input.customerName,
        input.contact,
        input.serviceId,
        input.staffId ?? null,
        input.start,
        input.end,
        input.source,
      ],
    );
    return toAppointment(row);
  }

  async forgetMessage(messageId: string) {
    await this.db.query("delete from processed_messages where id = $1", [messageId]);
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

  async createPanelUser(input: Omit<PanelUser, "id" | "createdAt">) {
    const rows = await this.db.query<Row>(
      `insert into panel_users (id, username, password_hash, business_id) values ($1, $2, $3, $4)
       on conflict (username) do nothing returning *`,
      [randomUUID(), input.username, input.passwordHash, input.businessId],
    );
    return rows[0] ? toPanelUser(rows[0]) : null;
  }

  async findPanelUserByUsername(username: string) {
    const [row] = await this.db.query<Row>("select * from panel_users where username = $1", [username]);
    return row ? toPanelUser(row) : undefined;
  }

  async getPanelUser(id: string) {
    if (!UUID_RE.test(id)) return undefined;
    const [row] = await this.db.query<Row>("select * from panel_users where id = $1", [id]);
    return row ? toPanelUser(row) : undefined;
  }

  async listPanelUsers() {
    const rows = await this.db.query<Row>("select * from panel_users order by username");
    return rows.map(toPanelUser);
  }

  async deletePanelUser(id: string) {
    if (!UUID_RE.test(id)) return;
    await this.db.query("delete from panel_users where id = $1", [id]);
  }

  async saveMedia(input: Omit<Media, "id" | "createdAt">) {
    const [row] = await this.db.query<Row>(
      `insert into media (id, business_id, conversation_id, mime_type, data)
       values ($1, $2, $3, $4, $5) returning id, created_at`,
      [randomUUID(), input.businessId, input.conversationId ?? null, input.mimeType, input.data],
    );
    return { ...input, id: String(row.id), createdAt: iso(row.created_at) };
  }

  async getMedia(id: string) {
    if (!UUID_RE.test(id)) return undefined;
    const [r] = await this.db.query<Row>("select * from media where id = $1", [id]);
    if (!r) return undefined;
    return {
      id: String(r.id),
      businessId: String(r.business_id),
      conversationId: opt(r.conversation_id),
      mimeType: String(r.mime_type),
      data: Buffer.from(r.data as Uint8Array),
      createdAt: iso(r.created_at),
    };
  }

  async getBusinessSettings(businessId: string) {
    const [row] = await this.db.query<{ config: Business }>(
      "select config from business_settings where business_id = $1",
      [businessId],
    );
    return row?.config;
  }

  async saveBusinessSettings(business: Business) {
    await this.db.query(
      `insert into business_settings (business_id, config, updated_at) values ($1, $2, now())
       on conflict (business_id) do update set config = excluded.config, updated_at = now()`,
      [business.id, JSON.stringify(business)],
    );
  }

  async addPriceExample(input: NewPriceExample) {
    const [row] = await this.db.query<Row>(
      `insert into price_examples
         (id, business_id, media_ids, image_hash, customer_text, staff_reply, price_text, price_min, price_max, said_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       on conflict (business_id, image_hash) do nothing
       returning *`,
      [
        randomUUID(),
        input.businessId,
        JSON.stringify(input.mediaIds),
        input.imageHash,
        input.customerText,
        input.staffReply,
        input.priceText ?? null,
        input.priceMin ?? null,
        input.priceMax ?? null,
        input.saidAt,
      ],
    );
    return row ? toPriceExample(row) : null;
  }

  async hasPriceExample(businessId: string, imageHash: string) {
    const rows = await this.db.query("select 1 from price_examples where business_id = $1 and image_hash = $2", [businessId, imageHash]);
    return rows.length > 0;
  }

  async listPriceExamples(businessId: string) {
    const rows = await this.db.query<Row>("select * from price_examples where business_id = $1 order by said_at desc", [businessId]);
    return rows.map(toPriceExample);
  }

  async updatePriceExample(businessId: string, id: string, patch: Partial<Pick<PriceExample, "included" | "priceText" | "priceMin" | "priceMax">>) {
    if (!UUID_RE.test(id)) return false;
    const rows = await this.db.query(
      `update price_examples set
         included = coalesce($3, included),
         price_text = case when $4::boolean then $5 else price_text end,
         price_min = case when $4::boolean then $6::int else price_min end,
         price_max = case when $4::boolean then $7::int else price_max end
       where business_id = $1 and id = $2 returning id`,
      [businessId, id, patch.included ?? null, "priceText" in patch, patch.priceText ?? null, patch.priceMin ?? null, patch.priceMax ?? null],
    );
    return rows.length > 0;
  }

  async deletePriceExample(businessId: string, id: string) {
    if (!UUID_RE.test(id)) return;
    const [row] = await this.db.query<Row>(
      "delete from price_examples where business_id = $1 and id = $2 returning media_ids",
      [businessId, id],
    );
    const mediaIds = ((row?.media_ids as string[]) ?? []).filter((m) => UUID_RE.test(m));
    if (mediaIds.length > 0) {
      await this.db.query("delete from media where business_id = $1 and id = any($2::uuid[])", [businessId, mediaIds]);
    }
  }

  async saveInstagramAccount(account: InstagramAccount) {
    // Hesap başka işletmedeyse önce oradan çıkar; sonra bu işletmenin kaydını yaz.
    await this.db.query("delete from instagram_accounts where account_id = $1 and business_id <> $2", [
      account.accountId,
      account.businessId,
    ]);
    await this.db.query(
      `insert into instagram_accounts (business_id, account_id, username, sealed_token, token_expires_at, connected_at)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (business_id) do update set account_id = excluded.account_id, username = excluded.username,
         sealed_token = excluded.sealed_token, token_expires_at = excluded.token_expires_at,
         connected_at = excluded.connected_at`,
      [account.businessId, account.accountId, account.username ?? null, account.sealedToken, account.tokenExpiresAt, account.connectedAt],
    );
  }

  async getInstagramAccount(businessId: string) {
    const [row] = await this.db.query<Row>("select * from instagram_accounts where business_id = $1", [businessId]);
    return row ? toInstagramAccount(row) : undefined;
  }

  async findInstagramAccount(accountId: string) {
    const [row] = await this.db.query<Row>("select * from instagram_accounts where account_id = $1", [accountId]);
    return row ? toInstagramAccount(row) : undefined;
  }

  async listInstagramAccounts() {
    return (await this.db.query<Row>("select * from instagram_accounts order by business_id")).map(toInstagramAccount);
  }

  async deleteInstagramAccount(businessId: string) {
    await this.db.query("delete from instagram_accounts where business_id = $1", [businessId]);
  }

  async savePhotoQuoteEval(businessId: string, result: unknown) {
    const [row] = await this.db.query<Row>(
      "insert into photo_quote_evals (id, business_id, result) values ($1, $2, $3) returning *",
      [randomUUID(), businessId, JSON.stringify(result)],
    );
    return toEval(row);
  }

  async latestPhotoQuoteEval(businessId: string) {
    const [row] = await this.db.query<Row>(
      "select * from photo_quote_evals where business_id = $1 order by created_at desc limit 1",
      [businessId],
    );
    return row ? toEval(row) : undefined;
  }
}

function toEval(r: Row): PhotoQuoteEval {
  return { id: String(r.id), businessId: String(r.business_id), result: r.result, createdAt: iso(r.created_at) };
}

function toInstagramAccount(r: Row): InstagramAccount {
  return {
    businessId: String(r.business_id),
    accountId: String(r.account_id),
    username: opt(r.username),
    sealedToken: String(r.sealed_token),
    tokenExpiresAt: iso(r.token_expires_at),
    connectedAt: iso(r.connected_at),
  };
}

function toPriceExample(r: Row): PriceExample {
  const num = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));
  return {
    id: String(r.id),
    businessId: String(r.business_id),
    mediaIds: r.media_ids as string[],
    imageHash: String(r.image_hash),
    customerText: String(r.customer_text),
    staffReply: String(r.staff_reply),
    priceText: opt(r.price_text),
    priceMin: num(r.price_min),
    priceMax: num(r.price_max),
    included: Boolean(r.included),
    saidAt: iso(r.said_at),
    createdAt: iso(r.created_at),
  };
}
