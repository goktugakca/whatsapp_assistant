"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const input =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, null);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="next" value={next ?? ""} />
      <label className="grid gap-1 text-sm">
        <span className="text-xs text-muted">Kullanıcı adı</span>
        <input
          name="username"
          autoComplete="username"
          required
          autoFocus
          defaultValue={state?.username}
          className={input}
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-xs text-muted">Şifre</span>
        <input name="password" type="password" autoComplete="current-password" required className={input} />
      </label>
      {state?.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-60"
      >
        {pending ? "Giriş yapılıyor…" : "Giriş yap"}
      </button>
    </form>
  );
}
