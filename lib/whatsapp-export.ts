import { containsProfanity } from "./profanity";

// WhatsApp "Sohbeti dışa aktar" dosyasını okur ve fiyat örneklerini çıkarır: müşterinin
// gönderdiği saç fotoğrafı ve salonun ardından verdiği fiyat. Tarayıcıda da çalışır.
// Kişisel veri azaltılır: gönderen adları tutulmaz (sadece müşteri/salon), metinlerdeki
// telefon numaraları, e-postalar ve müşterinin adı silinir.

export interface ExportMessage {
  at: Date;
  sender: string;
  text: string;
  attachment?: string; // Dosya adı (dışa aktarmada medya dahilse zip içinde bulunur)
}

export interface PriceSuggestion {
  text: string; // Fiyatın geçtiği cümle, kısaltılmış
  min: number;
  max: number;
}

export interface ExtractedExample {
  photos: string[]; // Aynı soruda arka arkaya gönderilen fotoğraflar (en fazla 3)
  customerText: string; // Fotoğrafın yanında müşterinin yazdıkları
  staffReply: string; // Salonun fiyatı verdiği mesaj(lar)
  price?: PriceSuggestion; // Bulunamadıysa kontrol için işaretlenir
  at: string; // ISO
}

const LRM = /[‎‏‪-‮]/g;
// iOS: [28.10.2026 14:32:05] Ad: mesaj    Android: 28.10.2026 14:32 - Ad: mesaj
const IOS = /^\[(\d{1,2})[./-](\d{1,2})[./-](\d{2,4}),? (\d{1,2}):(\d{2})(?::(\d{2}))?\] ([^:]{1,80}): ?([\s\S]*)$/;
const ANDROID = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4}),? (\d{1,2}):(\d{2}) - ([^:]{1,80}): ?([\s\S]*)$/;
const IOS_ATTACHMENT = /<(?:ekli|attached):\s*([^>]+)>/i;
const ANDROID_ATTACHMENT = /^(\S+\.\w{2,5}) \((?:dosya ekli|file attached)\)/i;
const IMAGE = /\.(jpe?g|png|webp)$/i;

function toDate(d: string, m: string, y: string, h: string, min: string, s?: string): Date {
  const year = y.length === 2 ? 2000 + Number(y) : Number(y);
  return new Date(Date.UTC(year, Number(m) - 1, Number(d), Number(h) - 3, Number(min), Number(s ?? 0)));
}

export function parseExport(raw: string): ExportMessage[] {
  const messages: ExportMessage[] = [];
  for (const rawLine of raw.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.replace(LRM, "");
    const ios = IOS.exec(line);
    const android = ios ? null : ANDROID.exec(line);
    if (ios || android) {
      const [d, m, y, h, min, sec, sender, body] = ios
        ? ios.slice(1)
        : [android![1], android![2], android![3], android![4], android![5], undefined, android![6], android![7]];
      const attachment = IOS_ATTACHMENT.exec(body)?.[1]?.trim() ?? ANDROID_ATTACHMENT.exec(body)?.[1];
      messages.push({
        at: toDate(d, m, y, h, min, sec),
        sender: sender.trim(),
        text: attachment ? body.replace(IOS_ATTACHMENT, "").replace(ANDROID_ATTACHMENT, "").trim() : body.trim(),
        attachment,
      });
    } else if (messages.length > 0 && line.trim()) {
      // Çok satırlı mesajın devamı.
      const last = messages[messages.length - 1];
      last.text = last.text ? `${last.text}\n${line}` : line.trim();
    }
  }
  return messages;
}

