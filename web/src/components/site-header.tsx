"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/news", label: "All News" },
  { href: "/analytics", label: "Analytics" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60" style={{ backgroundColor: "var(--brand-mulberry)" }}>
      <div className="mx-auto flex h-17.5 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 shrink-0 flex-col items-start gap-0.5 font-semibold">
          <Image
            src="/astrazeneca-logo-resized.png"
            alt="AstraZeneca"
            width={120}
            height={40}
            priority
            className="h-6 w-auto shrink-0 object-contain sm:h-6"
          />
          <span className="truncate text-[11px] leading-none text-white/90 sm:text-xl ml-2">
            Media Monitoring
          </span>
        </Link>
        <nav className="flex items-center gap-0.5 sm:gap-1">
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
      </div>
    </header>
  );
}

/**
 * Match current path ke nav item:
 * - "/" hanya exact match (kalau pakai startsWith, semua page jadi active untuk Home)
 * - Path lain: exact ATAU sub-path (mis. /news/[id] juga highlights "All News")
 */
function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}
