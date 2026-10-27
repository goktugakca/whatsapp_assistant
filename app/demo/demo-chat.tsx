"use client";

import { useEffect, useRef, useState } from "react";
import { AppointmentCardView } from "@/app/components/appointment-card";
import type { AppointmentCard } from "@/lib/calendar";
import { blobToBase64, shrinkImage } from "@/lib/shrink-image";

type Bubble =
  | { from: "customer"; text: string; imageUrl?: string }
  | { from: "system"; text: string }
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

  async function sendMessage(message: string, photo?: File) {
    if ((!message && !photo) || pending) return;
    setPending(true);
    try {
      let image: { mediaType: string; data: string } | undefined;
      let imageUrl: string | undefined;
      if (photo) {
        const small = await shrinkImage(photo, 1600).catch(() => {
          throw new Error("Fotoğraf açılamadı, JPG veya PNG deneyin");
        });
        image = { mediaType: "image/jpeg", data: await blobToBase64(small) };
        imageUrl = URL.createObjectURL(small);
      }
      setBubbles((b) => [...b, { from: "customer", text: message, imageUrl }]);
      const res = await fetch("/api/demo/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, sessionId, text: message, image }),
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

  // Fotoğraf seçilince yazılmış metinle birlikte (WhatsApp'taki açıklama gibi) hemen gider.
  function sendPhoto(file: File | undefined) {
    if (!file || pending) return;
    const message = text.trim();
    setText("");
    void sendMessage(message, file);
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
              {b.from === "customer" && b.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- tarayıcıdaki geçici (blob:) önizleme
                <img src={b.imageUrl} alt="Gönderdiğiniz fotoğraf" className="mb-1 max-h-48 max-w-[70%] rounded-2xl" />
              )}
              {b.text && (
                <p
                  dir="auto"
                  className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm shadow-sm ${
                    b.from === "customer" ? "bg-bubble-out" : "bg-bubble-in"
                  }`}
                >
                  {b.text}
                </p>
              )}
              {b.from === "assistant" && i === lastAssistant && optionsVisible && b.options.length > 0 && (
                <div className="mt-2 flex max-w-[85%] flex-wrap gap-2" role="group" aria-label="Seçenekler">
                  {b.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => void sendMessage(option)}
                      className="btn btn-line btn-sm"
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
        <label className={`btn btn-line px-3 ${pending ? "pointer-events-none opacity-50" : ""}`} title="Fotoğraf gönder">
          <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
            <circle cx="12" cy="13.5" r="3.5" />
          </svg>
          <span className="sr-only">Fotoğraf gönder</span>
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={pending}
            onChange={(e) => {
              sendPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Mesaj yazın"
          dir="auto"
          className="field flex-1"
        />
        <button
          type="submit"
          disabled={pending || !text.trim()}
          className="btn"
        >
          Gönder
        </button>
      </form>
    </section>
  );
}
