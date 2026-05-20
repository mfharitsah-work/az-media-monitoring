import type { Metadata } from "next";
import { Suspense } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CategoryBreakdownChart,
  SentimentTrendChart,
  TopProvincesChart,
  TopSourcesChart,
} from "@/components/analytics-charts";
import { articleRepo } from "@/lib/repositories";

export const metadata: Metadata = {
  title: "Analytics",
  description: "Sentiment trend, category, source, and location analytics for AstraZeneca Indonesia news.",
};

export const revalidate = 3600;

const TREND_DAYS = 14;
const BREAKDOWN_DAYS = 7;
const TOP_LIMIT = 10;

export default function AnalyticsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">
          Trend and distribution visualizations for AstraZeneca Indonesia media monitoring.
        </p>
      </header>

      {/* Each chart streams independently — a slow query won't block the others. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Sentiment Trend (last 14 days)"
          description="Article count per sentiment per day"
        >
          <Suspense fallback={<ChartSkeleton />}>
            <SentimentTrendSection />
          </Suspense>
        </ChartCard>

        <ChartCard
          title="Categories (last 7 days)"
          description="Article distribution by category"
        >
          <Suspense fallback={<ChartSkeleton />}>
            <CategoryBreakdownSection />
          </Suspense>
        </ChartCard>

        <ChartCard
          title={`Top ${TOP_LIMIT} Sources (last 7 days)`}
          description="Publications that produced the most articles"
        >
          <Suspense fallback={<ChartSkeleton />}>
            <TopSourcesSection />
          </Suspense>
        </ChartCard>

        <ChartCard
          title={`Top ${TOP_LIMIT} Provinces (last 7 days)`}
          description="Provinces most often referenced as the article location"
        >
          <Suspense fallback={<ChartSkeleton />}>
            <TopProvincesSection />
          </Suspense>
        </ChartCard>
      </div>
    </div>
  );
}

// =============================================================================
// Server data-fetching sections (1 per chart for streaming)
// =============================================================================

async function SentimentTrendSection() {
  const data = await articleRepo.sentimentTrend(TREND_DAYS);
  return <SentimentTrendChart data={data} />;
}

async function CategoryBreakdownSection() {
  const data = await articleRepo.categoryBreakdown(BREAKDOWN_DAYS);
  return <CategoryBreakdownChart data={data} />;
}

async function TopSourcesSection() {
  const data = await articleRepo.topSources(BREAKDOWN_DAYS, TOP_LIMIT);
  return <TopSourcesChart data={data} />;
}

async function TopProvincesSection() {
  const data = await articleRepo.topProvinces(BREAKDOWN_DAYS, TOP_LIMIT);
  return <TopProvincesChart data={data} />;
}

// =============================================================================
// UI primitives
// =============================================================================

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ChartSkeleton() {
  return <Skeleton className="h-72 w-full" />;
}
