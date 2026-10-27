import type { Service } from "./business";
import { slugify } from "./business-schema";

// Fiyat listesi fotoğrafından çıkarılan hizmetlerin ayarlar formuna eklenmesi. Tarayıcıda da
// çalışır (model çağrısı lib/price-list-import.ts'de, sunucuda).

export interface ExtractedService {
  name: string;
  priceInfo: string;
  durationMinutes: number;
  durationEstimated: boolean;
  description: string;
  // Mevcut listede farklı adla zaten olan aynı hizmet ("Brezilya Fönü" -> "Keratin bakımı"); yoksa boş.
  sameAs: string;
}

const roundDuration = (n: number) => Math.min(600, Math.max(5, Math.round((Number.isFinite(n) ? n : 30) / 5) * 5));
const key = (name: string) => name.trim().toLocaleLowerCase("tr").replace(/\s+/g, " ");

// Çıkarılan hizmetleri mevcut listeyle birleştirir. Aynı hizmet (aynı ad veya model sameAs ile
// eşleştirdiyse) yeni kayıt açmaz: kimliği ve süresi korunur (geçmiş randevular ona bağlı),
// fiyatı güncellenir. replace=true ise listede olmayan mevcut hizmetler çıkarılır.
// addedIds yeni hizmetler, estimatedIds bunlardan süresi listede yazmayıp tahmin edilenler.
export function mergeServices(
  existing: Service[],
  extracted: ExtractedService[],
  options: { replace?: boolean } = {},
): { services: Service[]; addedIds: string[]; estimatedIds: string[]; updated: number; removed: number } {
  const byKey = new Map(existing.map((s) => [key(s.name), s]));
  const taken = new Set(existing.map((s) => s.id));
  const kept = new Map<string, Service>(); // id -> güncel hali
  const added: Service[] = [];
  const addedIds: string[] = [];
  const estimatedIds: string[] = [];
  let updated = 0;

  for (const item of extracted) {
    const name = item.name.trim();
    if (!name) continue;
    const match = byKey.get(key(name)) ?? (item.sameAs.trim() ? byKey.get(key(item.sameAs)) : undefined);
    if (match) {
      const current = kept.get(match.id) ?? { ...match };
      const price = item.priceInfo.trim().slice(0, 120);
      if (price && price !== current.priceInfo) {
        current.priceInfo = price;
        updated++;
      }
      kept.set(match.id, current);
      continue;
    }
    if (added.some((s) => key(s.name) === key(name))) continue;
    const id = slugify(name, taken);
    taken.add(id);
    added.push({
      id,
      name: name.slice(0, 80),
      description: item.description.trim().slice(0, 300),
      durationMinutes: roundDuration(item.durationMinutes),
      priceInfo: item.priceInfo.trim().slice(0, 120),
    });
    addedIds.push(id);
    if (item.durationEstimated) estimatedIds.push(id);
  }

  const base = existing.filter((s) => !options.replace || kept.has(s.id)).map((s) => kept.get(s.id) ?? s);
  return {
    services: [...base, ...added],
    addedIds,
    estimatedIds,
    updated,
    removed: existing.length - base.length,
  };
}
