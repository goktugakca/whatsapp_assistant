import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AppointmentCardView } from "@/app/components/appointment-card";
import { loadBusiness } from "@/lib/business";
import { toCard } from "@/lib/calendar";
import { getStore } from "@/lib/store";

export const metadata = { title: "Randevunuz", robots: { index: false } };

// Müşteriye WhatsApp'tan gönderilen randevu sayfası. Kimlik tahmin edilemez (UUID);
// giriş gerektirmez.
export default async function AppointmentPage(props: PageProps<"/randevu/[id]">) {
  await connection();
  const { id } = await props.params;
  const store = await getStore();
  const appointment = await store.getAppointment(id);
  if (!appointment) notFound();
  const business = await loadBusiness(store, appointment.businessId);
  if (!business) notFound();

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
