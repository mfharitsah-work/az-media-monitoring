import type { Metadata } from "next";
import { ExternalLink, Newspaper } from "lucide-react";

import { CompetitorNewsFilters } from "@/components/competitor-news-filters";
import { RangeTabs } from "@/components/news-filters";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

const PAGE_SIZE_BY_RANGE: Record<DateRange, number> = {
  latest: 10,
  yesterday: 10,
  today: 10,
  "last-7-days": 20,
  "this-month": 20,
  "all-time": 20,
  custom: 20,
};

export default async function CompetitorNewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { filters, page, pageSize } = parseParams(sp);
  const companies = await articleRepo.competitorCompanies();
  const { items, total } = await articleRepo.findCompetitorNews(filters);
  const rangeDescription = describeArticleListRange(
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
        <div className="space-y-2">
          <RangeTabs activeRange={filters.range} />
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Displayed range:</span>{" "}
            {rangeDescription}
          </p>
        </div>
        <CompetitorNewsFilters companies={companies} />
      </section>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">
            No competitor articles match these filters yet.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((article) => (
            <CompetitorNewsCard key={article.id} article={article} />
          ))}
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
  let range: DateRange = "latest";
  if (sp.range === "last-7-days") {
    range = "last-7-days";
  } else if (sp.range === "this-month" || sp.range === "all-time") {
    range = "this-month";
  } else if (sp.range === "today") {
    range = "today";
  } else if (sp.range === "yesterday") {
    range = "yesterday";
  } else if (sp.range === "latest" || sp.range === "last-24h") {
    range = "latest";
  }

  const company = sp.company
    ? CompetitorCompanySchema.safeParse(sp.company).data
    : undefined;
  const page = sp.page ? Math.max(1, parseInt(sp.page, 10) || 1) : 1;
  const pageSize = PAGE_SIZE_BY_RANGE[range] ?? 20;

  return {
    filters: {
      range,
      q: sp.q || undefined,
      companies: company ? [company] : undefined,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    },
    page,
    pageSize,
  };
}

function CompetitorNewsCard({ article }: { article: CompetitorNewsArticle }) {
  const keywords = article.keywords
    ?.split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .slice(0, 5);
  const bodyText = article.summary || article.snippet;

  return (
    <Card className="py-0">
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{article.company}</Badge>
          <StatusBadge article={article} />
          {article.source && <Badge variant="outline">{article.source}</Badge>}
          <span className="ml-auto text-xs text-muted-foreground">
            {formatDateTime(article.published_at)}
          </span>
        </div>

        <div className="space-y-2">
          <a
            href={article.url}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-start gap-2 text-lg font-semibold leading-snug hover:text-primary"
          >
            <span>{article.headline}</span>
            <ExternalLink className="mt-1 h-4 w-4 shrink-0 opacity-70 transition-opacity group-hover:opacity-100" />
          </a>
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
      </CardContent>
    </Card>
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

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));
}
