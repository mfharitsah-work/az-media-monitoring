import Link from "next/link";
import { Building2, Newspaper, Smile, Target } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { BRAND, TEXT_TONE } from "@/lib/brand";
import { articleRepo } from "@/lib/repositories";
import type {
  AllTimeKpi,
  AnalyticsRange,
  ArticleListFilters,
} from "@/lib/types";

const KPI_LINKS = {
  totalNews: "/",
  aboutAz: "/astrazeneca",
  competitorNews: "/competitors",
} as const;

export async function FilteredKpiCards({
  filters,
}: {
  filters: ArticleListFilters;
}) {
  const [kpi, competitorNews] = await Promise.all([
    articleRepo.filteredKpi(filters),
    articleRepo.findCompetitorNews({ range: "all-time", limit: 1 }),
  ]);

  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <KpiCard
        href={KPI_LINKS.totalNews}
        icon={<Newspaper className="h-4 w-4" />}
        label="Total News"
        value={kpi.total.toLocaleString("en-US")}
        valueColor={BRAND.darkMulberry}
        footer={<SentimentBreakdown kpi={kpi} />}
      />
      <KpiCard
        href={KPI_LINKS.aboutAz}
        icon={<Target className="h-4 w-4" />}
        label="About AstraZeneca"
        value={kpi.azRelatedTotal.toLocaleString("en-US")}
        valueColor={BRAND.darkMulberry}
        footer={
          <div className="space-y-1">
            <AzBreakdown kpi={kpi} />
            <AzSentimentBreakdown kpi={kpi} />
          </div>
        }
      />
      <KpiCard
        href={KPI_LINKS.competitorNews}
        icon={<Building2 className="h-4 w-4" />}
        label="Competitor News"
        value={competitorNews.total.toLocaleString("en-US")}
        valueColor={BRAND.darkMulberry}
        footer={
          <span className="block text-xs text-muted-foreground">
            All stored competitor articles
          </span>
        }
      />
    </section>
  );
}

export async function AnalyticsKpiCards({ range }: { range: AnalyticsRange }) {
  const [kpi, azKpi] = await Promise.all([
    articleRepo.filteredKpi({ range }),
    articleRepo.filteredKpi({ range, categories: ["About AstraZeneca"] }),
  ]);

  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <KpiCard
        href={KPI_LINKS.totalNews}
        icon={<Newspaper className="h-4 w-4" />}
        label="Total News Coverage"
        value={kpi.total.toLocaleString("en-US")}
        valueColor={BRAND.darkMulberry}
        footer={<SentimentBreakdown kpi={kpi} />}
      />
      <KpiCard
        href={KPI_LINKS.aboutAz}
        icon={<Smile className="h-4 w-4" />}
        label="AZ News Sentiment"
        value={azKpi.total.toLocaleString("en-US")}
        valueColor={BRAND.darkMulberry}
        footer={
          <div className="space-y-1">
            <SentimentBreakdown kpi={azKpi} />
            <span className="block text-xs text-muted-foreground">
              {azKpi.total} AZ article{azKpi.total === 1 ? "" : "s"}
            </span>
          </div>
        }
      />
    </section>
  );
}

export function AnalyticsKpiCardsSkeleton() {
  return (
    <section className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-5">
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="mt-3 h-10 w-16 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-3 w-24 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

export function KpiCardsSkeleton() {
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-5">
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="mt-3 h-10 w-16 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-3 w-24 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function SentimentBreakdown({ kpi }: { kpi: AllTimeKpi }) {
  return (
    <span className="block text-xs text-muted-foreground">
      <span style={{ color: TEXT_TONE.positive }} className="font-medium">
        {kpi.positiveCount} positive
      </span>
      {" | "}
      <span style={{ color: TEXT_TONE.negative }} className="font-medium">
        {kpi.negativeCount} negative
      </span>
      {" | "}
      <span>{kpi.neutralCount} neutral</span>
    </span>
  );
}

function AzBreakdown({ kpi }: { kpi: AllTimeKpi }) {
  return (
    <span className="block text-xs text-muted-foreground">
      {kpi.azFocusCount} Focus &middot; {kpi.azMentionedCount} Mentioned
    </span>
  );
}

function AzSentimentBreakdown({ kpi }: { kpi: AllTimeKpi }) {
  return (
    <span className="block text-xs text-muted-foreground">
      <span style={{ color: TEXT_TONE.positive }} className="font-medium">
        {kpi.azPositiveCount} positive
      </span>
      {" | "}
      <span style={{ color: TEXT_TONE.negative }} className="font-medium">
        {kpi.azNegativeCount} negative
      </span>
      {" | "}
      <span>{kpi.azNeutralCount} neutral</span>
    </span>
  );
}

function KpiCard({
  icon,
  label,
  value,
  valueColor,
  footer,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  valueColor?: string;
  footer: React.ReactNode;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group block focus-visible:outline-none"
      aria-label={`${label}: ${value}`}
    >
      <Card className="h-full transition-shadow group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground group-hover:text-foreground">
            {icon}
            {label}
          </div>
          <div
            className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl"
            style={valueColor ? { color: valueColor } : undefined}
          >
            {value}
          </div>
          <div className="mt-2">{footer}</div>
        </CardContent>
      </Card>
    </Link>
  );
}
