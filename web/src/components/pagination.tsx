import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Server-rendered pagination — pure Link, no client state.
 * Pattern: bangun href dengan searchParams existing + override page.
 */
export function Pagination({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  searchParams,
}: {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  /** Current URL searchParams (raw record). page key di-replace dengan target page. */
  searchParams: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  const hrefFor = (page: number): string => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v !== undefined && k !== "page") sp.set(k, v);
    }
    if (page > 1) sp.set("page", String(page));
    const qs = sp.toString();
    return qs ? `?${qs}` : "?";
  };

  return (
    <nav
      className="flex flex-col items-center justify-between gap-3 pt-2 sm:flex-row"
      aria-label="Pagination"
    >
      <p className="text-sm text-muted-foreground">
        Showing <span className="font-medium text-foreground">{start.toLocaleString()}–{end.toLocaleString()}</span> of{" "}
        <span className="font-medium text-foreground">{totalItems.toLocaleString()}</span>
      </p>

      <div className="flex items-center gap-1">
        <PaginationLink
          href={hrefFor(currentPage - 1)}
          disabled={currentPage === 1}
          ariaLabel="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>Prev</span>
        </PaginationLink>

        <PageNumbers
          currentPage={currentPage}
          totalPages={totalPages}
          hrefFor={hrefFor}
        />

        <PaginationLink
          href={hrefFor(currentPage + 1)}
          disabled={currentPage === totalPages}
          ariaLabel="Next page"
        >
          <span>Next</span>
          <ChevronRight className="h-4 w-4" />
        </PaginationLink>
      </div>
    </nav>
  );
}

/**
 * Window-of-5 page numbers with optional ellipsis to first/last.
 * E.g. for currentPage=7, totalPages=20: 1 ... 5 6 [7] 8 9 ... 20
 */
function PageNumbers({
  currentPage,
  totalPages,
  hrefFor,
}: {
  currentPage: number;
  totalPages: number;
  hrefFor: (page: number) => string;
}) {
  const pages = computePageWindow(currentPage, totalPages);
  return (
    <>
      {pages.map((p, i) =>
        p === "ellipsis" ? (
          <span key={`e-${i}`} className="px-2 text-muted-foreground">
            …
          </span>
        ) : (
          <PageButton
            key={p}
            href={hrefFor(p)}
            active={p === currentPage}
          >
            {p}
          </PageButton>
        ),
      )}
    </>
  );
}

function computePageWindow(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const window = new Set<number>([1, total, current - 1, current, current + 1]);
  const sorted = Array.from(window)
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b);
  const out: (number | "ellipsis")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    out.push(sorted[i]);
    if (i < sorted.length - 1 && sorted[i + 1] - sorted[i] > 1) out.push("ellipsis");
  }
  return out;
}

function PaginationLink({
  href,
  disabled,
  ariaLabel,
  children,
}: {
  href: string;
  disabled: boolean;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  const base = "inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm font-medium transition-colors";
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        aria-label={ariaLabel}
        className={`${base} pointer-events-none border-transparent text-muted-foreground/50`}
      >
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={ariaLabel} className={`${base} hover:bg-accent`}>
      {children}
    </Link>
  );
}

function PageButton({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  const cls = active
    ? "border-primary bg-primary text-primary-foreground"
    : "border-transparent hover:bg-accent";
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors ${cls}`}
    >
      {children}
    </Link>
  );
}
