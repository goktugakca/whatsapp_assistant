import Anthropic from "@anthropic-ai/sdk";
import { describeNow } from "../availability";
import type { Business } from "../business";
import { toCard, type AppointmentCard } from "../calendar";
import {
  historyWindow,
  hydrateMedia,
  mediaMarker,
  trimStoredHistory,
} from "../media";
import type { ParseQuote } from "../photo-quote";
import { containsProfanity } from "../profanity";
import type { Conversation, Store } from "../store";
import { buildSystemPrompt } from "./prompt";
import { addDays, localDate } from "../week";
import {
  buildTools,
  calendarIdFor,
  executeTool,
  type TurnEffects,
} from "./tools";

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
const EFFORT = (process.env.ANTHROPIC_EFFORT ?? "low") as
  | "low"
  | "medium"
  | "high";
const MAX_TOOL_ROUNDS = 8;

// Küfürlü mesaja model çağrılmadan sabit yanıt: ilkinde uyarı, ikincisinde engel.
export const PROFANITY_WARNING =
  "Size yalnızca işletmenin hizmetleri konusunda yardımcı olabilirim; lütfen bu şekilde yazmayalım. Nasıl yardımcı olabilirim?";
export const PROFANITY_BLOCKED =
  "Bu konuşmaya devam edemiyorum. İyi günler dilerim.";

export const FALLBACK_REPLY =
  "Mesajınızı aldık, en kısa sürede size dönüş yapacağız. / We received your message, we will get back to you shortly.";

let client: Anthropic | undefined;
const defaultCreateMessage: CreateMessage = (params) => {
  client ??= new Anthropic();
  return client.beta.messages.create(params);
};

// Modele giden geçmiş: son mesajlar; eski kısım atıldıysa müşteri hakkında bilinenler kısa
// bir notla başa konur ki asistan adı ve ilgisini yeniden sormasın.
function knownAbout(conversation: Conversation): string {
  const lead = conversation.lead;
  return [
    lead?.name && `adı ${lead.name}`,
    lead?.interest && `ilgilendiği hizmet: ${lead.interest}`,
    lead?.language && `dili ${lead.language}`,
  ]
    .filter(Boolean)
    .join(", ");
}

function windowed(
  conversation: Conversation,
): Anthropic.Beta.Messages.BetaMessageParam[] {
  const window = historyWindow(conversation.history);
  if (window.length === conversation.history.length) return window;
  const known = knownAbout(conversation);
  const note = `[Bu konuşmanın daha eski kısmı gösterilmiyor.${known ? ` Müşteri hakkında bilinenler: ${known}.` : ""}]`;
  return [
    { role: "user", content: note },
    { role: "assistant", content: "Anlaşıldı." },
    ...window,
  ];
}

// Personel konuşmayı yeniden açınca (devir veya engel sonrası) modelin geçmişi. Engel
// kaldırıldığında küfürlü kısım geçmişten atılır: model aksi halde o tutumu sürdürüyor ya da
// güvenlik reddi veriyor. Panelde görünen transcript olduğu gibi kalır.
export function reopenHistory(
  conversation: Conversation,
): Conversation["history"] {
  const known = knownAbout(conversation);
  if (conversation.status === "blocked") {
    const note = `[İşletme personeli engeli kaldırdı; konuşmaya temiz başla ve müşteriye normal şekilde yardımcı ol.${known ? ` Müşteri hakkında bilinenler: ${known}.` : ""}]`;
    return [
      { role: "user", content: note },
      { role: "assistant", content: "Anlaşıldı." },
    ];
  }
  return [
    ...conversation.history,
    {
      role: "user",
      content:
        "[İşletme personeli asistanı bu konuşmada yeniden açtı; kaldığın yerden normal şekilde devam et.]",
    },
    { role: "assistant", content: "Anlaşıldı." },
  ];
}

const whenFmt = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "Europe/Istanbul",
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

