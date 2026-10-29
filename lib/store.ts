import type Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import type { Business } from "./business";
import { KeyedQueue } from "./keyed-queue";

// Veri katmanı. DATABASE_URL tanımlıysa Postgres (lib/store-postgres.ts), değilse bellek
// (sunucu yeniden başlayınca silinir; sadece geliştirme ve demo için).

export type Channel = "whatsapp" | "instagram" | "demo";
// blocked: küfür, taciz veya uygunsuz istek; asistan artık yanıt vermez, mesajlar panelde görünür.
export type ConversationStatus = "bot" | "handoff" | "blocked";

export interface Lead {
  name?: string;
  country?: string;
  language?: string;
  interest?: string; // İlgilendiği hizmet
  timeframe?: string;
  notes?: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  businessId: string;
  channel: Channel;
  contact: string; // WhatsApp numarası, Instagram kullanıcı kimliği (IGSID) veya demo oturum kimliği
  contactName?: string;
  status: ConversationStatus;
  handoffReason?: string;
  lead?: Lead;
  // Modele gönderilen geçmiş. Sadece sona eklenir (append-only); düşünme blokları korunur.
  history: Anthropic.Beta.Messages.BetaMessageParam[];
  // Panelde gösterilen sade metin akışı.
  transcript: { from: "customer" | "assistant" | "staff"; text: string; at: string; mediaId?: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface Appointment {
  id: string;
  businessId: string;
  conversationId?: string; // Panelden elle eklenen randevularda yok
  source: "assistant" | "panel";
  customerName: string;
  contact: string;
  serviceId: string;
  staffId?: string; // Çalışanı olmayan işletmelerde boş
  start: string; // ISO
  end: string; // ISO
  createdAt: string;
  cancelledAt?: string;
  reminderSentAt?: string;
}

export type NewAppointment = Omit<Appointment, "id" | "createdAt" | "cancelledAt" | "reminderSentAt">;

export interface WaitlistEntry {
  id: string;
  businessName: string;
  businessType?: string;
  contactName: string;
  phone: string;
  city?: string;
  createdAt: string;
}

export interface PanelUser {
  id: string;
  username: string; // küçük harf, benzersiz
  passwordHash: string;
  businessId: string;
  createdAt: string;
}

// Müşterinin gönderdiği fotoğraf. Konuşma geçmişinde sadece kimliği tutulur (bkz. lib/media.ts).
export interface Media {
  id: string;
  businessId: string;
  conversationId?: string; // Geçmiş konuşmalardan içe aktarılan fotoğrafların sohbeti yoktur
  mimeType: string;
  data: Buffer;
  createdAt: string;
}

// Fotoğrafa göre fiyat örneği: müşterinin gönderdiği saç fotoğrafı ve ustanın verdiği fiyat.
// Salonun geçmiş WhatsApp yazışmalarından içe aktarılır; sadece o salonun asistanında kullanılır.
export interface PriceExample {
  id: string;
  businessId: string;
  mediaIds: string[];
  imageHash: string; // İlk fotoğrafın SHA-256'sı; aynı örnek iki kez eklenmez
  customerText: string;
  staffReply: string;
  priceText?: string;
  priceMin?: number;
  priceMax?: number;
  included: boolean; // Sahibi kontrol edip çıkarabilir
  saidAt: string;
  createdAt: string;
}

export type NewPriceExample = Omit<PriceExample, "id" | "createdAt" | "included">;

// İşletmenin panelden bağladığı Instagram hesabı. Erişim anahtarı şifreli saklanır (lib/instagram.ts).
export interface InstagramAccount {
  businessId: string;
  accountId: string; // Webhook'ta gelen hesap kimliği; bir hesap tek işletmeye bağlıdır
  username?: string;
  sealedToken: string;
  tokenExpiresAt: string;
  connectedAt: string;
}

// Fotoğrafla fiyat sınavının sonucu; içerik lib/photo-quote-eval.ts'de tanımlı.
export interface PhotoQuoteEval {
  id: string;
  businessId: string;
  result: unknown;
  createdAt: string;
}

export type ConversationKey = Pick<Conversation, "businessId" | "channel" | "contact">;

export interface Store {
  findOrCreateConversation(input: ConversationKey & { contactName?: string }): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | undefined>;
  saveConversation(conversation: Conversation): Promise<void>;
  listConversations(businessId: string): Promise<Conversation[]>;
  // İptal edilmemiş randevular, başlangıca göre sıralı.
  listAppointments(businessId: string): Promise<Appointment[]>;
  getAppointment(id: string): Promise<Appointment | undefined>;
  // [from, to) aralığında oluşturulan randevular, iptal edilenler dahil (pilot raporu için).
  listAppointmentsCreatedBetween(businessId: string, from: string, to: string): Promise<Appointment[]>;
  // İptal edilen randevu saati boşaltır; zaten iptalse veya yoksa false döner.
  cancelAppointment(businessId: string, id: string): Promise<boolean>;
  // Tüm işletmelerde [from, to) aralığında başlayan, hatırlatması gönderilmemiş aktif randevular.
  listAppointmentsForReminder(from: string, to: string): Promise<Appointment[]>;
  // Hatırlatmayı gönderim için ayırır: ilk çağıran true alır, böylece aynı anda çalışan iki
  // görev aynı müşteriye iki kez yazmaz. Gönderim başarısız olursa releaseReminder ile geri alınır.
  claimReminder(id: string): Promise<boolean>;
  releaseReminder(id: string): Promise<void>;
  // Aynı kaynağa (çalışan veya tek takvim) çakışan randevu varsa kaydetmez ve null döner.
  // Kontrol ve kayıt tek adımda yapılır; iki müşteri aynı anda aynı saati alamaz.
  addAppointmentIfFree(input: NewAppointment): Promise<Appointment | null>;
  // WhatsApp aynı mesajı birden fazla kez gönderebilir; ilk görüşte true döner.
  markMessageSeen(messageId: string): Promise<boolean>;
  addWaitlistEntry(input: Omit<WaitlistEntry, "id" | "createdAt">): Promise<WaitlistEntry>;
  listWaitlist(): Promise<WaitlistEntry[]>;
  // Aynı konuşma üzerindeki işleri (asistan turu, personel yanıtı) sıraya koyar ki
  // biri diğerinin değişikliğini ezmesin.
  withConversationLock<T>(key: ConversationKey, fn: () => Promise<T>): Promise<T>;
  // Panelden kaydedilen işletme ayarları; hiç kaydedilmemişse undefined.
  getBusinessSettings(businessId: string): Promise<Business | undefined>;
  saveBusinessSettings(business: Business): Promise<void>;
  // Panel kullanıcıları. Kullanıcı adı alınmışsa createPanelUser null döner.
  createPanelUser(input: Omit<PanelUser, "id" | "createdAt">): Promise<PanelUser | null>;
  findPanelUserByUsername(username: string): Promise<PanelUser | undefined>;
  getPanelUser(id: string): Promise<PanelUser | undefined>;
  listPanelUsers(): Promise<PanelUser[]>;
  deletePanelUser(id: string): Promise<void>;
  saveMedia(input: Omit<Media, "id" | "createdAt">): Promise<Media>;
  getMedia(id: string): Promise<Media | undefined>;
  // Aynı fotoğraf (imageHash) bu işletmede zaten varsa eklemez ve null döner.
  addPriceExample(input: NewPriceExample): Promise<PriceExample | null>;
  hasPriceExample(businessId: string, imageHash: string): Promise<boolean>;
  listPriceExamples(businessId: string): Promise<PriceExample[]>;
  updatePriceExample(businessId: string, id: string, patch: Partial<Pick<PriceExample, "included" | "priceText" | "priceMin" | "priceMax">>): Promise<boolean>;
  // Örneği ve fotoğraflarını birlikte siler.
  deletePriceExample(businessId: string, id: string): Promise<void>;
  // Hesap başka bir işletmeye bağlıysa oradan alınır (aynı hesap iki işletmeye bağlanamaz).
  saveInstagramAccount(account: InstagramAccount): Promise<void>;
  getInstagramAccount(businessId: string): Promise<InstagramAccount | undefined>;
  findInstagramAccount(accountId: string): Promise<InstagramAccount | undefined>;
  listInstagramAccounts(): Promise<InstagramAccount[]>;
  deleteInstagramAccount(businessId: string): Promise<void>;
  savePhotoQuoteEval(businessId: string, result: unknown): Promise<PhotoQuoteEval>;
  latestPhotoQuoteEval(businessId: string): Promise<PhotoQuoteEval | undefined>;
}

export function conversationLockKey(key: ConversationKey): string {
  return `${key.businessId}:${key.channel}:${key.contact}`;
}

export function overlaps(a: { start: string; end: string }, b: { start: string; end: string }): boolean {
  return Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);
}

export class InMemoryStore implements Store {
  private conversations = new Map<string, Conversation>();
  private appointments: Appointment[] = [];
  private seenMessages = new Set<string>();
  private waitlist: WaitlistEntry[] = [];
  private locks = new KeyedQueue();
  private businessSettings = new Map<string, Business>();
  private panelUsers: PanelUser[] = [];
  private media = new Map<string, Media>();
  private priceExamples: PriceExample[] = [];
  private instagram: InstagramAccount[] = [];
  private evals: PhotoQuoteEval[] = [];

