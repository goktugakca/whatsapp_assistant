"use client";

import { useEffect, useRef, useState } from "react";

type Bubble = { from: "customer" | "assistant" | "system"; text: string };

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

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const message = text.trim();
    if (!message || pending) return;
    setText("");
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
      setBubbles((b) => [
        ...b,
        ...(data.reply ? [{ from: "assistant" as const, text: data.reply }] : []),
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
        {bubbles.map((b, i) =>
          b.from === "system" ? (
            <p key={i} className="text-center text-xs text-muted">
              {b.text}
            </p>
          ) : (
            <div key={i} className={`flex ${b.from === "customer" ? "justify-end" : "justify-start"}`}>
              <p
                dir="auto"
                className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm shadow-sm ${
                  b.from === "customer" ? "bg-bubble-out" : "bg-bubble-in"
                }`}
              >
                {b.text}
              </p>
            </div>
          ),
        )}
        {pending && <p className="text-xs text-muted">yazıyor…</p>}
      </div>

      <form onSubmit={send} className="flex gap-2 border-t border-border p-3">
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
