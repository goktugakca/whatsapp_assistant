import type { Metadata } from "next";
import { Caveat, Rubik } from "next/font/google";
import "./globals.css";

// Gövde ve başlıklar Rubik; deftere elle "yazılan" şeyler (saat, müşteri adı, logo) Caveat.
const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["latin", "latin-ext"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "Sırada: Siz yokken de WhatsApp'tan randevu alan asistan",
  description:
    "Kuaför, berber, tırnak salonu ve kliniklerin WhatsApp'ına gelen mesajları 7/24 yanıtlayan ve randevu oluşturan yapay zekâ asistanı.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="tr"
      className={`${rubik.variable} ${caveat.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
