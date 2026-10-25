"use server";

import { z } from "zod";
import { getStore } from "@/lib/store";

const waitlistInput = z.object({
  clinicName: z.string().trim().min(2).max(120),
  contactName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(30),
  city: z.string().trim().max(60).optional(),
});

export type WaitlistState = { ok: boolean; message: string } | null;

export async function joinWaitlist(_prev: WaitlistState, formData: FormData): Promise<WaitlistState> {
  const parsed = waitlistInput.safeParse({
    clinicName: formData.get("clinicName"),
    contactName: formData.get("contactName"),
    phone: formData.get("phone"),
    city: formData.get("city") || undefined,
  });
  if (!parsed.success) return { ok: false, message: "Lütfen klinik adı, adınız ve telefonunuzu eksiksiz girin." };

  await getStore().addWaitlistEntry(parsed.data);
  console.info("Yeni pilot başvurusu:", parsed.data.clinicName, parsed.data.city ?? "");
  return { ok: true, message: "Teşekkürler! 24 saat içinde WhatsApp'tan size ulaşacağız." };
}
