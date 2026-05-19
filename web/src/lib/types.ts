import { z } from "zod";

/**
 * Domain types untuk artikel — match BigQuery schema `articles_latest` view.
 *
 * Zod schema = single source of truth: validasi runtime saat baca dari BQ + tipe TS.
 * Kalau schema BQ diubah, edit di sini sekali, semua consumer ter-update.
 */

/**
 * 2-level taxonomy (sinkron dengan ArticleAnalysis di fetch_news.py).
 * "Not Relevant" subcategory di-skip oleh pipeline, tidak masuk DB/frontend.
 */
export const ArticleCategorySchema = z.enum([
  "About AstraZeneca",
  "Regulatory/Policy",
]);
export const ArticleSubcategorySchema = z.enum([
  // About AstraZeneca
  "AZ Focus",
  "AZ Mentioned",
  // Regulatory/Policy
  "Stakeholder & Regulator",
  "Pharma Policy",
  "General Health Regulation",
]);
export const ArticleSentimentSchema = z.enum(["Positive", "Neutral", "Negative"]);

/** Mapping: dipakai kalau UI butuh derive Category dari Subcategory. */
export const SUBCATEGORY_TO_CATEGORY: Record<
  z.infer<typeof ArticleSubcategorySchema>,
  z.infer<typeof ArticleCategorySchema>
> = {
  "AZ Focus": "About AstraZeneca",
  "AZ Mentioned": "About AstraZeneca",
  "Stakeholder & Regulator": "Regulatory/Policy",
  "Pharma Policy": "Regulatory/Policy",
  "General Health Regulation": "Regulatory/Policy",
};

export const ArticleSchema = z.object({
  id: z.string(),
  headline: z.string(),
  url: z.url(),
  date: z.string(), // ISO timestamp; BQ TIMESTAMP serialized as string
  source: z.string().nullable(),
  summary: z.string().nullable(),
  category: ArticleCategorySchema.nullable(),
  subcategory: ArticleSubcategorySchema.nullable(),
  sentiment: ArticleSentimentSchema.nullable(),
  keywords: z.string().nullable(),
  city: z.string().nullable(),
  province: z.string().nullable(),
  language: z.string().nullable(),
  scraped_at: z.string(),
});

export type Article = z.infer<typeof ArticleSchema>;
export type ArticleCategory = z.infer<typeof ArticleCategorySchema>;
export type ArticleSubcategory = z.infer<typeof ArticleSubcategorySchema>;
export type ArticleSentiment = z.infer<typeof ArticleSentimentSchema>;

// =============================================================================
// Filter / query params untuk list pages
// =============================================================================

export type DateRange = "today" | "last-7-days" | "all-time" | "custom";

export interface ArticleListFilters {
  range: DateRange;
  /** ISO date (YYYY-MM-DD) — only used when range = "custom" */
  customDate?: string;
  /** Free-text search across headline + summary + keywords */
  q?: string;
  /** Match any of these categories (IN clause). Empty/undefined = all. */
  categories?: ArticleCategory[];
  /** Match any of these subcategories (IN clause). Empty/undefined = all. */
  subcategories?: ArticleSubcategory[];
  sentiment?: ArticleSentiment;
  /** Pagination */
  limit?: number;
  offset?: number;
}

// =============================================================================
// Analytics aggregates
// =============================================================================

export interface SentimentTrendPoint {
  date: string; // YYYY-MM-DD
  positive: number;
  neutral: number;
  negative: number;
}

export interface CategoryBreakdown {
  category: ArticleCategory;
  count: number;
}

export interface TopSource {
  source: string;
  count: number;
}

export interface TopProvince {
  province: string;
  count: number;
}

/**
 * KPI snapshot — all-time totals. Used by All News page (no delta).
 */
export interface AllTimeKpi {
  /** Total articles all-time */
  total: number;

  /** Net sentiment all-time (Positive − Negative) */
  netSentiment: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;

  /** Total AZ Focus + AZ Mentioned all-time */
  azRelatedTotal: number;
  azFocusCount: number;
  azMentionedCount: number;
}

/**
 * KPI snapshot — all-time totals PLUS today's contribution (delta).
 * Used by landing page so labels match All News but show "+N today" indicator.
 */
export interface DailyKpi extends AllTimeKpi {
  /** Articles added today (Asia/Jakarta) */
  totalToday: number;
  /** Today's contribution to net sentiment (todayPos − todayNeg) */
  netSentimentToday: number;
  /** Today's contribution to AZ Related (Focus + Mentioned added today) */
  azRelatedToday: number;
}
