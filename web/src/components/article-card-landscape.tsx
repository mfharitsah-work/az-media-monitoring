import Link from "next/link";
import { MapPin, Clock, ExternalLink } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CategoryBadge,
  SentimentBadge,
  SubcategoryBadge,
  categoryStripeClass,
  subcategoryStripeClass,
} from "@/components/article-badges";
import type { Article } from "@/lib/types";

/**
 * Landscape card for Today's news (Landing + All News › Today tab).
 *
 * Visual: 1.5px colored stripe on the left (color matches category),
 * full-width content next to it. Click card → /news/[id].
 */
export function ArticleCardLandscape({ article }: { article: Article }) {
  const relativeDate = formatDistanceToNow(parseISO(article.date), {
    addSuffix: true,
  });

  // Stripe pakai subcategory (lebih granular); fallback ke category (lebih broad).
  const stripe = article.subcategory
    ? subcategoryStripeClass[article.subcategory]
    : article.category
      ? categoryStripeClass[article.category]
      : "bg-slate-300";

  const keywords = article.keywords
    ?.split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 3);

  return (
    <Link
      href={`/news/${article.id}`}
      className="group block focus-visible:outline-none"
    >
      <Card className="overflow-hidden transition-shadow group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring py-0 gap-0">
        <div className="flex">
          {/* Thin colored stripe — visual category indicator */}
          <div className={`w-1.5 shrink-0 ${stripe}`} aria-hidden />

          {/* Content */}
          <div className="flex flex-1 flex-col gap-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <CategoryBadge value={article.category} />
              <SubcategoryBadge value={article.subcategory} />
              <SentimentBadge value={article.sentiment} />
              <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {relativeDate}
              </span>
            </div>

            <h3 className="text-lg font-semibold leading-tight group-hover:text-primary">
              {article.headline}
            </h3>

            {article.summary && (
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {article.summary}
              </p>
            )}

            <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              {article.source && (
                <span className="font-medium">{article.source}</span>
              )}
              {(article.city || article.province) && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {[article.city, article.province].filter(Boolean).join(", ")}
                </span>
              )}
              <span className="flex items-center gap-1">
                <ExternalLink className="h-3 w-3" />
                View details
              </span>
            </div>

            {keywords && keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {keywords.map((kw) => (
                  <Badge key={kw} variant="secondary" className="text-xs font-normal">
                    {kw}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
