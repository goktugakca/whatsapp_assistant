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
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/panel" className="hand text-[34px] font-bold leading-none">
          Sırada
        </Link>
        {session.isAdmin && (
          <BusinessPicker basePath={basePath} currentId={businessId} businesses={visibleBusinesses(session)} />
        )}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted">
        {session.isAdmin && (
          <Link href="/panel/kullanicilar" className="underline">
            Kullanıcılar
          </Link>
        )}
        <span>{session.isAdmin ? "Yönetici" : session.name}</span>
        <form action={logout}>
          <button className="btn btn-line btn-sm">Çıkış</button>
        </form>
      </div>
    </div>
  );
}
