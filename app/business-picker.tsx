import Link from "next/link";
import { businesses as allBusinesses, type Business } from "@/lib/business";
import { verticals } from "@/lib/verticals";

// Demo ve panelde örnek işletmeler arasında geçiş.
export function BusinessPicker({
  basePath,
  currentId,
  businesses = allBusinesses,
}: {
  basePath: string;
  currentId: string;
  businesses?: Business[];
}) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="İşletme seç">
      {businesses.map((b) => (
        <Link
          key={b.id}
          href={`${basePath}?isletme=${b.id}`}
          aria-current={b.id === currentId ? "page" : undefined}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
            b.id === currentId ? "border-accent bg-accent text-accent-foreground" : "border-border text-muted"
          }`}
        >
          {verticals[b.type].label}
        </Link>
      ))}
    </nav>
  );
}
