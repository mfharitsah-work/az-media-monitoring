import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { ArticleTranslator } from "@/components/article-translator";
import { stripeColor } from "@/components/article-badges";
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

  const stripe = stripeColor(article.subcategory, article.category);

  return (
    <article className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <Link
        href="/news"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to all news
      </Link>

      <Card className="overflow-hidden py-0 gap-0">
        <div
          className="h-1.5 w-full"
          style={{ backgroundColor: stripe }}
          aria-hidden
        />
        <CardContent className="space-y-6 p-6 sm:p-8">
          <ArticleTranslator article={article} />

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
