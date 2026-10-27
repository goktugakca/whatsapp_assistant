"use client";

import { useActionState, useState } from "react";
import type { Business, Service, Staff, Weekday, WorkingHours } from "@/lib/business";
import { slugify } from "@/lib/business-schema";
import { saveBusinessSettings, type SettingsState } from "../actions";

// Haftanın Pazartesi'den başlayan sırası (0 = Pazar).
const DAYS: { day: Weekday; label: string }[] = [
  { day: 1, label: "Pazartesi" },
  { day: 2, label: "Salı" },
  { day: 3, label: "Çarşamba" },
  { day: 4, label: "Perşembe" },
  { day: 5, label: "Cuma" },
  { day: 6, label: "Cumartesi" },
  { day: 0, label: "Pazar" },
];

const input =
  "field";
const smallButton = "btn btn-line btn-sm";
const removeButton = "text-xs text-red-600 hover:underline";

export function SettingsForm({ initial }: { initial: Business }) {
  const [b, setB] = useState<Business>(initial);
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveBusinessSettings, null);
  const update = (patch: Partial<Business>) => setB((prev) => ({ ...prev, ...patch }));

  const setService = (i: number, patch: Partial<Service>) =>
    update({ services: b.services.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const addService = () => {
    const taken = new Set(b.services.map((s) => s.id));
    const id = slugify("yeni-hizmet", taken);
    update({ services: [...b.services, { id, name: "", description: "", durationMinutes: 30, priceInfo: "" }] });
  };
  const removeService = (i: number) => {
    const removed = b.services[i].id;
    update({
      services: b.services.filter((_, j) => j !== i),
      staff: b.staff.map((p) => ({ ...p, serviceIds: p.serviceIds.filter((id) => id !== removed) })),
    });
  };

  const setStaff = (i: number, patch: Partial<Staff>) =>
    update({ staff: b.staff.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const addStaff = () => {
    const id = slugify("calisan", new Set(b.staff.map((p) => p.id)));
    update({ staff: [...b.staff, { id, name: "", serviceIds: b.services.map((s) => s.id) }] });
  };

  // Yeni eklenen hizmet ve çalışanlara, adları yazıldıktan sonra okunur bir kimlik verilir.
  // Var olan kimlikler değişmez; geçmiş randevular onlara bağlı.
  const withReadableIds = (): Business => {
    const originalServiceIds = new Set(initial.services.map((s) => s.id));
    const serviceIdMap = new Map<string, string>();
    const takenServices = new Set(b.services.filter((s) => originalServiceIds.has(s.id)).map((s) => s.id));
    const services = b.services.map((s) => {
      if (originalServiceIds.has(s.id) || !s.name.trim()) return s;
      const id = slugify(s.name, takenServices);
      takenServices.add(id);
      serviceIdMap.set(s.id, id);
      return { ...s, id };
    });
    const originalStaffIds = new Set(initial.staff.map((p) => p.id));
    const takenStaff = new Set(b.staff.filter((p) => originalStaffIds.has(p.id)).map((p) => p.id));
    const staff = b.staff.map((p) => {
      const serviceIds = p.serviceIds.map((id) => serviceIdMap.get(id) ?? id);
      // Sadece yaptığı hizmetlerin dolu fiyatları kalır; boş alan genel fiyat demek.
      const priceEntries = Object.entries(p.prices ?? {})
        .map(([sid, price]) => [serviceIdMap.get(sid) ?? sid, price.trim()] as const)
        .filter(([sid, price]) => price && serviceIds.includes(sid));
      const person: Staff = { ...p, serviceIds, prices: Object.fromEntries(priceEntries) };
      if (priceEntries.length === 0) delete person.prices;
      if (originalStaffIds.has(p.id) || !p.name.trim()) return person;
      const id = slugify(p.name, takenStaff);
      takenStaff.add(id);
      return { ...person, id };
    });
    const policies = b.policies.map((p) => p.trim()).filter(Boolean);
    return { ...b, services, staff, policies };
  };

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="payload" value={JSON.stringify(withReadableIds())} />

      <Section title="Genel bilgiler">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="İşletme adı">
            <input className={input} value={b.name} onChange={(e) => update({ name: e.target.value })} />
          </Field>
          <Field label="Şehir">
            <input className={input} value={b.city} onChange={(e) => update({ city: e.target.value })} />
          </Field>
          <Field label="Adres" wide>
            <input className={input} value={b.address} onChange={(e) => update({ address: e.target.value })} />
          </Field>
          <Field label="Harita bağlantısı (isteğe bağlı)" wide>
            <input
              className={input}
              value={b.mapsUrl ?? ""}
              placeholder="https://maps.google.com/..."
              onChange={(e) => update({ mapsUrl: e.target.value })}
            />
          </Field>
          <Field label="Yanıt verilen diller (virgülle)">
            <input
              className={input}
              value={b.languages.join(", ")}
              onChange={(e) =>
                update({
                  languages: e.target.value
                    .split(",")
                    .map((l) => l.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
          <Field label="Randevu aralığı">
            <select
              className={input}
              value={b.slotMinutes}
              onChange={(e) => update({ slotMinutes: Number(e.target.value) })}
            >
              {[10, 15, 20, 30, 60].map((m) => (
                <option key={m} value={m}>
                  {m} dakikada bir
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Çalışma saatleri">
        <HoursEditor hours={b.workingHours} onChange={(workingHours) => update({ workingHours })} />
      </Section>

      <Section
        title="Hizmetler ve fiyatlar"
        hint="Asistan fiyat sorulduğunda sadece buraya yazdığınız fiyat bilgisini söyler."
      >
        <div className="space-y-3">
          {b.services.map((s, i) => (
            <div key={s.id} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[2fr_1fr_2fr_auto]">
              <input
                className={input}
                placeholder="Hizmet adı"
                aria-label="Hizmet adı"
                value={s.name}
                onChange={(e) => setService(i, { name: e.target.value })}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="number"
                  min={5}
                  max={600}
                  step={5}
                  className={input}
                  aria-label="Süre (dakika)"
                  value={s.durationMinutes}
                  onChange={(e) => setService(i, { durationMinutes: Number(e.target.value) })}
                />
                <span className="text-muted">dk</span>
              </label>
              <input
                className={input}
                placeholder="Fiyat (ör. 900–1.200 TL)"
                aria-label="Fiyat"
                value={s.priceInfo}
                onChange={(e) => setService(i, { priceInfo: e.target.value })}
              />
              <button type="button" className={removeButton} onClick={() => removeService(i)}>
                Sil
              </button>
              <input
                className={`${input} sm:col-span-4`}
                placeholder="Kısa açıklama (asistan müşteriye anlatırken kullanır)"
                aria-label="Açıklama"
                value={s.description}
                onChange={(e) => setService(i, { description: e.target.value })}
              />
            </div>
          ))}
          <button type="button" className={smallButton} onClick={addService}>
            + Hizmet ekle
          </button>
        </div>
      </Section>

      <Section
        title="Çalışanlar"
        hint="Müşteri belirli bir kişiyi isteyebilir. Hiç çalışan eklemezseniz aynı saate tek randevu verilir."
      >
        <div className="space-y-3">
          {b.staff.map((p, i) => (
            <div key={p.id} className="space-y-3 rounded-lg border border-border p-3">
              <div className="flex gap-2">
                <input
                  className={input}
                  placeholder="Ad"
                  aria-label="Çalışan adı"
                  value={p.name}
                  onChange={(e) => setStaff(i, { name: e.target.value })}
                />
                <button
                  type="button"
                  className={removeButton}
                  onClick={() => update({ staff: b.staff.filter((_, j) => j !== i) })}
                >
                  Sil
                </button>
              </div>
              <fieldset>
                <legend className="mb-1 text-xs text-muted">Yaptığı hizmetler</legend>
                <div className="flex flex-wrap gap-2">
                  {b.services.map((s) => (
                    <label key={s.id} className="flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1 text-xs">
                      <input
                        type="checkbox"
                        checked={p.serviceIds.includes(s.id)}
                        onChange={(e) =>
                          setStaff(i, {
                            serviceIds: e.target.checked
                              ? [...p.serviceIds, s.id]
                              : p.serviceIds.filter((id) => id !== s.id),
                          })
                        }
                      />
                      {s.name || "(adsız hizmet)"}
                    </label>
                  ))}
                </div>
              </fieldset>
              {p.serviceIds.length > 0 && (
                <fieldset>
                  <legend className="mb-1 text-xs text-muted">
                    Bu çalışanın fiyatları (boş bırakırsanız hizmetin genel fiyatı geçerli)
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {b.services
                      .filter((s) => p.serviceIds.includes(s.id))
                      .map((s) => (
                        <label key={s.id} className="flex items-center gap-2 text-xs">
                          <span className="w-28 shrink-0 truncate">{s.name || "(adsız hizmet)"}</span>
                          <input
                            className={input}
                            placeholder={s.priceInfo || "Fiyat"}
                            aria-label={`${p.name || "Çalışan"} için ${s.name} fiyatı`}
                            value={p.prices?.[s.id] ?? ""}
                            onChange={(e) => setStaff(i, { prices: { ...p.prices, [s.id]: e.target.value } })}
                          />
                        </label>
                      ))}
                  </div>
                </fieldset>
              )}
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={Boolean(p.workingHours)}
                  onChange={(e) =>
                    setStaff(i, { workingHours: e.target.checked ? structuredClone(b.workingHours) : undefined })
                  }
                />
                İşletmeden farklı saatlerde çalışıyor
              </label>
              {p.workingHours && (
                <HoursEditor hours={p.workingHours} onChange={(workingHours) => setStaff(i, { workingHours })} />
              )}
            </div>
          ))}
          <button type="button" className={smallButton} onClick={addStaff}>
            + Çalışan ekle
          </button>
        </div>
      </Section>

      <Section title="Sık sorulan sorular" hint="Otopark, ödeme seçenekleri, iptal gibi sorulara verilecek yanıtlar.">
        <div className="space-y-3">
          {b.faq.map((f, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-border p-3">
              <div className="flex gap-2">
                <input
                  className={input}
                  placeholder="Soru"
                  aria-label="Soru"
                  value={f.q}
                  onChange={(e) => update({ faq: b.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })}
                />
                <button
                  type="button"
                  className={removeButton}
                  onClick={() => update({ faq: b.faq.filter((_, j) => j !== i) })}
                >
                  Sil
                </button>
              </div>
              <textarea
                className={input}
                rows={2}
                placeholder="Yanıt"
                aria-label="Yanıt"
                value={f.a}
                onChange={(e) => update({ faq: b.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })}
              />
            </div>
          ))}
          <button type="button" className={smallButton} onClick={() => update({ faq: [...b.faq, { q: "", a: "" }] })}>
            + Soru ekle
          </button>
        </div>
      </Section>

      <Section title="Asistanın uyması gereken kurallar" hint="Her satır bir kural. Örn: İptaller en az 3 saat önce bildirilmeli.">
        <textarea
          className={input}
          rows={4}
          value={b.policies.join("\n")}
          onChange={(e) => update({ policies: e.target.value.split("\n") })}
          onBlur={() => update({ policies: b.policies.map((p) => p.trim()).filter(Boolean) })}
        />
      </Section>

      <div className="sticky bottom-0 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        {state && (
          <div className={`mb-2 text-sm ${state.ok ? "text-ok" : "text-red-600"}`} role="status">
            {state.message}
            {state.errors && (
              <ul className="mt-1 list-disc pl-5">
                {state.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <button
          type="submit"
          disabled={pending}
          className="btn"
        >
          {pending ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </div>
    </form>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`grid gap-1 text-sm ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}

function HoursEditor({ hours, onChange }: { hours: WorkingHours[]; onChange: (hours: WorkingHours[]) => void }) {
  const set = (day: Weekday, patch: Partial<WorkingHours> | null) => {
    const existing = hours.find((h) => h.day === day);
    if (patch === null) return onChange(hours.filter((h) => h.day !== day));
    if (!existing) return onChange([...hours, { day, open: "09:00", close: "18:00", ...patch }]);
    onChange(hours.map((h) => (h.day === day ? { ...h, ...patch } : h)));
  };
  return (
    <div className="divide-y divide-border">
      {DAYS.map(({ day, label }) => {
        const h = hours.find((x) => x.day === day);
        return (
          <div key={day} className="flex flex-wrap items-center gap-3 py-2 text-sm">
            <label className="flex w-32 items-center gap-2">
              <input type="checkbox" checked={Boolean(h)} onChange={(e) => set(day, e.target.checked ? {} : null)} />
              {label}
            </label>
            {h ? (
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  className={`${input} w-28`}
                  aria-label={`${label} açılış`}
                  value={h.open}
                  onChange={(e) => set(day, { open: e.target.value })}
                />
                <span className="text-muted">–</span>
                <input
                  type="time"
                  className={`${input} w-28`}
                  aria-label={`${label} kapanış`}
                  value={h.close}
                  onChange={(e) => set(day, { close: e.target.value })}
                />
              </div>
            ) : (
              <span className="text-muted">Kapalı</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
