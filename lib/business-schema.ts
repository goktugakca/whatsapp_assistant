import { z } from "zod";
import type { Business } from "./business";

// Panelden kaydedilen işletme ayarlarının doğrulaması. Asistan bu bilgilerle randevu
// verdiği için tutarsız ayar (kapanış açılıştan önce, olmayan hizmet vb.) kaydedilmez.

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Saat SS:DD biçiminde olmalı");
const id = z.string().regex(/^[a-z0-9-]{1,40}$/, "Kimlik sadece küçük harf, rakam ve tire içerebilir");
const text = (max: number) => z.string().trim().max(max);

const workingHours = z
  .array(
    z
      .object({ day: z.number().int().min(0).max(6), open: time, close: time })
      .refine((h) => h.open < h.close, { message: "Kapanış saati açılıştan sonra olmalı" }),
  )
  .refine((list) => new Set(list.map((h) => h.day)).size === list.length, { message: "Aynı gün iki kez girilmiş" });

export const businessSchema = z
  .object({
    id,
    type: z.enum(["hair_salon", "barber", "nail_salon", "dental_clinic"]),
    name: text(100).min(2, "İşletme adı gerekli"),
    city: text(60),
    address: text(200),
    mapsUrl: z.union([z.url("Harita bağlantısı geçerli bir adres olmalı"), z.literal("")]).optional(),
    utcOffset: z.string().regex(/^[+-]\d{2}:\d{2}$/),
    languages: z.array(text(30).min(1)).min(1, "En az bir dil gerekli").max(10),
    whatsappPhoneNumberId: z.string().optional(),
    services: z
      .array(
        z.object({
          id,
          name: text(80).min(1, "Hizmet adı gerekli"),
          description: text(300),
          durationMinutes: z.number().int().min(5, "Süre en az 5 dakika").max(600, "Süre en fazla 600 dakika"),
          priceInfo: text(120),
        }),
      )
      .min(1, "En az bir hizmet gerekli")
      .max(50),
    staff: z
      .array(
        z.object({
          id,
          name: text(60).min(1, "Çalışan adı gerekli"),
          serviceIds: z.array(id).min(1, "Her çalışan en az bir hizmet yapmalı"),
          workingHours: workingHours.optional(),
        }),
      )
      .max(30),
    workingHours: workingHours.min(1, "En az bir çalışma günü gerekli"),
    slotMinutes: z.number().int().refine((n) => [10, 15, 20, 30, 60].includes(n), {
      message: "Randevu aralığı 10, 15, 20, 30 veya 60 dakika olmalı",
    }),
    faq: z.array(z.object({ q: text(200).min(1), a: text(600).min(1) })).max(30),
    policies: z.array(text(300).min(1)).max(20),
  })
  .superRefine((b, ctx) => {
    const serviceIds = new Set(b.services.map((s) => s.id));
    if (serviceIds.size !== b.services.length) {
      ctx.addIssue({ code: "custom", message: "İki hizmet aynı kimliğe sahip", path: ["services"] });
    }
    if (new Set(b.staff.map((s) => s.id)).size !== b.staff.length) {
      ctx.addIssue({ code: "custom", message: "İki çalışan aynı kimliğe sahip", path: ["staff"] });
    }
    for (const person of b.staff) {
      for (const sid of person.serviceIds) {
        if (!serviceIds.has(sid)) {
          ctx.addIssue({
            code: "custom",
            message: `${person.name} artık olmayan bir hizmete atanmış`,
            path: ["staff"],
          });
        }
      }
    }
  });

export type BusinessValidation = { ok: true; business: Business } | { ok: false; errors: string[] };

export function validateBusiness(input: unknown): BusinessValidation {
  const result = businessSchema.safeParse(input);
  if (!result.success) {
    return { ok: false, errors: [...new Set(result.error.issues.map((i) => i.message))] };
  }
  const { mapsUrl, ...rest } = result.data;
  return { ok: true, business: { ...rest, ...(mapsUrl ? { mapsUrl } : {}) } as Business };
}

// Hizmet veya çalışan adından kalıcı kimlik üretir (ör. "Saç + sakal" -> "sac-sakal").
export function slugify(name: string, taken: Set<string>): string {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };
  const base =
    name
      .toLocaleLowerCase("tr")
      .replace(/[çğıöşü]/g, (c) => map[c])
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "oge";
  let candidate = base;
  for (let n = 2; taken.has(candidate); n++) candidate = `${base}-${n}`;
  return candidate;
}
