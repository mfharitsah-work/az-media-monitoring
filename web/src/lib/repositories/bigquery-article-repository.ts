import { unstable_cache } from "next/cache";
import { bq, tbl } from "@/lib/bigquery";
import {
  articleDateInListRange,
  dateInAnalyticsRange as isoDateInAnalyticsRange,
  jakartaDate,
} from "@/lib/date-ranges";
import {
  ArticleSchema,
  CompetitorCompanySchema,
  CompetitorNewsArticleSchema,
  type AllTimeKpi,
  type AnalyticsRange,
  type Article,
  type ArticleListFilters,
  type CompetitorCompany,
  type CompetitorNewsArticle,
  type CompetitorNewsFilters,
  type DailyKpi,
  type DateBounds,
  type DateRange,
  type SentimentTrendPoint,
  type ShareOfVoiceRow,
  type SubcategoryBreakdown,
  type TopAzTopic,
  type TopProvince,
  type TopSource,
} from "@/lib/types";
import type { ArticleRepository } from "./article-repository";

/**
 * SINGLE-SNAPSHOT PATTERN.
 *
 * Masalah pola lama: tiap kombinasi filter punya cache entry sendiri dengan
 * TTL panjang. Kalau data berubah di antara waktu dua kombinasi pertama
 * di-query, mereka jadi tidak konsisten (mis. "all-time" stale = 11 sementara
 * "last-7-days" fresh = 18 — padahal all-time mustahil < 7-days).
 *
 * Solusi: SATU cache entry berisi seluruh artikel. Semua view (KPI, list,
 * filter, analytics) di-derive in-memory dari snapshot yang sama → semua
 * view dijamin konsisten karena semua turunan memakai snapshot artikel yang sama.
 * Untuk dataset skala ini (ratusan–ribuan artikel) ini efisien: 1 query BQ.
 */

const CACHE_TTL_SEC = 24 * 60 * 60;
const CACHE_TAG = "articles";

// =============================================================================
// Snapshot loader — satu-satunya BQ query untuk data artikel
// =============================================================================

type BQValue = string | boolean | { value: string } | null | undefined;

function normString(v: BQValue): string | null {
  if (v == null) return null;
  if (typeof v === "object" && "value" in v) return v.value;
  return String(v);
}

function normBoolean(v: BQValue): boolean | null {
  if (v == null) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "object" && "value" in v) {
    return v.value === "true";
  }
  return v === "true";
}

function normalizeRow(row: Record<string, BQValue>): Article {
  return ArticleSchema.parse({
    id: row.id,
    headline: row.headline,
    headline_id: row.headline_id ?? null,
    url: row.url,
    date: normString(row.date),
    source: row.source ?? null,
    summary: row.summary ?? null,
    summary_id: row.summary_id ?? null,
    category: row.category ?? null,
    subcategory: row.subcategory ?? null,
    sentiment: row.sentiment ?? null,
    keywords: row.keywords ?? null,
    keywords_id: row.keywords_id ?? null,
    city: row.city ?? null,
    province: row.province ?? null,
    language: row.language ?? null,
    scraped_at: normString(row.scraped_at),
  });
}

/**
 * Fetch SEMUA artikel sekali. Cached —
 * semua method lain derive dari sini. Invalidasi via revalidateTag("articles").
 *
 * Range seperti Latest News dihitung saat request agar mengikuti waktu sekarang.
 */
interface Snapshot {
  articles: Article[];
}

const loadSnapshot = unstable_cache(
  async (): Promise<Snapshot> => {
    const sql = `
      SELECT
        id,
        headline, headline_id,
        url, date, source,
        summary, summary_id,
        category, subcategory, sentiment,
        keywords, keywords_id,
        city, province,
        language, scraped_at
      FROM ${tbl("articles_latest")}
      ORDER BY date DESC
    `;
    const [rows] = await bq().query({ query: sql });
    const articles = rows.map(normalizeRow);
    return { articles };
  },
  ["articles-snapshot"],
  { revalidate: CACHE_TTL_SEC, tags: [CACHE_TAG] },
);

// =============================================================================
// Competitor snapshot — separate cache entry (different BQ table)
// =============================================================================

interface CompetitorRow {
  url: string;
  company: string;
  source: string | null;
  /** ISO timestamp string (BigQuery TIMESTAMP) */
  published_at: string;
}

interface CompetitorSnapshot {
  rows: CompetitorRow[];
}

