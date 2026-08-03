import type { Metadata } from "next";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Newspaper } from "lucide-react";

import { CompetitorNewsFilters } from "@/components/competitor-news-filters";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { describeArticleListRange } from "@/lib/date-ranges";
import { articleRepo } from "@/lib/repositories";
import {
  CompetitorCompanySchema,
  type CompetitorNewsArticle,
  type CompetitorNewsFilters as CompetitorNewsFilterState,
  type DateRange,
} from "@/lib/types";

export const metadata: Metadata = {
  title: "Competitor News",
  description: "Competitor news monitoring for AstraZeneca Indonesia.",
};

export const revalidate = 3600;

const PAGE_SIZE = 60;

export default async function CompetitorNewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { filters, page, pageSize } = parseParams(sp);
  const companies = await articleRepo.competitorCompanies();
  const { items, total } = await articleRepo.findCompetitorNews(filters);
  const rangeDescription =
    filters.range === "all-time"
      ? describeCompetitorRange()
      : describeArticleListRange(
          filters.range,
          filters.customDateFrom,
          filters.customDateTo,
        );
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-10 lg:px-10">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Newspaper className="h-4 w-4" />
          <span>Competitor intelligence</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-[#4D0030]">
          Competitor News
        </h1>
        <p className="max-w-3xl text-muted-foreground">
          Monitor collected news for Bayer, GSK, MSD, Novartis, Novo Nordisk,
          Pfizer, Merck, Roche, and Takeda with company and keyword filters.
        </p>
      </header>

      <section className="space-y-4">
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Displayed range:</span>{" "}
          {rangeDescription}
        </p>
        <CompetitorNewsFilters companies={companies} />
      </section>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">
            No competitor articles match these filters yet.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Showing {items.length} of {total} article{total === 1 ? "" : "s"}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((article) => (
              <CompetitorNewsCard key={article.id} article={article} />
            ))}
          </div>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={total}
            searchParams={sp}
          />
        </div>
      )}
    </div>
  );
}

function parseParams(sp: Record<string, string | undefined>): {
  filters: CompetitorNewsFilterState;
  page: number;
  pageSize: number;
} {
  const company = sp.company
    ? CompetitorCompanySchema.safeParse(sp.company).data
    : undefined;
  const page = sp.page ? Math.max(1, parseInt(sp.page, 10) || 1) : 1;
  const dateFilter = parseDateFilter(sp);

  return {
    filters: {
      range: dateFilter.range,
      customDateFrom: dateFilter.customDateFrom,
      customDateTo: dateFilter.customDateTo,
      q: sp.q || undefined,
      companies: company ? [company] : undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    },
    page,
    pageSize: PAGE_SIZE,
  };
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

function describeCompetitorRange(): string {
  return `All stored competitor news through ${formatTodayJakarta()} WIB`;
}

function formatTodayJakarta(): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date());
}

function CompetitorNewsCard({ article }: { article: CompetitorNewsArticle }) {
  const relativeDate = formatDistanceToNow(parseISO(article.published_at), {
    addSuffix: true,
  });
  const keywords = article.keywords
    ?.split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .slice(0, 3);
  const bodyText = article.summary || article.snippet;

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noreferrer"
      className="group block focus-visible:outline-none"
    >
      <Card className="h-full overflow-hidden transition-shadow group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring py-0 gap-0">
        <div
          className="h-1 w-full bg-[#97005D]"
          aria-hidden
        />
        <div className="flex h-full flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{article.company}</Badge>
          <StatusBadge article={article} />
        </div>

        <div className="space-y-2">
          <h3 className="line-clamp-3 text-sm font-semibold leading-snug group-hover:text-primary sm:text-base">
            {article.headline}
          </h3>
          {bodyText && (
            <p className="line-clamp-3 text-sm text-muted-foreground">
              {bodyText}
            </p>
          )}
          {article.key_message && (
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              {article.key_message}
            </p>
          )}
        </div>

        {keywords && keywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {keywords.map((keyword) => (
              <Badge key={keyword} variant="secondary" className="font-normal">
                {keyword}
              </Badge>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate font-medium text-foreground/80">
            {article.source ?? "Unknown source"}
          </span>
          <span className="shrink-0">{relativeDate}</span>
        </div>
        </div>
      </Card>
    </a>
  );
}

function StatusBadge({ article }: { article: CompetitorNewsArticle }) {
  if (article.analysis_status === "analyzed") {
    return (
      <Badge variant={article.relevance === "Relevant" ? "secondary" : "outline"}>
        {article.relevance ?? "Analyzed"}
      </Badge>
    );
  }
  if (article.analysis_status === "pending") {
    return <Badge variant="outline">Pending enrichment</Badge>;
  }
  if (article.analysis_status === "skipped") {
    return <Badge variant="outline">Skipped</Badge>;
  }
  return <Badge variant="destructive">Enrichment failed</Badge>;
}
