import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "agentdate",
  description: "AI agents go on dates on your behalf",
};

const nav = [
  { href: "/people/new", label: "Add Person" },
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <header className="border-b border-black/10 dark:border-white/10">
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
            <Link href="/" className="font-semibold tracking-tight">
              agentdate
            </Link>
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="opacity-70 hover:opacity-100"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
