"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { getBusinessById, phoneNumberIdFor } from "@/lib/business";
import { isPanelAuthorized } from "@/lib/panel-auth";
import { getStore } from "@/lib/store";
import { sendText } from "@/lib/whatsapp";

async function requirePanelAuth() {
  if (!isPanelAuthorized((await headers()).get("authorization"))) throw new Error("Yetkisiz");
}

export async function resumeAssistant(formData: FormData) {
  await requirePanelAuth();
  const id = z.string().parse(formData.get("conversationId"));
  const store = getStore();
  const conversation = await store.getConversation(id);
  if (!conversation) return;
  conversation.status = "bot";
  conversation.handoffReason = undefined;
  await store.saveConversation(conversation);
  revalidatePath("/panel");
}

export async function sendStaffReply(formData: FormData) {
  await requirePanelAuth();
  const id = z.string().parse(formData.get("conversationId"));
  const text = z.string().trim().min(1).max(4000).parse(formData.get("text"));
  const store = getStore();
  const conversation = await store.getConversation(id);
  if (!conversation) return;

  if (conversation.channel === "whatsapp") {
    const business = getBusinessById(conversation.businessId);
    const phoneNumberId = business && phoneNumberIdFor(business);
    if (!phoneNumberId) throw new Error("İşletmenin WhatsApp numarası tanımlı değil");
    await sendText({ phoneNumberId, to: conversation.contact, text });
  }

  conversation.transcript.push({ from: "staff", text, at: new Date().toISOString() });
  // Asistan yeniden açıldığında personelin ne dediğini bilsin.
  conversation.history.push({ role: "assistant", content: `[İşletme personeli yazdı] ${text}` });
  await store.saveConversation(conversation);
  revalidatePath("/panel");
}
