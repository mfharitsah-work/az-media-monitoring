import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, Smile } from "lucide-react";

import { ArticleCardGallery } from "@/components/article-card-gallery";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { articleRepo } from "@/lib/repositories";
import type { ArticleListFilters, ArticleSubcategory } from "@/lib/types";

export const metadata: Metadata = {
  title: "About AstraZeneca",
  description: "All articles where AstraZeneca is the focus or mentioned.",
};

export const revalidate = 3600;

const PAGE_SIZE = 60;

// Filter tabs — semua artikel pakai category="About AstraZeneca",
// subcategory yg membedakan: AZ Focus vs AZ Mentioned.
const AZ_TABS: { value: string; label: string; subcategories: ArticleSubcategory[] }[] = [
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

  // Filter object yang dipakai oleh DAL (all-time, subcategory sesuai tab).
  const filters: ArticleListFilters = {
    range: "all-time",
    categories: ["About AstraZeneca"],
    subcategories: activeTab.subcategories,
    limit: PAGE_SIZE,
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
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

      <AzFilterTabs activeValue={activeValue} />

      <Suspense
        key={`kpi-${activeValue}`}
        fallback={<NetSentimentSkeleton />}
      >
        <NetSentimentCard filters={filters} />
      </Suspense>

      <Suspense
        key={`list-${activeValue}`}
        fallback={<GallerySkeleton />}
      >
        <ResultGrid filters={filters} />
      </Suspense>
    </div>
  );
}

function AzFilterTabs({ activeValue }: { activeValue: string }) {
  return (
    <div className="inline-flex rounded-md border bg-muted p-1">
      {AZ_TABS.map((tab) => {
        const isActive = tab.value === activeValue;
        return (
          <Link
            key={tab.value}
            href={tab.value === "all" ? "/astrazeneca" : `/astrazeneca?filter=${tab.value}`}
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

/**
 * Net Sentiment KPI standalone — dihitung untuk subset artikel AZ yang
 * cocok dengan tab aktif. Klik buka /sentiment untuk penjelasan rumus.
 */
async function NetSentimentCard({ filters }: { filters: ArticleListFilters }) {
  const kpi = await articleRepo.filteredKpi(filters);
  const tone =
    kpi.netSentiment > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : kpi.netSentiment < 0
        ? "text-rose-600 dark:text-rose-400"
        : "text-muted-foreground";
  const sign = kpi.netSentiment > 0 ? "+" : "";

  return (
    <Link href="/sentiment" className="group block max-w-sm focus-visible:outline-none">
      <Card className="transition-shadow group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground group-hover:text-foreground">
            <Smile className="h-4 w-4" />
            Net Sentiment
          </div>
          <div className={`mt-3 text-4xl font-bold tracking-tight ${tone}`}>
            {sign}
            {kpi.netSentiment}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            <span className="text-emerald-600 dark:text-emerald-400">
              {kpi.positiveCount} positive
            </span>
            {" · "}
            <span className="text-rose-600 dark:text-rose-400">
              {kpi.negativeCount} negative
            </span>
            {" · "}
            <span>{kpi.neutralCount} neutral</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function NetSentimentSkeleton() {
  return <Skeleton className="h-32 w-full max-w-sm" />;
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
        {items.map((a) => (
          <ArticleCardGallery key={a.id} article={a} />
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
