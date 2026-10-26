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
}

export type NewAppointment = Omit<Appointment, "id" | "createdAt" | "cancelledAt">;

export interface WaitlistEntry {
  id: string;
  businessName: string;
  businessType?: string;
  contactName: string;
  phone: string;
  city?: string;
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