// Fiyatın geçtiği yeri bulur: "1.500 TL", "1500₺", "2 bin", "3.000-4.000", "3000 ile 4000 arası".
// Saat (14:00), tarih ve telefon numarası fiyat sayılmaz.
const PRICE_WORDS = /(fiyat|ücret|tutar|olur|lira|\btl\b|₺|bin\b)/i;
export function extractPrice(text: string): PriceSuggestion | undefined {
  const clean = text
    .replace(/\b\d{1,2}[:.]\d{2}\b(?!\s*(tl|₺|lira))/gi, " ") // saatler
    .replace(/\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/g, " ") // tarihler
    .replace(/(\+?\d[\d\s]{9,}\d)/g, " ") // telefon numaraları
    .replace(/\b(\d{1,2})\s*(?:-|–|ile)\s*(\d{1,2})\s*(bin|k)\b/gi, "$1 $3 - $2 $3"); // "3-4 bin" iki ucu da bin
  if (!PRICE_WORDS.test(clean)) return undefined;
  const values: number[] = [];
  const number = /(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(bin\b|k\b)?/gi;
  for (const match of clean.matchAll(number)) {
    let value = Number(match[1].replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
    if (match[2]) value *= 1000;
    if (value >= 100 && value <= 100_000) values.push(Math.round(value));
  }
  if (values.length === 0) return undefined;
  const sentence = text.replace(/\s+/g, " ").trim();
  return { text: sentence.slice(0, 200), min: Math.min(...values), max: Math.max(...values) };
}

export function redact(text: string, names: string[]): string {
  let out = text
    .replace(/\+?\d[\d\s()-]{8,}\d/g, "[numara]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[e-posta]");
  for (const name of names) {
    for (const part of name.split(/\s+/).filter((p) => p.length >= 3)) {
      // \b ASCII sınırıdır; "Şule", "Özge" gibi Türkçe harfle başlayan adlar için harf dışı sınır kullanılır.
      const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      out = out.replace(new RegExp(`(^|[^\\p{L}])${escaped}(?![\\p{L}])`, "giu"), "$1[müşteri]");
    }
  }
  return out;
}

// Bir sohbetten örnekleri çıkarır. salonSenders: salonun telefonundaki ad(lar); diğerleri müşteri.
// Fotoğraftan sonra 3 gün içinde ve müşterinin bir sonraki fotoğrafından önce salonun yazdığı ilk
// fiyatlı mesaj o fotoğrafın fiyatıdır. Fiyat bulunamazsa örnek yine alınır, kontrol için işaretlenir.
export function extractExamples(messages: ExportMessage[], salonSenders: string[], available: Set<string>): ExtractedExample[] {
  const isSalon = (m: ExportMessage) => salonSenders.includes(m.sender);
  const customerNames = [...new Set(messages.filter((m) => !isSalon(m)).map((m) => m.sender))];
  const isPhoto = (m: ExportMessage) => !isSalon(m) && !!m.attachment && IMAGE.test(m.attachment) && available.has(m.attachment);
  const examples: ExtractedExample[] = [];
  const LIMIT = 3 * 24 * 3600 * 1000;

  const used = new Set<number>();
  for (let i = 0; i < messages.length; i++) {
    if (!isPhoto(messages[i]) || used.has(i)) continue;
    // Salon cevap verene kadar müşterinin arka arkaya gönderdikleri tek soru sayılır.
    const photos: string[] = [];
    const customerText: string[] = [];
    let j = i;
    for (; j < messages.length && !isSalon(messages[j]); j++) {
      used.add(j);
      if (isPhoto(messages[j]) && photos.length < 3) photos.push(messages[j].attachment!);
      if (messages[j].text) customerText.push(messages[j].text);
    }
    // Fotoğraftan hemen önceki müşteri metni de bağlamdır ("balyaj yaptırmak istiyorum").
    if (i > 0 && !isSalon(messages[i - 1]) && !messages[i - 1].attachment && messages[i].at.getTime() - messages[i - 1].at.getTime() < 15 * 60_000) {
      customerText.unshift(messages[i - 1].text);
    }
    const replies: string[] = [];
    let price: PriceSuggestion | undefined;
    for (let k = j; k < messages.length; k++) {
      const m = messages[k];
      if (m.at.getTime() - messages[i].at.getTime() > LIMIT) break;
      if (isPhoto(m)) break;
      if (!isSalon(m) || !m.text) continue;
      replies.push(m.text);
      price = extractPrice(m.text);
      if (price || replies.length >= 3) break;
    }
    if (photos.length === 0 || replies.length === 0) continue;
    examples.push({
      photos,
      customerText: redact(customerText.join("\n"), customerNames).slice(0, 1000),
      staffReply: redact(replies.join("\n"), customerNames).slice(0, 1000),
      price: price && { ...price, text: redact(price.text, customerNames) },
      at: messages[i].at.toISOString(),
    });
  }
  return examples;
}

// Üslup örnekleri: müşterinin arka arkaya yazdıkları → salonun ardından (24 saat içinde)
// verdiği cevap (en fazla 3 mesaj). Asistan hitap, ton ve hizmet adlarını bunlardan öğrenir.
// Fiyat, saat ve tarih gizlenir (eskimiş olabilir; asistan bunları güncel listeden söyler);
// ad, numara ve e-posta silinir. Sistem satırları, silinen mesajlar ve küfürlü çiftler alınmaz.
export interface StylePair {
  customerText: string;
  staffReply: string;
}

const SYSTEM_LINE =
  /(uçtan uca şifre|end-to-end encrypted|medya dahil edilmedi|media omitted|bu mesaj silindi|this message was deleted|<ekli|attached>|görüntü dahil edilmedi|image omitted|sticker omitted|çıkartma dahil edilmedi|güvenlik kodu değişti|security code changed)/i;

export function maskVolatile(text: string): string {
  return text
    .replace(/\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/g, "[tarih]")
    .replace(/\b\d{1,2}:\d{2}\b/g, "[saat]")
    // "12.10" tarih, "19.30" / "14.00" saat (ay 1–12 değilse saattir)
    .replace(/\b(\d{1,2})[./](\d{2})\b(?!\s*(tl|₺|lira|bin))/gi, (_m, a: string, b: string) =>
      Number(b) >= 1 && Number(b) <= 12 && Number(a) <= 31 ? "[tarih]" : "[saat]",
    )
    .replace(/(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(?:-|–|ile)?\s*(\d{1,3}(?:[.,]\d{3})+|\d+)?\s*(bin\b|k\b)?\s*(tl\b|₺|lira\b)/gi, "[fiyat]")
    .replace(/\b\d+\s*bin\b/gi, "[fiyat]");
}

export function extractStylePairs(messages: ExportMessage[], salonSenders: string[]): StylePair[] {
  const isSalon = (m: ExportMessage) => salonSenders.includes(m.sender);
  const customerNames = [...new Set(messages.filter((m) => !isSalon(m)).map((m) => m.sender))];
  const usable = (m: ExportMessage) => !SYSTEM_LINE.test(m.text);
  const clean = (t: string) => maskVolatile(redact(t, customerNames)).replace(/\s+\n/g, "\n").trim();
  const DAY = 24 * 3600 * 1000;
  const pairs: StylePair[] = [];
  let i = 0;
  while (i < messages.length) {
    if (isSalon(messages[i])) {
      i++;
      continue;
    }
    const customer: string[] = [];
    let photo = false;
    let lastAt = messages[i].at.getTime();
    for (; i < messages.length && !isSalon(messages[i]); i++) {
      const m = messages[i];
      if (m.attachment && IMAGE.test(m.attachment)) photo = true;
      if (m.text && usable(m)) customer.push(m.text);
      lastAt = m.at.getTime();
    }
    const replies: string[] = [];
    for (; i < messages.length && isSalon(messages[i]); i++) {
      const m = messages[i];
      if (m.at.getTime() - lastAt > DAY || replies.length >= 3) continue;
      if (m.text && usable(m)) replies.push(m.text);
    }
    const customerText = clean([photo ? "(fotoğraf gönderdi)" : "", ...customer].filter(Boolean).join("\n")).slice(0, 400);
    const staffReply = clean(replies.join("\n")).slice(0, 500);
    if (!customerText || staffReply.length < 2) continue;
    if (containsProfanity(customerText) || containsProfanity(staffReply)) continue;
    pairs.push({ customerText, staffReply });
  }
  return pairs;
}

// Salonun adı: sohbetlerin çoğunda görünen gönderen (dışa aktarma salonun telefonundan yapılır).
export function guessSalonSenders(chats: ExportMessage[][]): string[] {
  const counts = new Map<string, number>();
  for (const chat of chats) for (const s of new Set(chat.map((m) => m.sender))) counts.set(s, (counts.get(s) ?? 0) + 1);
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return [];
  if (chats.length === 1) return [];
  return ranked.filter(([, c]) => c === ranked[0][1] && c > 1).map(([s]) => s);
}

export function allSenders(chats: ExportMessage[][]): string[] {
  return [...new Set(chats.flat().map((m) => m.sender))].sort((a, b) => a.localeCompare(b, "tr"));
}
