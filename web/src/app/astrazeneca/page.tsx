import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";

import { ArticleCardGallery } from "@/components/article-card-gallery";
import { Skeleton } from "@/components/ui/skeleton";
import { articleRepo } from "@/lib/repositories";
import type { ArticleListFilters, ArticleSubcategory } from "@/lib/types";

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

  const filters: ArticleListFilters = {
    range: "all-time",
    categories: ["About AstraZeneca"],
    subcategories: activeTab.subcategories,
    limit: PAGE_SIZE,
  };

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

      <AzFilterTabs activeValue={activeValue} />

      <Suspense key={`list-${activeValue}`} fallback={<GallerySkeleton />}>
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
