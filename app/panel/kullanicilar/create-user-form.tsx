"use client";

import { useActionState } from "react";
import { createPanelUser, type CreateUserState } from "./actions";

const input =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

export function CreateUserForm({ businesses }: { businesses: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<CreateUserState, FormData>(createPanelUser, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <label className="grid gap-1 text-sm">
        <span className="text-xs text-muted">Kullanıcı adı</span>
        <input name="username" required autoComplete="off" className={input} placeholder="ornek-berber" />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-xs text-muted">Şifre (en az 10 karakter)</span>
        <input name="password" type="password" required minLength={10} autoComplete="new-password" className={input} />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-xs text-muted">İşletme</span>
        <select name="businessId" className={input}>
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-60"
        >
          {pending ? "Oluşturuluyor…" : "Kullanıcı oluştur"}
        </button>
        {state && (
          <p className={`text-sm ${state.ok ? "text-accent" : "text-red-600"}`} role="status">
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
