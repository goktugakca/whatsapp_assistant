"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground print:hidden"
    >
      Yazdır / PDF olarak kaydet
    </button>
  );
}
