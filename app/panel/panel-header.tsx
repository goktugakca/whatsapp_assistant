import Link from "next/link";
import { visibleBusinesses, type PanelSession } from "@/lib/dal";
import { logout } from "../giris/actions";
import { BusinessPicker } from "../business-picker";

// Tüm panel sayfalarının üst çubuğu: yöneticiye işletme seçici, herkese çıkış.
export function PanelHeader({
  session,
  basePath,
  businessId,
}: {
  session: PanelSession;
  basePath: string;
  businessId: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {session.isAdmin ? (
        <BusinessPicker basePath={basePath} currentId={businessId} businesses={visibleBusinesses(session)} />
      ) : (
        <span />
      )}
      <div className="flex items-center gap-3 text-xs text-muted">
        {session.isAdmin && (
          <Link href="/panel/kullanicilar" className="underline">
            Kullanıcılar
          </Link>
        )}
        <span>{session.isAdmin ? "Yönetici" : session.name}</span>
        <form action={logout}>
          <button className="rounded-lg border border-border px-2.5 py-1">Çıkış</button>
        </form>
      </div>
    </div>
  );
}
