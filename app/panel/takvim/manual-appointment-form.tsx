"use client";

import { useActionState } from "react";
import { addManualAppointment, type ManualAppointmentState } from "../actions";

const input =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

// Telefonla / yüz yüze gelen randevular için.
export function ManualAppointmentForm(props: {
  businessId: string;
  services: { id: string; name: string; durationMinutes: number }[];
  staff: { id: string; name: string }[];
  defaultDate: string;
}) {
  const [state, action, pending] = useActionState<ManualAppointmentState, FormData>(addManualAppointment, null);
  const v = state?.values ?? {};
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="businessId" value={props.businessId} />
      <label className="grid gap-1 text-sm">
        <span className="text-xs text-muted">Müşteri adı</span>
        <input name="customerName" required defaultValue={v.customerName} className={input} />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-xs text-muted">Telefon (isteğe bağlı)</span>
        <input name="contact" inputMode="tel" defaultValue={v.contact} className={input} />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-xs text-muted">Hizmet</span>
        <select name="serviceId" defaultValue={v.serviceId} className={input}>
          {props.services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.durationMinutes} dk)
            </option>
          ))}
        </select>
      </label>
      {props.staff.length > 0 ? (
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-muted">Çalışan</span>
          <select name="staffId" className={input} defaultValue={v.staffId ?? "any"}>
            <option value="any">Fark etmez</option>
            {props.staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input type="hidden" name="staffId" value="any" />
      )}
      <label className="grid gap-1 text-sm">
        <span className="text-xs text-muted">Tarih</span>
        <input type="date" name="date" required defaultValue={v.date ?? props.defaultDate} className={input} />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-xs text-muted">Saat</span>
        <input type="time" name="time" required step={300} defaultValue={v.time} className={input} />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-60"
        >
          {pending ? "Ekleniyor…" : "Randevu ekle"}
        </button>
        {state && (
          <p className={`text-sm ${state.ok ? "text-accent" : "text-red-600"}`} role="status">
            {state.message} {state.suggestions?.join(", ")}
          </p>
        )}
      </div>
    </form>
  );
}
