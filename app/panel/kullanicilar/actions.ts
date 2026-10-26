"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { businesses } from "@/lib/business";
import { requireAdmin } from "@/lib/dal";
import { hashPassword } from "@/lib/password";
import { getStore } from "@/lib/store";

export type CreateUserState = { ok: boolean; message: string } | null;

const createUserInput = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,32}$/, "Kullanıcı adı 3–32 karakter; harf, rakam, nokta, tire")
    .refine((u) => u !== "admin", "Bu kullanıcı adı ayrılmış"),
  password: z.string().min(10, "Şifre en az 10 karakter olmalı").max(200),
  businessId: z.string().refine((id) => businesses.some((b) => b.id === id), "İşletme seçin"),
});

export async function createPanelUser(_prev: CreateUserState, formData: FormData): Promise<CreateUserState> {
  await requireAdmin();
  const parsed = createUserInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { username, password, businessId } = parsed.data;

  const user = await (await getStore()).createPanelUser({
    username,
    passwordHash: await hashPassword(password),
    businessId,
  });
  if (!user) return { ok: false, message: "Bu kullanıcı adı zaten var." };
  revalidatePath("/panel/kullanicilar");
  return { ok: true, message: `${username} oluşturuldu. Kullanıcı adını ve şifreyi işletmeyle güvenli bir yoldan paylaşın.` };
}

export async function deletePanelUser(formData: FormData) {
  await requireAdmin();
  await (await getStore()).deletePanelUser(z.string().parse(formData.get("userId")));
  revalidatePath("/panel/kullanicilar");
}