const loadCompetitorSnapshot = unstable_cache(
  async (): Promise<CompetitorSnapshot> => {
    const sql = `
      SELECT url, company, source, published_at
      FROM ${tbl("competitor_news_articles_latest")}
      ORDER BY published_at DESC
    `;
    const legacySql = `
      SELECT url, company, source, published_at
      FROM ${tbl("competitor_articles_latest")}
      ORDER BY published_at DESC
    `;
    let rows;
    try {
      [rows] = await bq().query({ query: sql });
    } catch {
      [rows] = await bq().query({ query: legacySql });
    }
    const normalized: CompetitorRow[] = rows.map((r: Record<string, BQValue>) => ({
      url: normString(r.url) ?? "",
      company: normString(r.company) ?? "",
      source: normString(r.source),
      published_at: normString(r.published_at) ?? "",
    }));
    return { rows: normalized };
  },
  ["competitor-snapshot"],
  { revalidate: CACHE_TTL_SEC, tags: [CACHE_TAG] },
);

interface CompetitorNewsSnapshot {
  articles: CompetitorNewsArticle[];
}

function normalizeCompetitorNewsRow(row: Record<string, BQValue>): CompetitorNewsArticle {
  const url = normString(row.url) ?? "";
  return CompetitorNewsArticleSchema.parse({
    id: normString(row.id) ?? "",
    company: normString(row.company),
    headline: normString(row.headline) ?? "",
    url,
    canonical_url: normString(row.canonical_url) ?? url,
    source: normString(row.source),
    published_at: normString(row.published_at),
    snippet: normString(row.snippet),
    matched_query: normString(row.matched_query),
    is_whitelisted_source: normBoolean(row.is_whitelisted_source),
    scraped_at: normString(row.scraped_at),
    summary: normString(row.summary),
    keywords: normString(row.keywords),
    key_message: normString(row.key_message),
    relevance: normString(row.relevance),
    analysis_status: normString(row.analysis_status) ?? "pending",
    analysis_error: normString(row.analysis_error),
    lm_model: normString(row.lm_model),
    analyzed_at: normString(row.analyzed_at),
  });
}

const loadCompetitorNewsSnapshot = unstable_cache(
  async (): Promise<CompetitorNewsSnapshot> => {
    const sql = `
      SELECT
        id,
        company,
        headline,
        url,
        canonical_url,
        source,
        published_at,
        snippet,
        matched_query,
        is_whitelisted_source,
        scraped_at,
        summary,
        keywords,
        key_message,
        relevance,
        analysis_status,
        analysis_error,
        lm_model,
        analyzed_at
      FROM ${tbl("competitor_news_latest")}
      ORDER BY published_at DESC
    `;
    try {
      const [rows] = await bq().query({ query: sql });
      const articles = rows.map(normalizeCompetitorNewsRow);
      return { articles };
    } catch {
      return { articles: [] };
    }
  },
  ["competitor-news-snapshot"],
  { revalidate: CACHE_TTL_SEC, tags: [CACHE_TAG] },
);

// =============================================================================
// In-memory filters & aggregations (pure functions atas snapshot)
// =============================================================================

/**
 * Cek apakah artikel masuk rentang tanggal (list filter).
 *
 * Latest News = yesterday 00:00 WIB through now.
 */
function inListRange(
  a: Article,
  range: DateRange,
  customDateFrom?: string,
  customDateTo?: string,
  nowMs = Date.now(),
): boolean {
  return articleDateInListRange(a.date, range, customDateFrom, customDateTo, nowMs);
}

/**
 * Cek apakah ISO date string masuk rentang Analytics.
 * Range bisa berupa "last-7-days", "all-time", atau `h1-YYYY`/`h2-YYYY`.
 * Dipakai untuk article date DAN competitor published_at (semua di Jakarta timezone).
 */
function dateInAnalyticsRange(iso: string, range: AnalyticsRange): boolean {
  return isoDateInAnalyticsRange(iso, range);
}

/** Wrapper untuk Article (legacy callers). */
function inAnalyticsRange(a: Article, range: AnalyticsRange): boolean {
  return dateInAnalyticsRange(a.date, range);
}

