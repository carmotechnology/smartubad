import type { Metadata, Viewport } from "next";

import { Toaster } from "@/components/ui/toaster";
import { publicEnv } from "@/lib/env";
import { getLocale } from "@/lib/i18n";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${publicEnv.appName} — Kindergarten management`,
    template: `%s · ${publicEnv.appName}`,
  },
  description:
    "A calm, secure way to run a kindergarten: children, classes, attendance, daily reports, finance and parent communication.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Teachers work one-handed on a phone; let them zoom if they need to.
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdfdfb" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1c20" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
