"use client";

import { useState } from "react";
import { Calendar, Clock, Globe, Languages, Loader2, MapPin } from "lucide-react";
import { format, parseISO } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CategoryBadge,
  SentimentBadge,
  SubcategoryBadge,
} from "@/components/article-badges";
import type { Article } from "@/lib/types";

type Lang = "en" | "id";

/**
 * Versi translasi yang disimpan client-side setelah pertama kali fetch
 * (avoid re-hit ke /api/translate kalau user toggle bolak-balik).
 */
interface TranslationCache {
  headline: string;
  summary: string;
  keywords: string;
}

/**
 * Client wrapper untuk bagian utama artikel yang BISA di-toggle bahasanya.
 * Server-rendered shell (page.tsx) tetap punya badges/source/dates/link.
 *
 * Default: tampilkan field dari `article` (sudah English di BQ).
 * Klik "Translate to Indonesian" → POST /api/translate → tampilkan versi ID.
 */
export function ArticleTranslator({ article }: { article: Article }) {
  const [lang, setLang] = useState<Lang>(
    (article.language as Lang | null) === "id" ? "id" : "en",
  );
  const [translated, setTranslated] = useState<TranslationCache | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const original: TranslationCache = {
    headline: article.headline,
    summary: article.summary ?? "",
    keywords: article.keywords ?? "",
  };

  // Toggle target — kalau current = en, terjemahkan ke id; sebaliknya.
  // Karena data BQ semua en, "original" = en, "translated" = id.
  // Tetap diparameterize biar future-proof kalau ada artikel id di BQ.
  const originalLang: Lang = (article.language as Lang | null) === "id" ? "id" : "en";
  const targetLang: Lang = originalLang === "en" ? "id" : "en";
  const isShowingOriginal = lang === originalLang;

  const handleToggle = async () => {
    if (!isShowingOriginal) {
      // Sudah di-translate, balik ke original
      setLang(originalLang);
      return;
    }
    if (translated) {
      // Sudah pernah fetch — tinggal swap state
      setLang(targetLang);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headline: original.headline,
          summary: original.summary,
          keywords: original.keywords,
          target: targetLang,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as TranslationCache;
      setTranslated(data);
      setLang(targetLang);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Translation failed");
    } finally {
      setLoading(false);
    }
  };

  const display = isShowingOriginal ? original : (translated ?? original);
  const keywords = display.keywords
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  const publishedDate = format(
    parseISO(article.date),
    "EEEE, d MMMM yyyy 'at' HH:mm",
  );
  const scrapedDate = format(parseISO(article.scraped_at), "d MMM yyyy HH:mm");

  const buttonLabel = isShowingOriginal
    ? targetLang === "id"
      ? "Translate to Indonesian"
      : "Translate to English"
    : `Show original (${originalLang.toUpperCase()})`;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <CategoryBadge value={article.category} />
        <SubcategoryBadge value={article.subcategory} />
        <SentimentBadge value={article.sentiment} />
        <Badge variant="outline" className="font-normal">
          <Globe className="mr-1 h-3 w-3" />
          {lang.toUpperCase()}
          {!isShowingOriginal && (
            <span className="ml-1 text-muted-foreground">(translated)</span>
          )}
        </Badge>
      </div>

      <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
        {display.headline}
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

      {/* Translate toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handleToggle}
          disabled={loading}
          className="gap-2"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Languages className="h-3.5 w-3.5" />
          )}
          {loading ? "Translating..." : buttonLabel}
        </Button>
        {error && (
          <span className="text-sm text-destructive">{error}</span>
        )}
      </div>

      {/* Summary */}
      {display.summary && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Summary
          </h2>
          <p className="text-base leading-relaxed">{display.summary}</p>
        </div>
      )}

      {/* Keywords */}
      {keywords.length > 0 && (
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
    </>
  );
}
