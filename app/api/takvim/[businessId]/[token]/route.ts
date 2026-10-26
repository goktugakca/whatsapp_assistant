import { loadBusiness } from "@/lib/business";
import { cardToEvent, toCard, toIcs } from "@/lib/calendar";
import { isValidFeedToken } from "@/lib/calendar-feed";
import { getStore } from "@/lib/store";

// İşletmenin tüm aktif randevuları, takvim aboneliği olarak (Google Takvim > "URL ile ekle").
// Google bu adresi birkaç saatte bir yeniler; yeni randevular gecikmeli görünür.
export async function GET(_request: Request, ctx: RouteContext<"/api/takvim/[businessId]/[token]">) {
  const { businessId, token } = await ctx.params;
  const cleanToken = token.replace(/\.ics$/, "");
  if (!isValidFeedToken(businessId, cleanToken)) return new Response("Bulunamadı", { status: 404 });

  const store = await getStore();
  const business = await loadBusiness(store, businessId);
  if (!business) return new Response("Bulunamadı", { status: 404 });

  const since = Date.now() - 30 * 24 * 60 * 60_000; // son 30 gün ve sonrası
  const events = (await store.listAppointments(business.id))
    .filter((a) => Date.parse(a.end) >= since)
    .map((a) => {
      const card = toCard(business, a);
      const event = cardToEvent(card);
      // İşletmenin kendi takviminde müşteri ve çalışan başlıkta görünsün.
      return {
        ...event,
        summary: `${card.customerName} · ${card.serviceName}${card.staffName ? ` (${card.staffName})` : ""}`,
        description: [`Müşteri: ${card.customerName}`, `İletişim: ${a.contact}`, event.description]
          .filter(Boolean)
          .join("\n"),
      };
    });

  return new Response(toIcs(`${business.name} randevuları`, events), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300" },
  });
}
