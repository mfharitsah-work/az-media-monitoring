import type { Metadata } from "next";
import "./globals.css";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { currentUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: {
    default: "Media Monitoring",
    template: "%s · Media Monitoring",
  },
  description:
    "Daily news monitoring for AstraZeneca Indonesia and pharma regulatory landscape — sentiment, category, and location analysis.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await currentUser();

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <SiteHeader user={user} />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
