import type {
  AllTimeKpi,
  AnalyticsRange,
  Article,
  ArticleListFilters,
  DailyKpi,
  SentimentTrendPoint,
  SubcategoryBreakdown,
  TopProvince,
  TopSource,
} from "@/lib/types";

/**
 * Article Repository — DAL abstraction.
 *
 * Implementasi sekarang: BigQuery (BigQueryArticleRepository).
 * Implementasi nanti: Supabase (tinggal buat SupabaseArticleRepository
 * yang implement interface ini, swap di repository factory).
 *
 * Konsumen (pages, API routes) HANYA boleh import interface ini, tidak
 * langsung import dari BigQuery client.
 */
export interface ArticleRepository {
  /** Find one by stable id (12-char hash) */
  findById(id: string): Promise<Article | null>;

  /** Get articles from rolling last-24h window, ordered by date desc */
  findLast24h(limit?: number): Promise<Article[]>;

  /**
   * Get N most recent articles regardless of date — dipakai di landing page
   * supaya home tidak kosong saat hari sudah berganti tapi belum ada artikel
   * baru di tanggal hari ini (boundary timezone edge case).
   */
  findRecent(limit?: number): Promise<Article[]>;

  /** Generic list with filters — dipakai oleh All News page */
  findMany(filters: ArticleListFilters): Promise<{
    items: Article[];
    total: number;
  }>;

  // ===========================================================================
  // KPI / Analytics
  // ===========================================================================

  /** Snapshot KPI untuk landing page (semua scope hari ini, timezone Jakarta) */
  dailyKpi(): Promise<DailyKpi>;

  /** Snapshot KPI all-time untuk All News page — no deltas */
  allTimeKpi(): Promise<AllTimeKpi>;

  /**
   * KPI snapshot untuk subset artikel yang match filters.
   * Dipakai di All News + AZ page supaya KPI dinamis mengikuti filter.
   */
  filteredKpi(filters: ArticleListFilters): Promise<AllTimeKpi>;

  /** Sentiment trend per hari untuk rentang yang dipilih */
  sentimentTrend(range: AnalyticsRange): Promise<SentimentTrendPoint[]>;

  /** Breakdown jumlah artikel per subcategory */
  subcategoryBreakdown(range: AnalyticsRange): Promise<SubcategoryBreakdown[]>;

  /** Top N publikasi by artikel count */
  topSources(range: AnalyticsRange, limit: number): Promise<TopSource[]>;

  /** Top N provinsi by artikel count */
  topProvinces(range: AnalyticsRange, limit: number): Promise<TopProvince[]>;
}
