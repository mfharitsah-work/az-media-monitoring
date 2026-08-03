import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";

import { ArticleCardGallery } from "@/components/article-card-gallery";
import { DateRangePicker } from "@/components/news-filters";
import { Skeleton } from "@/components/ui/skeleton";
import { describeArticleListRange } from "@/lib/date-ranges";
import { articleRepo } from "@/lib/repositories";
import type { ArticleListFilters, ArticleSubcategory, DateRange } from "@/lib/types";

export const metadata: Metadata = {
  title: "About AstraZeneca",
  description: "All articles where AstraZeneca is the focus or mentioned.",
};

export const revalidate = 3600;

const PAGE_SIZE = 60;

const AZ_TABS: {
  value: string;
  label: string;
  subcategories: ArticleSubcategory[];
}[] = [
  { value: "all", label: "All AZ", subcategories: ["AZ Focus", "AZ Mentioned"] },
  { value: "focus", label: "AZ Focus", subcategories: ["AZ Focus"] },
  { value: "mentioned", label: "AZ Mentioned", subcategories: ["AZ Mentioned"] },
];

export default async function AstraZenecaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const activeValue = sp.filter ?? "all";
  const activeTab = AZ_TABS.find((t) => t.value === activeValue) ?? AZ_TABS[0];
  const dateFilter = parseDateFilter(sp);

  const filters: ArticleListFilters = {
    range: dateFilter.range,
    customDateFrom: dateFilter.customDateFrom,
    customDateTo: dateFilter.customDateTo,
    categories: ["About AstraZeneca"],
    subcategories: activeTab.subcategories,
    limit: PAGE_SIZE,
  };
  const rangeDescription = describeArticleListRange(
    filters.range,
    filters.customDateFrom,
    filters.customDateTo,
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to home
      </Link>

      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">About AstraZeneca</h1>
        <p className="text-muted-foreground">
          All-time articles where AstraZeneca is the main topic (
          <span className="font-medium">AZ Focus</span>) or mentioned as a data point
          (<span className="font-medium">AZ Mentioned</span>).
        </p>
      </header>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <AzFilterTabs activeValue={activeValue} searchParams={sp} />
          <div className="space-y-1.5 sm:w-[230px]">
            <label
              htmlFor="news-date-range"
              className="block text-xs font-medium text-muted-foreground"
            >
              Date range
            </label>
            <DateRangePicker />
          </div>
        </div>
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Displayed range:</span>{" "}
          {rangeDescription}
        </p>
      </section>

      <Suspense key={`list-${activeValue}-${rangeDescription}`} fallback={<GallerySkeleton />}>
        <ResultGrid filters={filters} />
      </Suspense>
    </div>
  );
}

function AzFilterTabs({
  activeValue,
  searchParams,
}: {
  activeValue: string;
  searchParams: Record<string, string | undefined>;
}) {
  const hrefForTab = (value: string) => {
    const params = new URLSearchParams();
    for (const [key, val] of Object.entries(searchParams)) {
      if (val !== undefined && key !== "page") params.set(key, val);
    }
    if (value === "all") params.delete("filter");
    else params.set("filter", value);
    const qs = params.toString();
    return qs ? `/astrazeneca?${qs}` : "/astrazeneca";
  };

  return (
    <div className="inline-flex rounded-md border bg-muted p-1">
      {AZ_TABS.map((tab) => {
        const isActive = tab.value === activeValue;
        return (
          <Link
            key={tab.value}
            href={hrefForTab(tab.value)}
            className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

function parseDateFilter(sp: Record<string, string | undefined>): {
  range: DateRange;
  customDateFrom?: string;
  customDateTo?: string;
} {
  const legacyDate = validIsoDate(sp.date);
  const requestedFrom = validIsoDate(sp.from);
  const requestedTo = validIsoDate(sp.to);
  const firstBound = requestedFrom ?? requestedTo ?? legacyDate;
  const secondBound = requestedTo ?? requestedFrom ?? legacyDate;

  if (!firstBound || !secondBound) return { range: "all-time" };

  return {
    range: "custom",
    customDateFrom: firstBound <= secondBound ? firstBound : secondBound,
    customDateTo: firstBound <= secondBound ? secondBound : firstBound,
  };
}

function validIsoDate(value: string | undefined): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return value;
}

async function ResultGrid({ filters }: { filters: ArticleListFilters }) {
  const { items, total } = await articleRepo.findMany(filters);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-muted-foreground">
          No AstraZeneca articles in this category yet.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Showing {items.length} of {total} article{total === 1 ? "" : "s"}
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((article) => (
          <ArticleCardGallery key={article.id} article={article} />
        ))}
      </div>
    </>
  );
}

function GallerySkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 9 }).map((_, i) => (
        <Skeleton key={i} className="h-48 w-full" />
      ))}
    </div>
  );
}
