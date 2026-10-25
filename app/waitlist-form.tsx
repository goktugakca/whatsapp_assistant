"use client";

import { useActionState } from "react";
import { joinWaitlist, type WaitlistState } from "./actions";

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent";

export function WaitlistForm({ businessTypes }: { businessTypes: string[] }) {
  const [state, action, pending] = useActionState<WaitlistState, FormData>(joinWaitlist, null);

  if (state?.ok) {
    return <p className="rounded-lg bg-bubble-out p-4 text-sm">{state.message}</p>;
  }

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input name="businessName" placeholder="İşletme adı" required className={inputClass} />
      <select name="businessType" defaultValue="" className={inputClass}>
        <option value="" disabled>
          İşletme türü
        </option>
        {businessTypes.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
        <option value="Diğer">Diğer</option>
      </select>
      <input name="contactName" placeholder="Adınız" required className={inputClass} />
      <input name="phone" placeholder="WhatsApp numaranız" required inputMode="tel" className={inputClass} />
      <input name="city" placeholder="Şehir" className={`${inputClass} sm:col-span-2`} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-60 sm:col-span-2"
      >
        {pending ? "Gönderiliyor…" : "Ücretsiz pilota başvur"}
      </button>
      {state && !state.ok && <p className="text-sm text-red-600 sm:col-span-2">{state.message}</p>}
    </form>
  );
}
