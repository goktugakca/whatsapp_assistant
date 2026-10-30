import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// İşletmenin verdiği bağlantıdan (web sitesi, fiyat sayfası) sayfa metnini indirir.
// Sunucudan dış adres çekildiği için SSRF önlemleri: yalnızca http(s), iç ağ adresleri yasak,
// yönlendirmeler tek tek denetlenir, boyut ve süre sınırlı.
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const MAX_TEXT = 60_000;

function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Geçerli bir adres değil");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Adres http veya https ile başlamalı");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Bu adrese erişilemez");
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (ips.length === 0) throw new Error("Adres bulunamadı");
  if (ips.some(isPrivateIp)) throw new Error("Bu adrese erişilemez");
  return url;
}

// HTML'i sade metne çevirir: script/style atılır, blok etiketler satır sonu olur, tablolar
// hücre aralarında " | " ile yazılır ki "Kesim ... 500 TL" satırları korunsun.
export function htmlToText(html: string): string {
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(td|th)>/gi, " | ")
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/section|\/article|\/table)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
      if (code[0] === "#") {
        const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return entities[code.toLowerCase()] ?? m;
    })
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function fetchPageText(raw: string, fetchImpl: typeof fetch = fetch): Promise<{ title: string; text: string; finalUrl: string }> {
  let url = await assertPublicUrl(raw);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let res: Response | undefined;
    for (let hop = 0; hop < 4; hop++) {
      res = await fetchImpl(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": "Mozilla/5.0 (compatible; SiradaBot/1.0; +https://sirada.app)", accept: "text/html,*/*" },
      });
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get("location");
        if (!next) break;
        url = await assertPublicUrl(new URL(next, url).toString());
        continue;
      }
      break;
    }
    if (!res || !res.ok) throw new Error(`Sayfa açılamadı (${res?.status ?? "?"})`);
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/xhtml/.test(type)) throw new Error("Bu adres bir web sayfası değil");
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_BYTES) throw new Error("Sayfa çok büyük");
    const html = buffer.toString("utf8");
    const title = htmlToText(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").slice(0, 120);
    return { title, text: htmlToText(html).slice(0, MAX_TEXT), finalUrl: url.toString() };
  } finally {
    clearTimeout(timer);
  }
}
