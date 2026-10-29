"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Konuşma kutusu: en son mesaj görünsün diye açılışta en alta kaydırılır.
export function ScrollToBottom({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  });
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

// Geri alınamayan işlemler (iptal, engelleme) için onay soran gönder düğmesi.
export function ConfirmButton({ message, className, children }: { message: string; className?: string; children: ReactNode }) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

// Telefonda haftalık ızgara yatay kaydırmalı; açılışta bugünün sütunu görünür olsun.
export function ScrollToColumn({ index, columns, className, children }: { index: number; columns: number; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || index < 0 || el.scrollWidth <= el.clientWidth) return;
    const firstColumn = 56; // saat sütunu
    const dayWidth = (el.scrollWidth - firstColumn) / columns;
    el.scrollLeft = Math.max(0, firstColumn + dayWidth * index - (el.clientWidth - firstColumn) / 2 + dayWidth / 2 - firstColumn);
  }, [index, columns]);
  return (
    <section ref={ref} className={className}>
      {children}
    </section>
  );
}
