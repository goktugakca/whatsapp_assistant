import Link from "next/link";
import { connection } from "next/server";
import { businesses, loadBusiness } from "@/lib/business";
import { requireAdmin } from "@/lib/dal";
import { getStore } from "@/lib/store";
import { PanelHeader } from "../panel-header";
import { deletePanelUser } from "./actions";
import { CreateUserForm } from "./create-user-form";

export const metadata = { title: "Kullanıcılar · Sırada" };

const dateFmt = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "medium" });

// Sadece yönetici: her işletmeye kendi paneline giriş için kullanıcı verir.
export default async function UsersPage() {
  await connection();
  const session = await requireAdmin();
  const store = await getStore();
  const [users, names] = await Promise.all([
    store.listPanelUsers(),
    Promise.all(businesses.map(async (b) => ({ id: b.id, name: (await loadBusiness(store, b.id))?.name ?? b.name }))),
  ]);
  const nameOf = (id: string) => names.find((b) => b.id === id)?.name ?? id;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <PanelHeader session={session} basePath="/panel" businessId={businesses[0].id} />
      <header className="mt-6 flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Kullanıcılar</h1>
          <p className="text-sm text-muted">Her işletme sadece kendi panelini, takvimini ve ayarlarını görür.</p>
        </div>
        <Link href="/panel" className="text-sm underline whitespace-nowrap">
          Panele dön
        </Link>
      </header>

      <section className="mt-6 rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 font-semibold">Yeni kullanıcı</h2>
        <CreateUserForm businesses={names} />
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">Mevcut kullanıcılar</h2>
        {users.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Henüz kullanıcı yok.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card text-sm">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <div>
                  <p className="font-medium">{u.username}</p>
                  <p className="text-xs text-muted">
                    {nameOf(u.businessId)} · {dateFmt.format(new Date(u.createdAt))}
                  </p>
                </div>
                <form action={deletePanelUser}>
                  <input type="hidden" name="userId" value={u.id} />
                  <button className="text-xs text-danger hover:underline">Sil</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
