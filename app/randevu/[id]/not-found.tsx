import Link from "next/link";

export default function AppointmentNotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <p className="hand text-4xl text-accent">Sırada</p>
      <h1 className="mt-4 font-display text-2xl font-semibold">Randevu bulunamadı</h1>
      <p className="mt-2 text-sm text-muted">
        Bu randevu iptal edilmiş ya da bağlantı eskimiş olabilir. Yeni randevu için işletmeye WhatsApp veya
        Instagram&apos;dan yazabilirsiniz.
      </p>
      <Link href="/" className="btn btn-line mt-6">
        Ana sayfa
      </Link>
    </main>
  );
}
