import Anthropic from "@anthropic-ai/sdk";
import { describeNow } from "../availability";
import type { Clinic } from "../clinic";
import type { Conversation, Store } from "../store";
import { buildSystemPrompt } from "./prompt";
import { buildTools, executeTool } from "./tools";

type CreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
export type CreateMessage = (params: CreateParams) => Promise<BetaMessage>;

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";
// Sohbet için düşük efor yeterli ve yanıtı hızlandırır; ölçerek ayarlanmalı.
const EFFORT = (process.env.ANTHROPIC_EFFORT ?? "low") as "low" | "medium" | "high";
const MAX_TOOL_ROUNDS = 8;

export const FALLBACK_REPLY =
  "Mesajınızı aldık, ekibimiz en kısa sürede size dönüş yapacak. / We received your message, our team will get back to you shortly.";

let client: Anthropic | undefined;
const defaultCreateMessage: CreateMessage = (params) => {
  client ??= new Anthropic();
  return client.beta.messages.create(params);
};

export interface RunResult {
  reply: string;
  handedOff: boolean;
}

// Hastadan gelen bir mesajı işler: modeli araçlarla çalıştırır, konuşmayı günceller
// ve hastaya gönderilecek metni döndürür. Konuşmayı kaydetmek çağıranın işidir.
export async function runAssistant(params: {
  clinic: Clinic;
  conversation: Conversation;
  store: Store;
  text: string;
  now?: Date;
  createMessage?: CreateMessage;
}): Promise<RunResult> {
  const { clinic, conversation, store, text } = params;
  const createMessage = params.createMessage ?? defaultCreateMessage;
  const now = params.now ?? new Date();

  conversation.transcript.push({ from: "patient", text, at: now.toISOString() });
  conversation.history.push({
    role: "user",
    content: `[Şu an: ${describeNow(clinic, now)}]\n${text}`,
  });

  const system = buildSystemPrompt(clinic);
  const tools = buildTools(clinic);
  const replyParts: string[] = [];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await createMessage({
        model: MODEL,
        max_tokens: 4096,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: EFFORT },
        cache_control: { type: "ephemeral" },
        system,
        tools,
        messages: conversation.history,
      });

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
        if (block.type === "text" && block.text.trim()) replyParts.push(block.text.trim());
      }

      const toolUses = response.content.filter(
        (b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use",
      );
      if (response.stop_reason !== "tool_use" || toolUses.length === 0) break;

      const results: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = [];
      for (const tool of toolUses) {
        let outcome;
        try {
          outcome = await executeTool(tool.name, tool.input, { clinic, conversation, store, now });
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
    }
  } catch (error) {
    console.error("Asistan hatası:", error);
    conversation.status = "handoff";
    conversation.handoffReason = "Teknik hata nedeniyle otomatik yanıt verilemedi.";
    replyParts.length = 0;
    replyParts.push(FALLBACK_REPLY);
  }

  const reply = replyParts.join("\n\n") || FALLBACK_REPLY;
  conversation.transcript.push({ from: "assistant", text: reply, at: new Date().toISOString() });
  return { reply, handedOff: conversation.status === "handoff" };
}
