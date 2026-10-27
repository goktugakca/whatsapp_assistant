import Link from "next/link";
import { businesses, loadBusiness } from "@/lib/business";
import { getStore } from "@/lib/store";
import { demoExamples } from "@/lib/demo-examples";
import { BusinessPicker } from "../business-picker";
import { DemoChat } from "./demo-chat";

export const metadata = { title: "Canlı demo · Sırada" };

export default async function DemoPage(props: PageProps<"/demo">) {
  const { isletme } = await props.searchParams;
  const id = typeof isletme === "string" ? isletme : businesses[0].id;
  const business = (await loadBusiness(await getStore(), id)) ?? businesses[0];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border pb-3">
        <Link href="/" className="hand text-[34px] font-bold leading-none">
          Sırada
        </Link>
        <BusinessPicker basePath="/demo" currentId={business.id} />
      </header>
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_320px]">
        <DemoChat key={business.id} businessId={business.id} businessName={business.name} />
        <aside className="space-y-6 text-sm">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Bu bir demo</h2>
            <p className="mt-2 text-muted">
              Sol taraf, müşterinin WhatsApp&apos;ta gördüğünün aynısı. Asistan &quot;{business.name}&quot; adlı örnek
              işletmenin hizmet, fiyat ve çalışan bilgileriyle çalışıyor. Konuşmalar ve randevular{" "}
              {/* Panel parola korumalı: önceden yükleme (prefetch) tarayıcının giriş penceresini
                  kullanıcı tıklamadan açıyordu. */}
              <Link href={`/panel?isletme=${business.id}`} prefetch={false} className="underline">
                işletme panelinde
              </Link>{" "}
              görünür.
            </p>
          </div>
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Şunları deneyin</h2>
            <ul className="mt-2">
              {demoExamples[business.type].map((e) => (
                <li key={e} className="border-b border-dashed border-border py-2.5" dir="auto">
                  {e}
                </li>
              ))}
              <li className="py-2.5 text-muted">
                Randevu alın, ardından &quot;bir insanla görüşmek istiyorum&quot; yazın.
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
}
