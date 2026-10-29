"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RunEvalButton({ businessId, disabled }: { businessId: string; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/ornekler/sinav?isletme=${encodeURIComponent(businessId)}`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (e) {
      setError(`Sınav tamamlanamadı: ${(e as Error).message.slice(0, 200)}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button type="button" className="btn" disabled={disabled || busy} onClick={() => void run()}>
        {busy ? "Sınav yapılıyor, birkaç dakika sürebilir…" : "Sınavı başlat"}
      </button>
      {busy && <p className="hand mt-2 text-xl">Asistan örnekleri tek tek fiyatlandırıyor…</p>}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
