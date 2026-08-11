import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sixth of the Night",
  description:
    "A provider-agnostic visualisation of six night portions, three thirds, and the Dāwūd night pattern.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
