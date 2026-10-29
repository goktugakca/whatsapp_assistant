import Link from "next/link";

export const metadata = { title: "Sayfa bulunamadı · Sırada" };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <p className="hand text-4xl text-accent">Sırada</p>
      <h1 className="mt-4 font-display text-2xl font-semibold">Bu sayfa bulunamadı</h1>
      <p className="mt-2 text-sm text-muted">Bağlantı eski olabilir ya da yanlış yazılmış olabilir.</p>
      <Link href="/" className="btn mt-6">
        Ana sayfaya dön
      </Link>
    </main>
  );
}