// Müşterinin yaklaşan randevuları her turda bağlam olarak verilir; asistan selamlaşmada
// bunları hatırlatıp değiştir/iptal/yeni seçeneklerini sunar, araç çağırmadan bilir.
async function upcomingContext(
  business: Business,
  conversation: Conversation,
  store: Store,
  now: Date,
): Promise<string> {
  try {
    const range = {
      from: now.toISOString(),
      to: new Date(now.getTime() + 60 * 86_400_000).toISOString(),
    };
    const mine = (
      await store.listAppointments(
        calendarIdFor(business.id, conversation.channel),
        range,
      )
    ).filter((a) => a.contact === conversation.contact);
    if (mine.length === 0) return "";
    const lines = mine.slice(0, 3).map((a) => {
      const service =
        business.services.find((s) => s.id === a.serviceId)?.name ??
        a.serviceId;
      const staff = business.staff.find((s) => s.id === a.staffId)?.name;
      return `${whenFmt.format(new Date(a.start))} · ${service}${staff ? ` · ${staff}` : ""} (kimlik ${a.id})`;
    });
    return `\n[Müşterinin yaklaşan randevusu: ${lines.join("; ")}]`;
  } catch {
    return "";
  }
}

// Model show_options'ı atladığında koddan düğme: evet/hayır sorusuna "Evet / Hayır", "hangi gün"
// sorusuna önümüzdeki açık günler. Müşteri yazmak yerine dokunsun.
const DAY_SHORT = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const MONTH_SHORT = [
  "Oca",
  "Şub",
  "Mar",
  "Nis",
  "May",
  "Haz",
  "Tem",
  "Ağu",
  "Eyl",
  "Eki",
  "Kas",
  "Ara",
];
export function fallbackOptions(
  reply: string,
  business: Business,
  now: Date,
): string[] {
  const last =
    reply
      .trim()
      .split(/(?<=[.!?])\s+/)
      .at(-1) ?? "";
  if (/hangi g[üu]n/i.test(last)) {
    const today = localDate(now, business.utcOffset);
    const labels: string[] = [];
    for (let i = 1; i <= 14 && labels.length < 6; i++) {
      const date = addDays(today, i);
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      if (!business.workingHours.some((h) => h.day === weekday)) continue;
      const [, m, d] = date.split("-").map(Number);
      labels.push(
        i === 1 ? "Yarın" : `${DAY_SHORT[weekday]} ${d} ${MONTH_SHORT[m - 1]}`,
      );
    }
    return labels;
  }
  if (/\b(mi|mı|mu|mü|misiniz|mısınız|musunuz|müsünüz)\s*\?\s*$/i.test(last))
    return ["Evet", "Hayır"];
  return [];
}

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

  conversation.transcript.push({
    from: "customer",
    text,
    at: now.toISOString(),
    mediaId: params.mediaId,
  });
  const upcoming = await upcomingContext(business, conversation, store, now);
  const message = `[Şu an: ${describeNow(business, now)}]${upcoming}\n${text || (params.mediaId ? "(Müşteri sadece fotoğraf gönderdi.)" : "")}`;
  conversation.history.push({
    role: "user",
    content: params.mediaId
      ? [mediaMarker(params.mediaId), { type: "text", text: message }]
      : message,
  });
  const mediaCache = new Map();
  conversation.history = trimStoredHistory(conversation.history);

  // Küfür/hakaret içeren mesajda model çağrılmaz: ilkinde tek cümlelik uyarı, tekrarında engel.
  if (containsProfanity(text)) {
    // Uyarı yakın geçmişteyse (son 10 mesaj) tekrar sayılır; aylar önceki uyarı engel gerektirmez.
    const warnedBefore = conversation.transcript
      .slice(-10)
      .some((m) => m.from === "assistant" && m.text === PROFANITY_WARNING);
    const reply = warnedBefore ? PROFANITY_BLOCKED : PROFANITY_WARNING;
    if (warnedBefore) {
      conversation.status = "blocked";
      conversation.handoffReason = "Uyarıya rağmen küfürlü mesaj";
    }
    conversation.history.push({ role: "assistant", content: reply });
    conversation.transcript.push({
      from: "assistant",
      text: reply,
      at: new Date().toISOString(),
    });
    return { reply, handedOff: false, options: [], appointments: [] };
  }

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
        messages: await hydrateMedia(windowed(conversation), store, mediaCache),
      });

      roundTimes.push(Date.now() - roundStart);

      if (response.stop_reason === "refusal") {
        // Model (ve yedek modeller) yanıtlamadı: bu turu geçmişe eklemeden insana devret.
        console.warn(
          `asistan reddetti: ${business.id} konuşma ${conversation.id}`,
        );
        conversation.status = "handoff";
        conversation.handoffReason = "Asistan bu mesajı yanıtlayamadı.";
        replyParts.length = 0;
        replyParts.push(FALLBACK_REPLY);
        break;
      }

      conversation.history.push({
        role: "assistant",
        content: response.content,
      });
      for (const block of response.content) {
        if (block.type !== "text" || !block.text.trim()) continue;
        // Soru sorulup düğmeler gösterildikten sonra model aynı soruyu bir kez daha yazma
        // eğiliminde ("Hangi saat size uygun?"). Düğmelerin üstünde tek soru kalsın diye
        // bu noktadan sonraki metin geçmişte kalır ama müşteriye gitmez.
        if (askedWithOptions) continue;
        replyParts.push(block.text.trim());
      }

      const toolUses = response.content.filter(
        (b): b is Anthropic.Beta.Messages.BetaToolUseBlock =>
          b.type === "tool_use",
      );
      if (response.stop_reason !== "tool_use" || toolUses.length === 0) break;

      const results: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = [];
      for (const tool of toolUses) {
        let outcome;
        try {
          outcome = await executeTool(tool.name, tool.input, {
            business,
            conversation,
            store,
            now,
            effects,
            parseQuote: params.parseQuote,
          });
        } catch (error) {
          outcome = {
            content: `Araç hatası: ${(error as Error).message}`,
            isError: true,
          };
        }
        results.push({
          type: "tool_result",
          tool_use_id: tool.id,
          content: outcome.content,
          is_error: outcome.isError,
        });
      }
      conversation.history.push({ role: "user", content: results });
      if (effects.options.length > 0 && replyParts.join(" ").includes("?"))
        askedWithOptions = true;
    }
    // Tur sınırına araç çağrısıyla gelindiyse iş yarım kaldı: müşteri boş vaatle bırakılmasın.
    const last = conversation.history.at(-1);
    if (
      last?.role === "user" &&
      typeof last.content !== "string" &&
      last.content.some((b) => b.type === "tool_result")
    ) {
      conversation.status = "handoff";
      conversation.handoffReason =
        "Asistan işlemi tamamlayamadı (çok fazla adım).";
      replyParts.length = 0;
      replyParts.push(FALLBACK_REPLY);
    }
  } catch (error) {
    console.error("Asistan hatası:", error);
    conversation.status = "handoff";
    conversation.handoffReason =
      "Teknik hata nedeniyle otomatik yanıt verilemedi.";
    replyParts.length = 0;
    replyParts.push(FALLBACK_REPLY);
  }

  // Yanıt süresini Vercel loglarında izlemek için: toplam süre ve her model çağrısının süresi.
  console.info(
    `asistan: ${business.id} ${Date.now() - startedAt}ms, model çağrıları [${roundTimes.join(", ")}]ms, model ${MODEL}`,
  );
  if (replyParts.length === 0 && conversation.status === "bot") {
    // Model metin üretmedi (boş yanıt): aynı yedek cümleyi her mesajda tekrarlamak yerine personele bırak.
    console.warn(
      `asistan boş yanıt verdi: ${business.id} konuşma ${conversation.id}`,
    );
    conversation.status = "handoff";
    conversation.handoffReason = "Asistan yanıt üretemedi.";
  }
  const reply = replyParts.join("\n\n") || FALLBACK_REPLY;
  conversation.transcript.push({
    from: "assistant",
    text: reply,
    at: new Date().toISOString(),
  });

  const appointments: AppointmentCard[] = [];
  for (const id of effects.bookedAppointmentIds) {
    const appointment = await store.getAppointment(id);
    if (appointment) appointments.push(toCard(business, appointment));
  }
  // Devredilen konuşmada müşteriye artık seçenek sunulmaz.
  const options =
    conversation.status === "bot"
      ? effects.options.length > 0
        ? effects.options
        : fallbackOptions(reply, business, now)
      : [];
  return {
    reply,
    handedOff: conversation.status === "handoff",
    options,
    appointments,
  };
}
