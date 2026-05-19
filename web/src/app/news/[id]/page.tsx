import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, MapPin, Clock, Calendar, Globe } from "lucide-react";
import { format, parseISO } from "date-fns";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CategoryBadge,
  SentimentBadge,
  SubcategoryBadge,
  categoryStripeClass,
  subcategoryStripeClass,
} from "@/components/article-badges";
import { articleRepo } from "@/lib/repositories";

export const revalidate = 3600;

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const article = await articleRepo.findById(id);
  if (!article) return { title: "Article not found" };
  return {
    title: article.headline,
    description: article.summary ?? undefined,
  };
}

export default async function NewsDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const article = await articleRepo.findById(id);

  if (!article) {
    notFound();
  }

  const publishedDate = format(parseISO(article.date), "EEEE, d MMMM yyyy 'at' HH:mm");
  const scrapedDate = format(parseISO(article.scraped_at), "d MMM yyyy HH:mm");

  const keywords = article.keywords
    ?.split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  const stripe = article.subcategory
    ? subcategoryStripeClass[article.subcategory]
    : article.category
      ? categoryStripeClass[article.category]
      : "bg-slate-300";

  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <Link
        href="/news"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to all news
      </Link>

      <Card className="overflow-hidden py-0 gap-0">
        <div className={`h-1.5 w-full ${stripe}`} aria-hidden />
        <CardContent className="space-y-6 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <CategoryBadge value={article.category} />
            <SubcategoryBadge value={article.subcategory} />
            <SentimentBadge value={article.sentiment} />
            {article.language && (
              <Badge variant="outline" className="font-normal">
                <Globe className="mr-1 h-3 w-3" />
                {article.language.toUpperCase()}
              </Badge>
            )}
          </div>

          <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
            {article.headline}
          </h1>

          {/* Meta info */}
          <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            {article.source && (
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">{article.source}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {publishedDate}
            </div>
            {(article.city || article.province) && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                {[article.city, article.province].filter(Boolean).join(", ")}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Scraped: {scrapedDate}
            </div>
          </div>

          {/* Summary */}
          {article.summary && (
            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Summary
              </h2>
              <p className="text-base leading-relaxed">{article.summary}</p>
            </div>
          )}

          {/* Keywords */}
          {keywords && keywords.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Keywords
              </h2>
              <div className="flex flex-wrap gap-2">
                {keywords.map((kw) => (
                  <Badge key={kw} variant="secondary" className="font-normal">
                    {kw}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Original article link */}
          <div className="border-t pt-6">
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Read full article on {article.source ?? "source"}
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </CardContent>
      </Card>
    </article>
  );
}
