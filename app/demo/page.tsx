import Link from "next/link";
import { demoClinic } from "@/lib/clinic";
import { DemoChat } from "./demo-chat";

export const metadata = { title: "Canlı demo · Klinik Asistan" };

const examples = [
  "Merhaba, implant fiyatları ne kadar?",
  "Hi, I'm from London. How many days do I need to stay for zirconia crowns?",
  "مرحبا، هل يوجد نقل من المطار؟",
  "Hallo, ich möchte nächste Woche einen Termin für eine Untersuchung.",
];

export default function DemoPage() {
  return (
    <main className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_320px]">
      <DemoChat clinicName={demoClinic.name} />
      <aside className="space-y-6 text-sm">
        <div>
          <h2 className="font-semibold">Bu bir demo</h2>
          <p className="mt-2 text-muted">
            Sol taraf, hastanın WhatsApp&apos;ta gördüğünün aynısı. Asistan &quot;{demoClinic.name}&quot; adlı örnek
            kliniğin bilgileriyle çalışıyor. Konuşmalar ve randevular{" "}
            <Link href="/panel" className="underline">
              klinik panelinde
            </Link>{" "}
            görünür.
          </p>
        </div>
        <div>
          <h2 className="font-semibold">Şunları deneyin</h2>
          <ul className="mt-2 space-y-2 text-muted">
            {examples.map((e) => (
              <li key={e} className="rounded-lg border border-border bg-card p-2" dir="auto">
                {e}
              </li>
            ))}
            <li className="rounded-lg border border-border bg-card p-2">
              Randevu isteyin, ardından &quot;bir insanla görüşmek istiyorum&quot; yazın.
            </li>
          </ul>
        </div>
      </aside>
    </main>
  );
}
