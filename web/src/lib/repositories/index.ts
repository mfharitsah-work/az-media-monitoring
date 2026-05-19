/**
 * Repository factory — single import point for app code.
 *
 * Untuk migrasi ke Supabase: swap export di bawah dengan supabaseArticleRepository.
 * Konsumen tidak perlu berubah karena pakai interface ArticleRepository.
 */
import { bigQueryArticleRepository } from "./bigquery-article-repository";
import type { ArticleRepository } from "./article-repository";

export const articleRepo: ArticleRepository = bigQueryArticleRepository;

export type { ArticleRepository };
