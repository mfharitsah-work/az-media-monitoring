import Link from "next/link";
import { formatDistanceToNow, parseISO } from "date-fns";

import { Card } from "@/components/ui/card";
import {
  SentimentBadge,
  SubcategoryBadge,
  stripeColor,
} from "@/components/article-badges";
import type { Article } from "@/lib/types";

/**
 * Gallery card — kompak, untuk grid 2-3 kolom (Last 7d / All Time / Custom).
 * Click → /news/[id] untuk detail.
 *
 * Beda dengan ArticleCardLandscape:
 * - Lebih ringkas: tidak ada keywords/location
 * - Top stripe (4px) instead of side stripe — pas untuk grid card
 * - Headline 3-line clamp
 */
export function ArticleCardGallery({ article }: { article: Article }) {
  const relativeDate = formatDistanceToNow(parseISO(article.date), {
    addSuffix: true,
  });

  const stripe = stripeColor(article.subcategory, article.category);

  return (
    <Link
      href={`/news/${article.id}`}
      className="group block focus-visible:outline-none"
    >
      <Card className="h-full overflow-hidden transition-shadow group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring py-0 gap-0">
        <div
          className="h-1 w-full"
          style={{ backgroundColor: stripe }}
          aria-hidden
        />
        <div className="flex h-full flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <SubcategoryBadge value={article.subcategory} />
            <SentimentBadge value={article.sentiment} />
          </div>

          <h3 className="line-clamp-3 text-sm font-semibold leading-snug group-hover:text-primary sm:text-base">
            {article.headline}
          </h3>

          <div className="mt-auto flex items-center justify-between gap-2 text-xs text-muted-foreground">
            {article.source && (
              <span className="truncate font-medium text-foreground/80">
                {article.source}
              </span>
            )}
            <span className="shrink-0">{relativeDate}</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
