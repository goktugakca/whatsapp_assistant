"use client";

import { useEffect, useRef, useState } from "react";
import { AppointmentCardView } from "@/app/components/appointment-card";
import type { AppointmentCard } from "@/lib/calendar";

type Bubble =
  | { from: "customer" | "system"; text: string }
  | { from: "assistant"; text: string; options: string[] }
  | { from: "card"; card: AppointmentCard };

function newSessionId() {
  return crypto.randomUUID();
}

export function DemoChat({ businessId, businessName }: { businessId: string; businessName: string }) {
  const [sessionId, setSessionId] = useState(newSessionId);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Sadece mesaj alanını kaydır; scrollIntoView mobilde bütün sayfayı kaydırıyordu.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [bubbles, pending]);

  // Düğmeler sadece son asistan mesajında ve müşteri henüz yanıt vermemişken görünür.
  const lastAssistant = bubbles.findLastIndex((b) => b.from === "assistant");
  const optionsVisible = !pending && !bubbles.slice(lastAssistant + 1).some((b) => b.from === "customer");

  async function sendMessage(message: string) {
    if (!message || pending) return;
    setBubbles((b) => [...b, { from: "customer", text: message }]);
    setPending(true);
    try {
      const res = await fetch("/api/demo/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, sessionId, text: message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Hata");
      const cards: AppointmentCard[] = data.appointments ?? [];
      setBubbles((b) => [
        ...b,
        ...(data.reply ? [{ from: "assistant" as const, text: data.reply, options: data.options ?? [] }] : []),
        ...cards.map((card) => ({ from: "card" as const, card })),
        ...(data.note ? [{ from: "system" as const, text: data.note }] : []),
        ...(data.handedOff && data.reply
          ? [{ from: "system" as const, text: "Konuşma işletmeye devredildi." }]
          : []),
      ]);
    } catch (error) {
      setBubbles((b) => [...b, { from: "system", text: `Yanıt alınamadı: ${(error as Error).message}` }]);
    } finally {
      setPending(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const message = text.trim();
    if (!message || pending) return;
    setText("");
    void sendMessage(message);
  }

  function reset() {
    setSessionId(newSessionId());
    setBubbles([]);
  }

  return (
    <section className="flex h-[70vh] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="font-semibold">{businessName}</p>
          <p className="text-xs text-muted">WhatsApp asistanı · demo</p>
        </div>
        <button onClick={reset} className="text-xs text-muted underline">
          Yeni konuşma
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-background p-4">
        {bubbles.length === 0 && (
          <p className="mt-10 text-center text-sm text-muted">Müşteri gibi bir mesaj yazarak başlayın.</p>
        )}
        {bubbles.map((b, i) => {
          if (b.from === "system") {
            return (
              <p key={i} className="text-center text-xs text-muted">
                {b.text}
              </p>
            );
          }
          if (b.from === "card") {
            return (
              <div key={i} className="max-w-[85%]">
                <AppointmentCardView card={b.card} compact />
              </div>
            );
          }
          return (
            <div key={i} className={`flex flex-col ${b.from === "customer" ? "items-end" : "items-start"}`}>
              <p
                dir="auto"
                className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm shadow-sm ${
                  b.from === "customer" ? "bg-bubble-out" : "bg-bubble-in"
                }`}
              >
                {b.text}
              </p>
              {b.from === "assistant" && i === lastAssistant && optionsVisible && b.options.length > 0 && (
                <div className="mt-2 flex max-w-[85%] flex-wrap gap-2" role="group" aria-label="Seçenekler">
                  {b.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => void sendMessage(option)}
                      className="rounded-full border border-accent/60 bg-card px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent hover:text-accent-foreground"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {pending && <p className="text-xs text-muted">yazıyor…</p>}
      </div>

      <form onSubmit={submit} className="flex gap-2 border-t border-border p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Mesaj yazın"
          dir="auto"
          className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={pending || !text.trim()}
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
        >
          Gönder
        </button>
      </form>
    </section>
  );
}
