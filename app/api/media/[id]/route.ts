import { getSession } from "@/lib/dal";
import { getStore } from "@/lib/store";

// Müşterinin gönderdiği fotoğraf; sadece o işletmenin paneline giriş yapmış kişiler görür.
export async function GET(_request: Request, ctx: RouteContext<"/api/media/[id]">) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return new Response("Giriş gerekli", { status: 401 });
  const media = await (await getStore()).getMedia(id);
  if (!media || (!session.isAdmin && session.businessId !== media.businessId)) {
    return new Response("Bulunamadı", { status: 404 });
  }
  return new Response(new Uint8Array(media.data), {
    headers: {
      "Content-Type": media.mimeType,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