  async findOrCreateConversation(input: ConversationKey & { contactName?: string }): Promise<Conversation> {
    for (const c of this.conversations.values()) {
      if (c.businessId === input.businessId && c.channel === input.channel && c.contact === input.contact) {
        if (input.contactName && !c.contactName) c.contactName = input.contactName;
        return structuredClone(c);
      }
    }
    const now = new Date().toISOString();
    const conversation: Conversation = {
      id: randomUUID(),
      ...input,
      status: "bot",
      history: [],
      transcript: [],
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(conversation.id, conversation);
    return structuredClone(conversation);
  }

  // Kopya döndürülür ki Postgres'te olduğu gibi değişiklikler ancak saveConversation ile kalıcı olsun.
  async getConversation(id: string) {
    const c = this.conversations.get(id);
    return c && structuredClone(c);
  }

  async saveConversation(conversation: Conversation) {
    conversation.updatedAt = new Date().toISOString();
    this.conversations.set(conversation.id, structuredClone(conversation));
  }

  async listConversations(businessId: string) {
    return [...this.conversations.values()]
      .filter((c) => c.businessId === businessId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((c) => structuredClone(c));
  }

  async listAppointments(businessId: string) {
    return this.appointments
      .filter((a) => a.businessId === businessId && !a.cancelledAt)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  }

  async getAppointment(id: string) {
    const a = this.appointments.find((x) => x.id === id);
    return a && { ...a };
  }

  async listAppointmentsCreatedBetween(businessId: string, from: string, to: string) {
    const [f, t] = [Date.parse(from), Date.parse(to)];
    return this.appointments
      .filter((a) => a.businessId === businessId && Date.parse(a.createdAt) >= f && Date.parse(a.createdAt) < t)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      .map((a) => ({ ...a }));
  }

  async cancelAppointment(businessId: string, id: string) {
    const a = this.appointments.find((x) => x.id === id && x.businessId === businessId && !x.cancelledAt);
    if (!a) return false;
    a.cancelledAt = new Date().toISOString();
    return true;
  }

  async listAppointmentsForReminder(from: string, to: string) {
    const [f, t] = [Date.parse(from), Date.parse(to)];
    return this.appointments
      .filter((a) => !a.cancelledAt && !a.reminderSentAt && Date.parse(a.start) >= f && Date.parse(a.start) < t)
      .map((a) => ({ ...a }));
  }

  async claimReminder(id: string) {
    const a = this.appointments.find((x) => x.id === id);
    if (!a || a.reminderSentAt || a.cancelledAt) return false;
    a.reminderSentAt = new Date().toISOString();
    return true;
  }

  async releaseReminder(id: string) {
    const a = this.appointments.find((x) => x.id === id);
    if (a) a.reminderSentAt = undefined;
  }

  async addAppointmentIfFree(input: NewAppointment) {
    const clash = this.appointments.some(
      (a) =>
        a.businessId === input.businessId && !a.cancelledAt && a.staffId === input.staffId && overlaps(a, input),
    );
    if (clash) return null;
    const appointment: Appointment = { id: randomUUID(), createdAt: new Date().toISOString(), ...input };
    this.appointments.push(appointment);
    return appointment;
  }

  async markMessageSeen(messageId: string) {
    if (this.seenMessages.has(messageId)) return false;
    this.seenMessages.add(messageId);
    return true;
  }

  async addWaitlistEntry(input: Omit<WaitlistEntry, "id" | "createdAt">) {
    const entry: WaitlistEntry = { id: randomUUID(), createdAt: new Date().toISOString(), ...input };
    this.waitlist.push(entry);
    return entry;
  }

  async listWaitlist() {
    return [...this.waitlist].reverse();
  }

  withConversationLock<T>(key: ConversationKey, fn: () => Promise<T>): Promise<T> {
    return this.locks.run(conversationLockKey(key), fn);
  }

  async getBusinessSettings(businessId: string) {
    const b = this.businessSettings.get(businessId);
    return b && structuredClone(b);
  }

  async saveBusinessSettings(business: Business) {
    this.businessSettings.set(business.id, structuredClone(business));
  }

  async createPanelUser(input: Omit<PanelUser, "id" | "createdAt">) {
    if (this.panelUsers.some((u) => u.username === input.username)) return null;
    const user: PanelUser = { id: randomUUID(), createdAt: new Date().toISOString(), ...input };
    this.panelUsers.push(user);
    return { ...user };
  }

  async findPanelUserByUsername(username: string) {
    const u = this.panelUsers.find((x) => x.username === username);
    return u && { ...u };
  }

  async getPanelUser(id: string) {
    const u = this.panelUsers.find((x) => x.id === id);
    return u && { ...u };
  }

  async listPanelUsers() {
    return this.panelUsers.map((u) => ({ ...u })).sort((a, b) => a.username.localeCompare(b.username));
  }

  async deletePanelUser(id: string) {
    this.panelUsers = this.panelUsers.filter((u) => u.id !== id);
  }

  async saveMedia(input: Omit<Media, "id" | "createdAt">) {
    const media: Media = { id: randomUUID(), createdAt: new Date().toISOString(), ...input };
    this.media.set(media.id, media);
    return media;
  }

  async getMedia(id: string) {
    return this.media.get(id);
  }

  async addPriceExample(input: NewPriceExample) {
    if (await this.hasPriceExample(input.businessId, input.imageHash)) return null;
    const example: PriceExample = { id: randomUUID(), createdAt: new Date().toISOString(), included: true, ...input };
    this.priceExamples.push(example);
    return { ...example };
  }

  async hasPriceExample(businessId: string, imageHash: string) {
    return this.priceExamples.some((e) => e.businessId === businessId && e.imageHash === imageHash);
  }

  async listPriceExamples(businessId: string) {
    return this.priceExamples
      .filter((e) => e.businessId === businessId)
      .sort((a, b) => b.saidAt.localeCompare(a.saidAt))
      .map((e) => ({ ...e }));
  }

  async updatePriceExample(businessId: string, id: string, patch: Partial<Pick<PriceExample, "included" | "priceText" | "priceMin" | "priceMax">>) {
    const e = this.priceExamples.find((x) => x.id === id && x.businessId === businessId);
    if (!e) return false;
    Object.assign(e, patch);
    return true;
  }

  async deletePriceExample(businessId: string, id: string) {
    const example = this.priceExamples.find((e) => e.id === id && e.businessId === businessId);
    if (!example) return;
    for (const m of example.mediaIds) this.media.delete(m);
    this.priceExamples = this.priceExamples.filter((e) => e !== example);
  }

  async saveInstagramAccount(account: InstagramAccount) {
    this.instagram = this.instagram.filter((a) => a.businessId !== account.businessId && a.accountId !== account.accountId);
    this.instagram.push({ ...account });
  }

  async getInstagramAccount(businessId: string) {
    const a = this.instagram.find((x) => x.businessId === businessId);
    return a && { ...a };
  }

  async findInstagramAccount(accountId: string) {
    const a = this.instagram.find((x) => x.accountId === accountId);
    return a && { ...a };
  }

  async listInstagramAccounts() {
    return this.instagram.map((a) => ({ ...a }));
  }

  async deleteInstagramAccount(businessId: string) {
    this.instagram = this.instagram.filter((a) => a.businessId !== businessId);
  }

  async savePhotoQuoteEval(businessId: string, result: unknown) {
    const row: PhotoQuoteEval = { id: randomUUID(), businessId, result: structuredClone(result), createdAt: new Date().toISOString() };
    this.evals.push(row);
    return { ...row };
  }

  async latestPhotoQuoteEval(businessId: string) {
    const rows = this.evals.filter((e) => e.businessId === businessId);
    const last = rows[rows.length - 1];
    return last && { ...last };
  }
}

// Geliştirme sırasında hot reload modülü yeniden yüklese de veriler ve bağlantılar kaybolmasın.
const globalForStore = globalThis as unknown as { __store?: Store };

export async function getStore(): Promise<Store> {
  if (!globalForStore.__store) {
    const url = process.env.DATABASE_URL;
    if (url) {
      const { PostgresStore, createPgDatabase } = await import("./store-postgres");
      globalForStore.__store = new PostgresStore(createPgDatabase(url));
    } else {
      if (process.env.NODE_ENV === "production") {
        console.warn("DATABASE_URL tanımlı değil; veriler bellekte tutuluyor ve yeniden başlatmada silinecek.");
      }
      globalForStore.__store = new InMemoryStore();
    }
  }
  return globalForStore.__store;
}
