import type Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";

// Veri katmanı. Prototip bellekte tutar (sunucu yeniden başlayınca silinir);
// Store arayüzü sabit kaldığı sürece Postgres'e geçiş tek bir dosyayı değiştirir.

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
  conversationId: string;
  customerName: string;
  contact: string;
  serviceId: string;
  staffId?: string; // Çalışanı olmayan işletmelerde boş
  start: string; // ISO, ofsetli: 2026-10-27T10:00:00+03:00
  end: string;
  createdAt: string;
}

export interface WaitlistEntry {
  id: string;
  businessName: string;
  businessType?: string;
  contactName: string;
  phone: string;
  city?: string;
  createdAt: string;
}

export interface Store {
  findOrCreateConversation(input: {
    businessId: string;
    channel: Channel;
    contact: string;
    contactName?: string;
  }): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | undefined>;
  saveConversation(conversation: Conversation): Promise<void>;
  listConversations(businessId: string): Promise<Conversation[]>;
  listAppointments(businessId: string): Promise<Appointment[]>;
  addAppointment(input: Omit<Appointment, "id" | "createdAt">): Promise<Appointment>;
  // WhatsApp aynı mesajı birden fazla kez gönderebilir; ilk görüşte true döner.
  markMessageSeen(messageId: string): Promise<boolean>;
  addWaitlistEntry(input: Omit<WaitlistEntry, "id" | "createdAt">): Promise<WaitlistEntry>;
  listWaitlist(): Promise<WaitlistEntry[]>;
}

export class InMemoryStore implements Store {
  private conversations = new Map<string, Conversation>();
  private appointments: Appointment[] = [];
  private seenMessages = new Set<string>();
  private waitlist: WaitlistEntry[] = [];

  async findOrCreateConversation(input: {
    businessId: string;
    channel: Channel;
    contact: string;
    contactName?: string;
  }): Promise<Conversation> {
    for (const c of this.conversations.values()) {
      if (c.businessId === input.businessId && c.channel === input.channel && c.contact === input.contact) {
        if (input.contactName && !c.contactName) c.contactName = input.contactName;
        return c;
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
    return conversation;
  }

  async getConversation(id: string) {
    return this.conversations.get(id);
  }

  async saveConversation(conversation: Conversation) {
    conversation.updatedAt = new Date().toISOString();
    this.conversations.set(conversation.id, conversation);
  }

  async listConversations(businessId: string) {
    return [...this.conversations.values()]
      .filter((c) => c.businessId === businessId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async listAppointments(businessId: string) {
    return this.appointments
      .filter((a) => a.businessId === businessId)
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  async addAppointment(input: Omit<Appointment, "id" | "createdAt">) {
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
}

// Geliştirme sırasında hot reload modülü yeniden yüklese de veriler kaybolmasın.
const globalForStore = globalThis as unknown as { __store?: Store };

export function getStore(): Store {
  if (!globalForStore.__store) globalForStore.__store = new InMemoryStore();
  return globalForStore.__store;
}
