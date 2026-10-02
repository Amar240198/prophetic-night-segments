import { cookies } from "next/headers";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import { SharedHeader } from "@/components/app/SharedHeader";
import { LOCALE_COOKIE, locales, parseLocale } from "@/lib/i18n/config";
import type { Metadata } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: "Miqāt — Islamic time, organised",
  description: "Prayer times, Qiyām, fasting, routines and calendar automation — in one place.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return (
    <html lang={locale} dir={locales[locale].dir} className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <LocaleProvider initialLocale={locale}>
          <SharedHeader />
          {children}
        </LocaleProvider>
        <Analytics />
      </body>
    </html>
  );
}
