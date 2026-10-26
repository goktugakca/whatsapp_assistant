import type Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import type { Business } from "./business";
import { KeyedQueue } from "./keyed-queue";

// Veri katmanı. DATABASE_URL tanımlıysa Postgres (lib/store-postgres.ts), değilse bellek
// (sunucu yeniden başlayınca silinir; sadece geliştirme ve demo için).

export type Channel = "whatsapp" | "demo";
export type ConversationStatus = "bot" | "handoff";

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
  contact: string; // WhatsApp numarası veya demo oturum kimliği
  contactName?: string;
  status: ConversationStatus;
  handoffReason?: string;
  lead?: Lead;
  // Modele gönderilen geçmiş. Sadece sona eklenir (append-only); düşünme blokları korunur.
  history: Anthropic.Beta.Messages.BetaMessageParam[];
  // Panelde gösterilen sade metin akışı.
  transcript: { from: "customer" | "assistant" | "staff"; text: string; at: string }[];
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

export type ConversationKey = Pick<Conversation, "businessId" | "channel" | "contact">;

export interface Store {
  findOrCreateConversation(input: ConversationKey & { contactName?: string }): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | undefined>;
  saveConversation(conversation: Conversation): Promise<void>;
  listConversations(businessId: string): Promise<Conversation[]>;
  // İptal edilmemiş randevular, başlangıca göre sıralı.
  listAppointments(businessId: string): Promise<Appointment[]>;
  getAppointment(id: string): Promise<Appointment | undefined>;
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
