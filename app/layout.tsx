import type { Metadata } from "next";
import { Barlow_Condensed, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

// Gövde metni, fişteki saat ve numaralar, büyük başlıklar.
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
});

const barlow = Barlow_Condensed({
  variable: "--font-barlow",
  subsets: ["latin", "latin-ext"],
  weight: ["600", "700", "800"],
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
      className={`${plexSans.variable} ${plexMono.variable} ${barlow.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
