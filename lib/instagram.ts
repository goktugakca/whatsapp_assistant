import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Instagram mesajları (Instagram API with Instagram Login). İşletme hesabını panelden
// "Instagram'ı bağla" ile bağlar; erişim anahtarı veritabanında şifreli durur ve günlük
// görevde yenilenir. Webhook imzası WhatsApp'takiyle aynı biçimdedir (lib/whatsapp.ts).
const GRAPH_VERSION = process.env.INSTAGRAM_GRAPH_VERSION ?? "v23.0";
const GRAPH = `https://graph.instagram.com/${GRAPH_VERSION}`;
export const STATE_COOKIE = "ig_baglanti"; // OAuth dönüşünü doğrulayan çerez
export const INSTAGRAM_SCOPES = ["instagram_business_basic", "instagram_business_manage_messages"];

export interface InstagramInbound {
  id: string; // mid
  accountId: string; // Mesajın geldiği işletme hesabı (webhook'taki entry.id)
  from: string; // Müşterinin Instagram kimliği (IGSID)
  text: string;
  imageUrl?: string;
  timestamp: number;
}

interface WebhookPayload {
  object?: string;
  entry?: {
    id?: string;
    messaging?: {
      sender?: { id?: string };
      recipient?: { id?: string };
      timestamp?: number;
      message?: {
        mid?: string;
        text?: string;
        is_echo?: boolean;
        is_deleted?: boolean;
        is_unsupported?: boolean;
        quick_reply?: { payload?: string };
        attachments?: { type?: string; payload?: { url?: string } }[];
      };
      postback?: { mid?: string; title?: string; payload?: string };
    }[];
  }[];
}

const ATTACHMENT_NOTE: Record<string, string> = {
  audio: "sesli mesaj",
  video: "video",
  reel: "reels paylaşımı",
  ig_reel: "reels paylaşımı",
  share: "gönderi paylaşımı",
  ig_post: "gönderi paylaşımı",
  story_mention: "hikâyesinde işletmeyi etiketledi",
  file: "dosya",
};

// Webhook gövdesinden müşteri mesajlarını çıkarır. İşletmenin kendi gönderdikleri (echo),
// silinen mesajlar, okundu ve tepki bildirimleri atlanır. Hızlı yanıt seçildiyse seçeneğin
// tam metni (payload) mesaj sayılır.
export function parseInstagramMessages(payload: unknown): InstagramInbound[] {
  const body = payload as WebhookPayload;
  if (body?.object !== "instagram") return [];
  const result: InstagramInbound[] = [];
  for (const entry of body.entry ?? []) {
    const accountId = entry.id;
    for (const event of entry.messaging ?? []) {
      const from = event.sender?.id;
      const message = event.message;
      if (!accountId || !from || from === accountId) continue;
      if (event.postback?.mid) {
        result.push({
          id: event.postback.mid,
          accountId,
          from,
          text: event.postback.payload || event.postback.title || "",
          timestamp: event.timestamp ?? Date.now(),
        });
        continue;
      }
      if (!message?.mid || message.is_echo || message.is_deleted) continue;
      const image = message.attachments?.find((a) => a.type === "image" && a.payload?.url);
      const other = message.attachments?.find((a) => a.type !== "image");
      let text = message.quick_reply?.payload || message.text?.trim() || "";
      if (!text && !image && (other || message.is_unsupported)) {
        const what = (other?.type && ATTACHMENT_NOTE[other.type]) ?? "desteklenmeyen bir mesaj";
        text = `[Müşteri ${what} gönderdi; asistan şimdilik sadece metin ve fotoğraf okuyabiliyor.]`;
      }
      if (!text && !image) continue;
      result.push({ id: message.mid, accountId, from, text, imageUrl: image?.payload?.url, timestamp: event.timestamp ?? Date.now() });
    }
  }
  return result;
}

async function graph<T>(path: string, init: RequestInit & { token: string }, fetchImpl: typeof fetch = fetch): Promise<T> {
  const { token, ...rest } = init;
  const res = await fetchImpl(`${GRAPH}${path}`, {
    ...rest,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...rest.headers },
  });
  if (!res.ok) throw new Error(`Instagram isteği başarısız (${res.status}): ${(await res.text()).slice(0, 500)}`);
  return (await res.json()) as T;
}

