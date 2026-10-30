// Ekran görüntüsü okuma sonucunun tarayıcıda da kullanılan kısmı (sunucu kütüphanesi çekmez).
import type { ExportMessage } from "./whatsapp-export";

export interface ScreenshotRead {
  chatKey: string; // headerName'in özeti; aynı sohbetin ekranlarını birleştirmek için
  platform: "whatsapp" | "instagram" | "unknown";
  messages: { from: "customer" | "salon" | "unknown"; text: string; photo?: string }[]; // photo: kırpılmış JPEG base64
  notes: string;
}

// Okunan ekranları (aynı sohbetin ekranları dosya adı sırasıyla art arda) lib/whatsapp-export'un
// anladığı mesaj listesine çevirir; fotoğraflar "foto-N" adıyla eklenir. Zaman bilgisi
// ekranlardan güvenilir okunamadığı için sıralı yapay zamanlar kullanılır.
export function toExportMessages(reads: ScreenshotRead[], base = Date.UTC(2026, 0, 1)): { messages: ExportMessage[]; photos: Map<string, string> } {
  const messages: ExportMessage[] = [];
  const photos = new Map<string, string>();
  let i = 0;
  for (const read of reads) {
    for (const m of read.messages) {
      if (m.from === "unknown") continue;
      let attachment: string | undefined;
      if (m.photo) {
        attachment = `foto-${i}.jpg`;
        photos.set(attachment, m.photo);
      }
      messages.push({ at: new Date(base + i * 60_000), sender: m.from, text: m.text, attachment });
      i++;
    }
  }
  return { messages, photos };
}
