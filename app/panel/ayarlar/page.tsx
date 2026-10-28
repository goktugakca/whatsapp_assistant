import Link from "next/link";
import { connection } from "next/server";
import { businesses, loadBusiness } from "@/lib/business";
import { getStore } from "@/lib/store";
import { verticals } from "@/lib/verticals";
import { resolvePanelBusiness } from "@/lib/dal";
import { PanelHeader } from "../panel-header";
import { instagramAppConfig } from "@/lib/instagram";
import { InstagramSection } from "./instagram-section";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Ayarlar · Sırada" };

export default async function SettingsPage(props: PageProps<"/panel/ayarlar">) {
  await connection();
  const { isletme, instagram } = await props.searchParams;
  const { session, businessId } = await resolvePanelBusiness(isletme);
  const store = await getStore();
  const business = (await loadBusiness(store, businessId)) ?? businesses[0];
  const account = await store.getInstagramAccount(business.id);
  const now = new Date().getTime(); // connection() sonrası; sayfa her istekte sunucuda üretilir

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <PanelHeader session={session} basePath="/panel/ayarlar" businessId={business.id} />
      <header className="mt-6 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{business.name}</h1>
          <p className="text-sm text-muted">{verticals[business.type].label} · Ayarlar</p>
        </div>
        <Link href={`/panel?isletme=${business.id}`} className="text-sm underline">
          ← Panele dön
        </Link>
      </header>
      <div className="mb-8">
        <InstagramSection
          businessId={business.id}
          account={account}
          configured={!!instagramAppConfig()}
          result={typeof instagram === "string" ? instagram : undefined}
          now={now}
        />
      </div>
      {/* key: işletme değişince form durumu sıfırlansın */}
      <SettingsForm key={business.id} initial={business} />
    </main>
  );
}
