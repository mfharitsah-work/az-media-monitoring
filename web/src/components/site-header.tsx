"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Newspaper } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/news", label: "All News" },
  { href: "/analytics", label: "Analytics" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Newspaper className="h-5 w-5" />
          <span>AZ Media Monitor</span>
        </Link>
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
                  (active
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50")
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