function matchesFilters(
  a: Article,
  f: ArticleListFilters,
  nowMs: number,
): boolean {
  if (
    !inListRange(
      a,
      f.range,
      f.customDateFrom,
      f.customDateTo,
      nowMs,
    )
  ) {
    return false;
  }

  if (f.q) {
    const q = f.q.toLowerCase();
    const haystack = `${a.headline} ${a.summary ?? ""} ${a.keywords ?? ""}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  if (f.categories?.length) {
    if (!a.category || !f.categories.includes(a.category)) return false;
  }
  if (f.subcategories?.length) {
    if (!a.subcategory || !f.subcategories.includes(a.subcategory)) return false;
  }
  if (f.sentiment && a.sentiment !== f.sentiment) return false;

  return true;
}

function matchesCompetitorFilters(
  article: CompetitorNewsArticle,
  filters: CompetitorNewsFilters,
  nowMs: number,
): boolean {
  if (
    !articleDateInListRange(
      article.published_at,
      filters.range,
      filters.customDateFrom,
      filters.customDateTo,
      nowMs,
    )
  ) {
    return false;
  }

  if (filters.companies?.length && !filters.companies.includes(article.company)) {
    return false;
  }

  if (filters.q) {
    const q = filters.q.toLowerCase();
    const haystack = [
      article.company,
      article.headline,
      article.source ?? "",
      article.snippet ?? "",
      article.summary ?? "",
      article.key_message ?? "",
      article.keywords ?? "",
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }

  return true;
}

/** Hitung KPI dari sekumpulan artikel. */
function computeKpi(articles: Article[]): AllTimeKpi {
  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;
  let azPositiveCount = 0;
  let azNegativeCount = 0;
  let azNeutralCount = 0;
  let azFocusCount = 0;
  let azMentionedCount = 0;
  let azRelatedTotal = 0;

  for (const a of articles) {
    if (a.sentiment === "Positive") positiveCount++;
    else if (a.sentiment === "Negative") negativeCount++;
    else if (a.sentiment === "Neutral") neutralCount++;

    if (a.category === "About AstraZeneca") {
      azRelatedTotal++;
      if (a.sentiment === "Positive") azPositiveCount++;
      else if (a.sentiment === "Negative") azNegativeCount++;
      else if (a.sentiment === "Neutral") azNeutralCount++;
    }
    if (a.subcategory === "AZ Focus") azFocusCount++;
    else if (a.subcategory === "AZ Mentioned") azMentionedCount++;
  }

  return {
    total: articles.length,
    netSentiment: azPositiveCount - azNegativeCount,
    positiveCount,
    negativeCount,
    neutralCount,
    azRelatedTotal,
    azFocusCount,
    azMentionedCount,
    azPositiveCount,
    azNegativeCount,
    azNeutralCount,
  };
}

// =============================================================================
// Repository — semua method derive dari loadSnapshot()
// =============================================================================

export const bigQueryArticleRepository: ArticleRepository = {
  async findById(id) {
    const { articles } = await loadSnapshot();
    return articles.find((a) => a.id === id) ?? null;
  },

  async findLatest(limit = 50) {
    const { articles } = await loadSnapshot();
    const nowMs = Date.now();
    return articles
      .filter((a) => inListRange(a, "latest", undefined, undefined, nowMs))
      .slice(0, limit);
  },

  async findRecent(limit = 10) {
    const { articles } = await loadSnapshot();
    return articles.slice(0, limit); // snapshot sudah sorted date desc
  },

  async findMany(filters) {
    const { articles } = await loadSnapshot();
    const nowMs = Date.now();
    const matched = articles.filter((a) => matchesFilters(a, filters, nowMs));
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 50;
    return {
      items: matched.slice(offset, offset + limit),
      total: matched.length,
    };
  },

  async findCompetitorNews(filters) {
    const { articles } = await loadCompetitorNewsSnapshot();
    const nowMs = Date.now();
    const matched = articles.filter((a) => matchesCompetitorFilters(a, filters, nowMs));
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 20;
    return {
      items: matched.slice(offset, offset + limit),
      total: matched.length,
    };
  },

  async competitorCompanies(): Promise<CompetitorCompany[]> {
    return [...CompetitorCompanySchema.options];
  },

  async dailyKpi(): Promise<DailyKpi> {
    const { articles } = await loadSnapshot();
    const nowMs = Date.now();
    const latest = articles.filter((a) => inListRange(a, "latest", undefined, undefined, nowMs));
    const kLatest = computeKpi(latest);
    return {
      ...computeKpi(articles),
      totalLatest: kLatest.total,
      netSentimentLatest: kLatest.netSentiment,
      azRelatedLatest: kLatest.azRelatedTotal,
    };
  },

  async allTimeKpi() {
    const { articles } = await loadSnapshot();
    return computeKpi(articles);
  },

  async filteredKpi(filters) {
    const { articles } = await loadSnapshot();
    const nowMs = Date.now();
    return computeKpi(articles.filter((a) => matchesFilters(a, filters, nowMs)));
  },

  async sentimentTrend(range): Promise<SentimentTrendPoint[]> {
    const { articles } = await loadSnapshot();
    const byDate = new Map<string, SentimentTrendPoint>();
    for (const a of articles) {
      if (!inAnalyticsRange(a, range)) continue;
      const d = jakartaDate(a.date);
      let pt = byDate.get(d);
      if (!pt) {
        pt = { date: d, positive: 0, neutral: 0, negative: 0 };
        byDate.set(d, pt);
      }
      if (a.sentiment === "Positive") pt.positive++;
      else if (a.sentiment === "Negative") pt.negative++;
      else if (a.sentiment === "Neutral") pt.neutral++;
    }
    return [...byDate.values()].sort((x, y) => x.date.localeCompare(y.date));
  },

  async subcategoryBreakdown(range): Promise<SubcategoryBreakdown[]> {
    const { articles } = await loadSnapshot();
    const counts = new Map<string, number>();
    for (const a of articles) {
      if (!inAnalyticsRange(a, range)) continue;
      // Standalone kategori (Crisis & Disruption) punya subcategory=NULL →
      // bubble label dari kolom category supaya mereka muncul di Article
      // Distribution chart.
      const label = a.subcategory ?? a.category;
      if (!label) continue;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([subcategory, count]) => ({
        subcategory: subcategory as SubcategoryBreakdown["subcategory"],
        count,
      }))
      .sort((x, y) => y.count - x.count);
  },

  async topSources(range, limit, opts): Promise<TopSource[]> {
    const { articles } = await loadSnapshot();
    const azOnly = opts?.azOnly ?? false;
    const counts = new Map<string, number>();
    for (const a of articles) {
      if (!inAnalyticsRange(a, range)) continue;
      if (azOnly && a.category !== "About AstraZeneca") continue;
      if (!a.source) continue;
      counts.set(a.source, (counts.get(a.source) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((x, y) => y.count - x.count)
      .slice(0, limit);
  },

  async topProvinces(range, limit): Promise<TopProvince[]> {
    const { articles } = await loadSnapshot();
    const counts = new Map<string, number>();
    for (const a of articles) {
      if (!inAnalyticsRange(a, range)) continue;
      if (!a.province) continue;
      counts.set(a.province, (counts.get(a.province) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([province, count]) => ({ province, count }))
      .sort((x, y) => y.count - x.count)
      .slice(0, limit);
  },

  async shareOfVoice(range): Promise<ShareOfVoiceRow[]> {
    const [{ articles }, { rows: competitorRows }] = await Promise.all([
      loadSnapshot(),
      loadCompetitorSnapshot(),
    ]);

    // AZ count: artikel category=About AstraZeneca dalam range.
    const azCount = articles.filter(
      (a) => a.category === "About AstraZeneca" && inAnalyticsRange(a, range),
    ).length;

    // Competitor counts: per company, count rows dalam range.
    const competitorCounts = new Map<string, number>();
    for (const r of competitorRows) {
      if (!dateInAnalyticsRange(r.published_at, range)) continue;
      competitorCounts.set(r.company, (competitorCounts.get(r.company) ?? 0) + 1);
    }

    const all = [
      { company: "AstraZeneca Indonesia", count: azCount, isAz: true },
      ...[...competitorCounts.entries()].map(([company, count]) => ({
        company,
        count,
        isAz: false,
      })),
    ];

    const total = all.reduce((sum, r) => sum + r.count, 0);
    return all
      .sort((x, y) => y.count - x.count)
      .map((r, i) => ({
        rank: i + 1,
        company: r.company,
        count: r.count,
        sharePct: total > 0 ? (r.count / total) * 100 : 0,
        isAz: r.isAz,
      }));
  },

  async topAzTopics(range, limit): Promise<TopAzTopic[]> {
    const { articles } = await loadSnapshot();
    const counts = new Map<string, number>();
    for (const a of articles) {
      if (a.category !== "About AstraZeneca") continue;
      if (!inAnalyticsRange(a, range)) continue;
      if (!a.keywords) continue;
      // Per article: dedupe keyword duplicates supaya 1 artikel = 1 vote
      // per kw (kalau LM kasih kw yang sama 2x, jangan double-count).
      const seen = new Set<string>();
      for (const kw of a.keywords.split(",")) {
        const norm = kw.trim().toLowerCase();
        if (!norm || seen.has(norm)) continue;
        seen.add(norm);
        counts.set(norm, (counts.get(norm) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((x, y) => y.count - x.count)
      .slice(0, limit);
  },

  async dateBounds(): Promise<DateBounds> {
    const { articles } = await loadSnapshot();
    if (articles.length === 0) {
      const y = new Date().getFullYear();
      return { minYear: y, maxYear: y };
    }
    // Snapshot sudah sorted date desc → [0] = max, [last] = min.
    const maxYear = Number(jakartaDate(articles[0].date).slice(0, 4));
    const minYear = Number(jakartaDate(articles[articles.length - 1].date).slice(0, 4));
    return { minYear, maxYear };
  },
};
