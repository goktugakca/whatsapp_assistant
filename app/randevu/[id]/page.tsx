import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { AppointmentCardView } from "@/app/components/appointment-card";
import { loadBusiness } from "@/lib/business";
import { toCard } from "@/lib/calendar";
import { getStore } from "@/lib/store";

const whenFmt = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "Europe/Istanbul",
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

// Sayfa ve metadata aynı istekte iki kez okumasın.
const loadAppointment = cache(async (id: string) => {
  const store = await getStore();
  const appointment = await store.getAppointment(id);
  const business = appointment && (await loadBusiness(store, appointment.businessId));
  return appointment && business ? { appointment, business } : undefined;
});

// WhatsApp bağlantı önizlemesinde sitenin genel tanıtımı yerine randevunun kendisi görünsün.
export async function generateMetadata(props: PageProps<"/randevu/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const found = await loadAppointment(id);
  if (!found) return { title: "Randevu bulunamadı", robots: { index: false } };
  const card = toCard(found.business, found.appointment);
  const title = found.appointment.cancelledAt ? `İptal edildi: ${card.serviceName}` : `Randevunuz: ${card.serviceName}`;
  const description = [whenFmt.format(new Date(card.start)), card.businessName, card.staffName]
    .filter(Boolean)
    .join(" · ");
  return { title, description, openGraph: { title, description }, robots: { index: false } };
}

// Müşteriye WhatsApp'tan gönderilen randevu sayfası. Kimlik tahmin edilemez (UUID);
// giriş gerektirmez.
export default async function AppointmentPage(props: PageProps<"/randevu/[id]">) {
  await connection();
  const { id } = await props.params;
  const found = await loadAppointment(id);
  if (!found) notFound();
  const { appointment, business } = found;

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      {appointment.cancelledAt ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm">
          <p className="font-semibold">Bu randevu iptal edildi.</p>
          <p className="mt-2 text-muted">Yeni randevu için {business.name} ile WhatsApp&apos;tan iletişime geçebilirsiniz.</p>
        </div>
      ) : (
        <AppointmentCardView card={toCard(business, appointment)} />
      )}
    </main>
  );
}
