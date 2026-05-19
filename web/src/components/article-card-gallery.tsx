import Link from "next/link";
import { formatDistanceToNow, parseISO } from "date-fns";

import { Card } from "@/components/ui/card";
import {
  CategoryBadge,
  SentimentBadge,
  SubcategoryBadge,
  categoryStripeClass,
  subcategoryStripeClass,
} from "@/components/article-badges";
import type { Article } from "@/lib/types";

/**
 * Gallery card — compact, for 2-3 column grid (Last 7d / Custom Date).
 * Click → /news/[id] for full detail.
 *
 * Differs from ArticleCardLandscape:
 * - More compact, no keywords/location/source
 * - Top stripe (4px) instead of side stripe — fits grid cards better
 * - Headline 3-line clamp (vs 2-line in landscape)
 */
export function ArticleCardGallery({ article }: { article: Article }) {
  const relativeDate = formatDistanceToNow(parseISO(article.date), {
    addSuffix: true,
  });

  const stripe = article.subcategory
    ? subcategoryStripeClass[article.subcategory]
    : article.category
      ? categoryStripeClass[article.category]
      : "bg-slate-300";

  return (
    <Link
      href={`/news/${article.id}`}
      className="group block focus-visible:outline-none"
    >
      <Card className="h-full overflow-hidden transition-shadow group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring py-0 gap-0">
        <div className={`h-1 w-full ${stripe}`} aria-hidden />
        <div className="flex h-full flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <CategoryBadge value={article.category} />
            <SubcategoryBadge value={article.subcategory} />
            <SentimentBadge value={article.sentiment} />
          </div>

          <h3 className="line-clamp-3 text-base font-semibold leading-snug group-hover:text-primary">
            {article.headline}
          </h3>

          <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
            {article.source && (
              <span className="truncate font-medium">{article.source}</span>
            )}
            <span className="shrink-0">{relativeDate}</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
