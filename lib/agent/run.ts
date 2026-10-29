import Anthropic from "@anthropic-ai/sdk";
import { describeNow } from "../availability";
import type { Business } from "../business";
import { toCard, type AppointmentCard } from "../calendar";
import { hydrateMedia, mediaMarker } from "../media";
import type { ParseQuote } from "../photo-quote";
import type { Conversation, Store } from "../store";
import { buildSystemPrompt } from "./prompt";
import { buildTools, executeTool, type TurnEffects } from "./tools";

type CreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
export type CreateMessage = (params: CreateParams) => Promise<BetaMessage>;

// Resepsiyon işi kısa yanıtlar ve birkaç araç çağrısından ibaret; hız ve maliyet için
// Haiku yeterli. Saat ve çakışma kontrolleri kodda yapıldığı için model hata yapamaz.
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-5-5";
// Reddedilen isteği başka modelde yeniden çalıştırma (server-side fallback) sadece bu
// modellerde var; Haiku'ya gönderilirse istek reddedilir.
const SUPPORTS_FALLBACK = /^claude-(opus|sonnet|fable)-/.test(MODEL);
// Sohbet için düşük efor yeterli ve yanıtı hızlandırır; ölçerek ayarlanmalı.
const EFFORT = (process.env.ANTHROPIC_EFFORT ?? "low") as "low" | "medium" | "high";
const MAX_TOOL_ROUNDS = 8;

export const FALLBACK_REPLY =
  "Mesajınızı aldık, en kısa sürede size dönüş yapacağız. / We received your message, we will get back to you shortly.";

let client: Anthropic | undefined;
const defaultCreateMessage: CreateMessage = (params) => {
  client ??= new Anthropic();
  return client.beta.messages.create(params);
};

export interface RunResult {
  reply: string;
  handedOff: boolean;
  options: string[]; // Müşteriye düğme olarak gösterilecek seçenekler
  appointments: AppointmentCard[]; // Bu turda oluşturulan randevular
}

// Müşteriden gelen bir mesajı işler: modeli araçlarla çalıştırır, konuşmayı günceller
// ve müşteriye gönderilecek metni döndürür. Konuşmayı kaydetmek çağıranın işidir.
export async function runAssistant(params: {
  business: Business;
  conversation: Conversation;
  store: Store;
  text: string;
  // Müşterinin bu mesajla gönderdiği fotoğraf (media tablosunda kayıtlı). Model görür.
  mediaId?: string;
  now?: Date;
  createMessage?: CreateMessage;
  parseQuote?: ParseQuote;
}): Promise<RunResult> {
  const { business, conversation, store, text } = params;
  const createMessage = params.createMessage ?? defaultCreateMessage;
  const now = params.now ?? new Date();

  conversation.transcript.push({ from: "customer", text, at: now.toISOString(), mediaId: params.mediaId });
  const message = `[Şu an: ${describeNow(business, now)}]\n${text || (params.mediaId ? "(Müşteri sadece fotoğraf gönderdi.)" : "")}`;
  conversation.history.push({
    role: "user",
    content: params.mediaId ? [mediaMarker(params.mediaId), { type: "text", text: message }] : message,
  });
  const mediaCache = new Map();

  const system = buildSystemPrompt(business);
  const tools = buildTools(business);
  const replyParts: string[] = [];
  const effects: TurnEffects = { options: [], bookedAppointmentIds: [] };
  let askedWithOptions = false;

  const startedAt = Date.now();
  const roundTimes: number[] = [];
  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const roundStart = Date.now();
      const response = await createMessage({
        model: MODEL,
        max_tokens: 4096,
        ...(SUPPORTS_FALLBACK && {
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default" as const,
        }),
        output_config: { effort: EFFORT },
        cache_control: { type: "ephemeral" },
        system,
        tools,
        messages: await hydrateMedia(conversation.history, store, mediaCache),
      });

      roundTimes.push(Date.now() - roundStart);

      if (response.stop_reason === "refusal") {
        // Model (ve yedek modeller) yanıtlamadı: bu turu geçmişe eklemeden insana devret.
        conversation.status = "handoff";
        conversation.handoffReason = "Asistan bu mesajı yanıtlayamadı.";
        replyParts.length = 0;
        replyParts.push(FALLBACK_REPLY);
        break;
      }

      conversation.history.push({ role: "assistant", content: response.content });
      for (const block of response.content) {
        if (block.type !== "text" || !block.text.trim()) continue;
        // Soru sorulup düğmeler gösterildikten sonra model aynı soruyu bir kez daha yazma
        // eğiliminde ("Hangi saat size uygun?"). Düğmelerin üstünde tek soru kalsın diye
        // bu noktadan sonraki metin geçmişte kalır ama müşteriye gitmez.
        if (askedWithOptions) continue;
        replyParts.push(block.text.trim());
      }

      const toolUses = response.content.filter(
        (b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use",
      );
      if (response.stop_reason !== "tool_use" || toolUses.length === 0) break;

      const results: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = [];
      for (const tool of toolUses) {
        let outcome;
        try {
          outcome = await executeTool(tool.name, tool.input, { business, conversation, store, now, effects, parseQuote: params.parseQuote });
        } catch (error) {
          outcome = { content: `Araç hatası: ${(error as Error).message}`, isError: true };
        }
        results.push({
          type: "tool_result",
          tool_use_id: tool.id,
          content: outcome.content,
          is_error: outcome.isError,
        });
      }
      conversation.history.push({ role: "user", content: results });
      if (effects.options.length > 0 && replyParts.join(" ").includes("?")) askedWithOptions = true;
    }
  } catch (error) {
    console.error("Asistan hatası:", error);
    conversation.status = "handoff";
    conversation.handoffReason = "Teknik hata nedeniyle otomatik yanıt verilemedi.";
    replyParts.length = 0;
    replyParts.push(FALLBACK_REPLY);
  }

  // Yanıt süresini Vercel loglarında izlemek için: toplam süre ve her model çağrısının süresi.
  console.info(
    `asistan: ${business.id} ${Date.now() - startedAt}ms, model çağrıları [${roundTimes.join(", ")}]ms, model ${MODEL}`,
  );
  const reply = replyParts.join("\n\n") || FALLBACK_REPLY;
  conversation.transcript.push({ from: "assistant", text: reply, at: new Date().toISOString() });

  const appointments: AppointmentCard[] = [];
  for (const id of effects.bookedAppointmentIds) {
    const appointment = await store.getAppointment(id);
    if (appointment) appointments.push(toCard(business, appointment));
  }
  // Devredilen konuşmada müşteriye artık seçenek sunulmaz.
  const options = conversation.status === "handoff" ? [] : effects.options;
  return { reply, handedOff: conversation.status === "handoff", options, appointments };
}
