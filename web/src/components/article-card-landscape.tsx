import Link from "next/link";
import { MapPin, Clock, ExternalLink } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  SentimentBadge,
  SubcategoryBadge,
  stripeColor,
} from "@/components/article-badges";
import type { Article } from "@/lib/types";

/**
 * Landscape card untuk daftar berita (Landing + All News › Last 24h tab).
 *
 * Visual: stripe warna tipis di kiri (warna = subcategory). Subcategory badge
 * sudah mengimplikasikan category, jadi category badge tidak ditampilkan di
 * kartu (cukup di halaman detail) — mengurangi clutter, terutama di mobile.
 */
export function ArticleCardLandscape({ article }: { article: Article }) {
  const relativeDate = formatDistanceToNow(parseISO(article.date), {
    addSuffix: true,
  });

  const stripe = stripeColor(article.subcategory, article.category);

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
          {/* Stripe warna — indikator subcategory */}
          <div
            className="w-1.5 shrink-0"
            style={{ backgroundColor: stripe }}
            aria-hidden
          />

          {/* Content */}
          <div className="flex flex-1 flex-col gap-2.5 p-4 sm:gap-3 sm:p-5">
            <div className="flex flex-wrap items-center gap-1.5">
              <SubcategoryBadge value={article.subcategory} />
              <SentimentBadge value={article.sentiment} />
              <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3 shrink-0" />
                {relativeDate}
              </span>
            </div>

            <h3 className="text-base font-semibold leading-snug group-hover:text-primary sm:text-lg sm:leading-tight">
              {article.headline}
            </h3>

            {article.summary && (
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {article.summary}
              </p>
            )}

            <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
              {article.source && (
                <span className="font-medium text-foreground/80">
                  {article.source}
                </span>
              )}
              {(article.city || article.province) && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {[article.city, article.province].filter(Boolean).join(", ")}
                </span>
              )}
              <span className="flex items-center gap-1 text-primary">
                <ExternalLink className="h-3 w-3 shrink-0" />
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
