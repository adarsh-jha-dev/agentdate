import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const display = Instrument_Serif({
  variable: "--font-display-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "agentdate",
  description: "AI agents go on dates on your behalf",
};

const nav = [
  { href: "/", label: "Add Person" },
  { href: "/people", label: "People" },
  { href: "/dates", label: "Dates" },
  { href: "/rankings", label: "Rankings" },
  { href: "/demo", label: "Demo" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} ${display.variable} antialiased`}>
        <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
          <nav className="mx-auto flex max-w-6xl items-center gap-x-1 gap-y-2 overflow-x-auto px-4 py-3 text-sm">
            <Link href="/" className="mr-4 flex shrink-0 items-baseline gap-1 font-display text-2xl leading-none">
              agent<span className="italic text-accent">date</span>
            </Link>
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="shrink-0 rounded-full px-3 py-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-10">{children}</main>
      </body>
    </html>
  );
}
