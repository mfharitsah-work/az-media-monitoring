"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import type { SessionUser } from "@/lib/auth/types";
import { UserNavMenu } from "@/components/user-nav-menu";

const NAV_ITEMS = [
  { href: "/", label: "All News" },
  { href: "/astrazeneca", label: "AZ News" },
  { href: "/competitors", label: "Competitor News" },
  { href: "/analytics", label: "Analytics" },
] as const;

export function SiteHeader({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      style={{ backgroundColor: "var(--brand-mulberry)" }}
    >
      <div className="mx-auto flex h-17.5 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 shrink-0 flex-col items-start gap-0.5 font-semibold">
          <Image
            src="/astrazeneca-logo-resized.png"
            alt="AstraZeneca"
            width={120}
            height={40}
            priority
            className="h-6 w-auto shrink-0 object-contain sm:h-6"
          />
          <span className="pb-0.5 truncate text-[11px] leading-none text-white/90 sm:text-xl ml-2 ">
            Media Monitoring
          </span>
        </Link>

        <nav className="hidden min-w-0 items-center gap-1 lg:flex">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={
                  "rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm " +
                  (active
                    ? "bg-accent text-accent-foreground"
                    : "text-white hover:text-white hover:bg-accent/50")
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden lg:block">
            <UserNavMenu user={user} pathname={pathname} />
          </div>

          <button
            type="button"
            aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((current) => !current)}
            className="inline-flex size-9 items-center justify-center rounded-md bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 lg:hidden"
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="border-t border-white/15 lg:hidden">
          <div className="mx-auto max-h-[calc(100dvh-4.5rem)] max-w-7xl overflow-y-auto px-4 py-3 sm:px-6">
            <nav className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={
                      "rounded-md px-3 py-2.5 text-sm font-medium transition-colors " +
                      (active
                        ? "bg-accent text-accent-foreground"
                        : "text-white hover:bg-white/10 hover:text-white")
                    }
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-3 border-t border-white/15 pt-3">
              <UserNavMenu user={user} pathname={pathname} />
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}

/**
 * Match current path ke nav item:
 * - "/" mewakili All News utama dan detail /news/[id]
 * - Path lain: exact ATAU sub-path (mis. /news/[id] juga highlights "All News")
 */
function isActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/" || pathname === "/news" || pathname.startsWith("/news/");
  }
  return pathname === href || pathname.startsWith(href + "/");
}
