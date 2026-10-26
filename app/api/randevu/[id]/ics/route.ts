import { loadBusiness } from "@/lib/business";
import { cardToEvent, toCard, toIcs } from "@/lib/calendar";
import { getStore } from "@/lib/store";

// Tek randevunun takvim dosyası (Apple Takvim, Outlook, Google vb. açar).
export async function GET(_request: Request, ctx: RouteContext<"/api/randevu/[id]/ics">) {
  const { id } = await ctx.params;
  const store = await getStore();
  const appointment = await store.getAppointment(id);
  if (!appointment || appointment.cancelledAt) return new Response("Bulunamadı", { status: 404 });
  const business = await loadBusiness(store, appointment.businessId);
  if (!business) return new Response("Bulunamadı", { status: 404 });

  const card = toCard(business, appointment);
  return new Response(toIcs(business.name, [cardToEvent(card)]), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="randevu-${id.slice(0, 8)}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