// Instagram metin mesajı en fazla 1000 bayt. Uzun yanıt paragraf, sonra cümle sınırından bölünür.
const TEXT_BYTES = 1000;
export function splitText(text: string, limit = TEXT_BYTES): string[] {
  const bytes = (s: string) => Buffer.byteLength(s, "utf8");
  const parts: string[] = [];
  let rest = text.trim();
  while (bytes(rest) > limit) {
    let cut = rest.length;
    while (bytes(rest.slice(0, cut)) > limit) cut = Math.floor(cut * 0.9);
    const window = rest.slice(0, cut);
    const at = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"), window.lastIndexOf(". ") + 1, window.lastIndexOf(" "));
    const end = at > cut / 2 ? at : cut;
    parts.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

const QUICK_REPLY_LIMIT = 13;
const QUICK_TITLE = 20;

// Seçenekler hızlı yanıt olur (en fazla 13, başlık 20 karakter). Başlık kısalsa da müşteri
// seçince seçeneğin tam metni geri gelir.
export function buildQuickReplies(options: string[]) {
  return options.slice(0, QUICK_REPLY_LIMIT).map((o) => ({
    content_type: "text",
    title: o.length > QUICK_TITLE ? `${o.slice(0, QUICK_TITLE - 1)}…` : o,
    payload: o.slice(0, 1000),
  }));
}

export async function sendInstagramReply(params: {
  token: string;
  to: string;
  text: string;
  options?: string[];
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const { token, to, options = [], fetchImpl } = params;
  const parts = splitText(params.text);
  for (const [i, text] of parts.entries()) {
    const last = i === parts.length - 1;
    const message = last && options.length > 0 ? { text, quick_replies: buildQuickReplies(options) } : { text };
    await graph("/me/messages", { method: "POST", token, body: JSON.stringify({ recipient: { id: to }, message }) }, fetchImpl);
  }
}

// Müşterinin gönderdiği fotoğraf Meta'nın CDN adresinden indirilir (adres bir süre geçerlidir).
const MEDIA_HOST = /(^|\.)(fbcdn\.net|cdninstagram\.com|fbsbx\.com|facebook\.com|instagram\.com)$/;
function assertMediaUrl(url: string) {
  const u = new URL(url);
  if (u.protocol !== "https:" || !MEDIA_HOST.test(u.hostname)) throw new Error(`Beklenmeyen medya adresi: ${u.host}`);
}

export async function downloadInstagramImage(url: string, maxBytes: number, fetchImpl: typeof fetch = fetch) {
  // Yönlendirmeler kendiliğinden takip edilmez; her atlamada adres yeniden denetlenir (SSRF).
  assertMediaUrl(url);
  let res = await fetchImpl(url, { redirect: "manual" });
  for (let hop = 0; hop < 3 && res.status >= 300 && res.status < 400; hop++) {
    const next = res.headers.get("location");
    if (!next) break;
    const resolved = new URL(next, url).toString();
    assertMediaUrl(resolved);
    res = await fetchImpl(resolved, { redirect: "manual" });
  }
  if (!res.ok) throw new Error(`Fotoğraf indirilemedi (${res.status})`);
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > maxBytes) throw new Error("Fotoğraf çok büyük");
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length > maxBytes) throw new Error("Fotoğraf çok büyük");
  const mimeType = res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
  return { data, mimeType: mimeType.startsWith("image/") ? mimeType : "image/jpeg" };
}

// Müşterinin adı ve kullanıcı adı; panelde gösterilir. Alınamazsa boş geçilir.
export async function fetchInstagramProfile(token: string, igsid: string, fetchImpl: typeof fetch = fetch) {
  try {
    const p = await graph<{ name?: string; username?: string }>(`/${encodeURIComponent(igsid)}?fields=name,username`, { token }, fetchImpl);
    return p.name || (p.username ? `@${p.username}` : undefined);
  } catch {
    return undefined;
  }
}

// --- Hesap bağlama (OAuth) ---

export function instagramAppConfig() {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  return appId && appSecret ? { appId, appSecret } : undefined;
}

export function authorizeUrl(params: { appId: string; redirectUri: string; state: string }) {
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", params.appId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
  url.searchParams.set("state", params.state);
  url.searchParams.set("enable_fb_login", "0");
  url.searchParams.set("force_reauth", "true");
  return url.toString();
}

export interface ConnectedAccount {
  accountId: string; // Webhook'ta entry.id olarak gelen kimlik
  username?: string;
  token: string;
  expiresAt: string;
}

// Yetki kodunu uzun ömürlü (60 gün) anahtara çevirir, hesabı tanır ve mesaj bildirimlerine abone eder.
export async function connectAccount(
  params: { code: string; redirectUri: string; appId: string; appSecret: string },
  fetchImpl: typeof fetch = fetch,
): Promise<ConnectedAccount> {
  const form = new URLSearchParams({
    client_id: params.appId,
    client_secret: params.appSecret,
    grant_type: "authorization_code",
    redirect_uri: params.redirectUri,
    code: params.code.replace(/#_$/, ""),
  });
  const short = await fetchImpl("https://api.instagram.com/oauth/access_token", { method: "POST", body: form });
  if (!short.ok) throw new Error(`Instagram yetki kodu kabul edilmedi (${short.status}): ${(await short.text()).slice(0, 300)}`);
  const { access_token: shortToken } = (await short.json()) as { access_token: string };

  const longUrl = new URL("https://graph.instagram.com/access_token");
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", params.appSecret);
  longUrl.searchParams.set("access_token", shortToken);
  const long = await fetchImpl(longUrl);
  if (!long.ok) throw new Error(`Uzun ömürlü anahtar alınamadı (${long.status})`);
  const { access_token: token, expires_in } = (await long.json()) as { access_token: string; expires_in: number };

  const me = await graph<{ user_id?: string; id?: string; username?: string }>("/me?fields=user_id,username", { token }, fetchImpl);
  const accountId = me.user_id ?? me.id;
  if (!accountId) throw new Error("Instagram hesabı okunamadı");
  await graph("/me/subscribed_apps?subscribed_fields=messages", { method: "POST", token }, fetchImpl);
  return { accountId, username: me.username, token, expiresAt: new Date(Date.now() + expires_in * 1000).toISOString() };
}

// Uzun ömürlü anahtar kullanıldıkça 60 gün daha uzatılabilir (en az 24 saatlik olmalı).
export async function refreshToken(token: string, fetchImpl: typeof fetch = fetch) {
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", token);
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Anahtar yenilenemedi (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const { access_token, expires_in } = (await res.json()) as { access_token: string; expires_in: number };
  return { token: access_token, expiresAt: new Date(Date.now() + expires_in * 1000).toISOString() };
}

// Meta'nın "uygulamanın bağlantısı kaldırıldı" ve "verilerimi sil" istekleri: signed_request
// = base64url(imza).base64url(json), imza uygulama gizli anahtarıyla HMAC-SHA256.
export function parseSignedRequest(signedRequest: string, appSecret: string): { user_id?: string } | null {
  const [sig, payload] = signedRequest.split(".");
  if (!sig || !payload) return null;
  const expected = createHmac("sha256", appSecret).update(payload).digest();
  const received = Buffer.from(sig, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

// --- Anahtarın saklanması ---
// Erişim anahtarı veritabanında AES-256-GCM ile şifrelenir. Anahtar INSTAGRAM_TOKEN_KEY'den
// (yoksa oturum gizli anahtarından) türetilir; değişirse hesabın yeniden bağlanması gerekir.
function tokenKey(): Buffer {
  const secret = process.env.INSTAGRAM_TOKEN_KEY || process.env.SESSION_SECRET || process.env.PANEL_PASSWORD;
  if (!secret) {
    if (process.env.NODE_ENV === "production") throw new Error("INSTAGRAM_TOKEN_KEY tanımlı değil");
    return createHash("sha256").update("gelistirme-instagram-anahtari").digest();
  }
  return createHash("sha256").update(`instagram-token:${secret}`).digest();
}

export function sealToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function openToken(sealed: string): string {
  const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", tokenKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
