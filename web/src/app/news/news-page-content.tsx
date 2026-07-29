import type { Metadata } from "next";
import { Suspense } from "react";

import { ArticleCardLandscape } from "@/components/article-card-landscape";
import { ArticleCardGallery } from "@/components/article-card-gallery";
import { EmailDigestLauncher } from "@/components/email-digest-launcher";
import { FilteredKpiCards, KpiCardsSkeleton } from "@/components/kpi-cards";
import { NewsFilters, RangeTabs } from "@/components/news-filters";
import { Pagination } from "@/components/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { describeArticleListRange } from "@/lib/date-ranges";
import { articleRepo } from "@/lib/repositories";
import {
  ArticleCategorySchema,
  ArticleSentimentSchema,
  ArticleSubcategorySchema,
  type ArticleListFilters,
  type DateRange,
} from "@/lib/types";

export const metadata: Metadata = {
  title: "Media Monitoring",
  description:
    "Media monitoring dashboard for all collected AstraZeneca Indonesia and pharma landscape news.",
};

export const revalidate = 3600;

/** Page size per range: landscape cards are larger, gallery is denser. */
const PAGE_SIZE_BY_RANGE: Record<DateRange, number> = {
  latest: 10,
  yesterday: 10,
  today: 10,
  "last-7-days": 20,
  "this-month": 20,
  "all-time": 20,
  custom: 20,
};

/**
 * Search params (URL state):
 * - range:     "latest" | "last-7-days" | "this-month"
 * - from/to:   inclusive YYYY-MM-DD bounds; override range -> custom
 * - date:      legacy single-date param; treated as from = to
 * - q:         free text search
 * - category:  enum
 * - sentiment: enum
 * - page:      1-indexed pagination
 */
export default async function NewsPageContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { filters, page, pageSize } = parseParams(sp);
  const isCompactWindow = ["latest", "yesterday", "today"].includes(filters.range);
  const rangeDescription = describeArticleListRange(
    filters.range,
    filters.customDateFrom,
    filters.customDateTo,
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-10 lg:px-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-[#4D0030]">
          News Overview
        </h1>
        <p className="max-w-3xl text-muted-foreground">
          View all collected news from monitored media sources, with date,
          category, sentiment, and keyword filters for AstraZeneca Indonesia and
          the broader pharma landscape.
        </p>
      </header>

      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <RangeTabs activeRange={filters.range} />
            <RangeWindowSummary description={rangeDescription} />
          </div>
          <Suspense fallback={null}>
            <EmailDigestLauncher />
          </Suspense>
        </div>
        <NewsFilters />
      </section>

      <Suspense
        key={`kpi-${JSON.stringify(filters)}`}
        fallback={<KpiCardsSkeleton />}
      >
        <FilteredKpiCards filters={filters} />
      </Suspense>

      <Suspense
        key={`list-${JSON.stringify(filters)}-p${page}`}
        fallback={isCompactWindow ? <LandscapeSkeleton /> : <GallerySkeleton />}
      >
        <ResultList
          filters={filters}
          layout={isCompactWindow ? "landscape" : "gallery"}
          page={page}
          pageSize={pageSize}
          searchParams={sp}
        />
      </Suspense>
    </div>
  );
}

function RangeWindowSummary({ description }: { description: string }) {
  return (
    <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      <span className="font-medium text-foreground">Displayed range:</span>{" "}
      {description}
    </p>
  );
}

function parseParams(sp: Record<string, string | undefined>): {
  filters: ArticleListFilters;
  page: number;
  pageSize: number;
} {
  // Custom date bounds override the preset range. Default: Latest News.
  let range: DateRange = "latest";
  let customDateFrom: string | undefined;
  let customDateTo: string | undefined;
  const legacyDate = validIsoDate(sp.date);
  const requestedFrom = validIsoDate(sp.from);
  const requestedTo = validIsoDate(sp.to);
  const firstBound = requestedFrom ?? requestedTo ?? legacyDate;
  const secondBound = requestedTo ?? requestedFrom ?? legacyDate;

  if (firstBound && secondBound) {
    range = "custom";
    customDateFrom = firstBound <= secondBound ? firstBound : secondBound;
    customDateTo = firstBound <= secondBound ? secondBound : firstBound;
  } else if (sp.range === "today") {
    range = "today";
  } else if (sp.range === "yesterday") {
    range = "yesterday";
  } else if (sp.range === "last-7-days") {
    range = "last-7-days";
  } else if (sp.range === "this-month" || sp.range === "all-time") {
    range = "this-month";
  } else if (sp.range === "last-24h") {
    range = "latest";
  }

  const parsedCategory = sp.category
    ? ArticleCategorySchema.safeParse(sp.category).data
    : undefined;
  const parsedSubcategory = sp.subcategory
    ? ArticleSubcategorySchema.safeParse(sp.subcategory).data
    : undefined;
  const sentiment = sp.sentiment
    ? ArticleSentimentSchema.safeParse(sp.sentiment).data
    : undefined;

  const page = sp.page ? Math.max(1, parseInt(sp.page, 10) || 1) : 1;
  const pageSize = PAGE_SIZE_BY_RANGE[range] ?? 20;

  return {
    filters: {
      range,
      customDateFrom,
      customDateTo,
      q: sp.q || undefined,
      categories: parsedCategory ? [parsedCategory] : undefined,
      subcategories: parsedSubcategory ? [parsedSubcategory] : undefined,
      sentiment,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    },
    page,
    pageSize,
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

async function ResultList({
  filters,
  layout,
  page,
  pageSize,
  searchParams,
}: {
  filters: ArticleListFilters;
  layout: "landscape" | "gallery";
  page: number;
  pageSize: number;
  searchParams: Record<string, string | undefined>;
}) {
  const { items, total } = await articleRepo.findMany(filters);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-muted-foreground">
          No articles match these filters. Try a different date or keyword.
        </p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      {layout === "landscape" ? (
        <div className="space-y-4">
          {items.map((article) => (
            <ArticleCardLandscape key={article.id} article={article} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((article) => (
            <ArticleCardGallery key={article.id} article={article} />
          ))}
        </div>
      )}
      <Pagination
        currentPage={page}
        totalPages={totalPages}
        pageSize={pageSize}
        totalItems={total}
        searchParams={searchParams}
      />
    </div>
  );
}

function LandscapeSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-40 w-full" />
      ))}
    </div>
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
