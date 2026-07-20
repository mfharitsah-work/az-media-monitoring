-- BigQuery schema untuk media-monitoring AstraZeneca Indonesia.
--
-- Design choice: idempotent loaders.
--   - `bq_load.py` dedupes by article `id`
--   - `bq_load_competitors.py` dedupes by `(company, url)`
--   - loaders avoid BigQuery DML/MERGE so they work without billing enabled
--   - `pipeline_state` stores last successful main scrape time so scheduled
--     workflow can calculate a smaller dynamic lookback window.
--
-- Views are kept for compatibility and protection against old duplicate rows.
--
-- Jalankan SEKALI di BigQuery Console, atau re-run aman karena IF NOT EXISTS:
--   bq query --use_legacy_sql=false < infrastructure/bq_schema.sql

-- =============================================================================
-- TABLE: articles
-- =============================================================================
CREATE TABLE IF NOT EXISTS `az_daily_news_collection.articles` (
  id            STRING    NOT NULL  OPTIONS(description="12-char stable hash dari canonical URL"),
  headline      STRING    NOT NULL  OPTIONS(description="Headline English, default UI display"),
  headline_id   STRING              OPTIONS(description="Headline original Bahasa Indonesia"),
  url           STRING    NOT NULL  OPTIONS(description="URL artikel asli, sudah di-decode/canonicalized"),
  date          TIMESTAMP NOT NULL  OPTIONS(description="published_at dari RSS feed"),
  source        STRING              OPTIONS(description="Nama publikasi, mis. Kompas.com"),
  summary       STRING              OPTIONS(description="Ringkasan English, default UI display"),
  summary_id    STRING              OPTIONS(description="Ringkasan Bahasa Indonesia"),
  category      STRING              OPTIONS(description="About AstraZeneca atau Regulatory/Policy"),
  subcategory   STRING              OPTIONS(description="AZ Focus, AZ Mentioned, Stakeholder & Regulator, Pharma Policy, atau General Health Regulation"),
  sentiment     STRING              OPTIONS(description="Positive, Neutral, atau Negative"),
  keywords      STRING              OPTIONS(description="5 keyword English dipisah koma"),
  keywords_id   STRING              OPTIONS(description="5 keyword Bahasa Indonesia dipisah koma"),
  city          STRING              OPTIONS(description="Kota Indonesia atau kosong kalau tidak disebut"),
  province      STRING              OPTIONS(description="Provinsi Indonesia atau kosong kalau tidak disebut"),
  language      STRING              OPTIONS(description="ISO 639-1. Kept for backward compatibility"),
  scraped_at    TIMESTAMP NOT NULL  OPTIONS(description="Waktu loader meng-upsert row ini")
)
PARTITION BY DATE(date)
CLUSTER BY id, category, subcategory
OPTIONS(
  description="Article table loaded idempotently by non-DML dedup overwrite. Query via articles_latest view.",
  partition_expiration_days=NULL
);

-- =============================================================================
-- VIEW: articles_latest (1 row per id)
-- =============================================================================
CREATE OR REPLACE VIEW `az_daily_news_collection.articles_latest` AS
SELECT * EXCEPT(rn)
FROM (
  SELECT
    *,
    ROW_NUMBER() OVER (PARTITION BY id ORDER BY scraped_at DESC) AS rn
  FROM `az_daily_news_collection.articles`
)
WHERE rn = 1;

-- =============================================================================
-- VIEW: articles_last_24h (legacy compatibility)
-- =============================================================================
CREATE OR REPLACE VIEW `az_daily_news_collection.articles_last_24h` AS
SELECT *
FROM `az_daily_news_collection.articles_latest`
WHERE date >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
ORDER BY date DESC;

-- =============================================================================
-- TABLE: competitor_articles
-- =============================================================================
CREATE TABLE IF NOT EXISTS `az_daily_news_collection.competitor_articles` (
  url           STRING    NOT NULL  OPTIONS(description="Canonicalized article URL"),
  company       STRING    NOT NULL  OPTIONS(description="Nama kompetitor canonical"),
  source        STRING              OPTIONS(description="Apex domain publikasi, mis. detik.com"),
  published_at  TIMESTAMP NOT NULL  OPTIONS(description="published_at dari RSS feed"),
  scraped_at    TIMESTAMP NOT NULL  OPTIONS(description="Waktu loader meng-upsert row ini")
)
PARTITION BY DATE(published_at)
CLUSTER BY company
OPTIONS(
  description="Competitor news count tracking loaded idempotently by non-DML dedup overwrite.",
  partition_expiration_days=NULL
);

-- =============================================================================
-- VIEW: competitor_articles_latest (1 row per company + url)
-- =============================================================================
CREATE OR REPLACE VIEW `az_daily_news_collection.competitor_articles_latest` AS
SELECT * EXCEPT(rn)
FROM (
  SELECT
    *,
    ROW_NUMBER() OVER (PARTITION BY company, url ORDER BY scraped_at DESC) AS rn
  FROM `az_daily_news_collection.competitor_articles`
)
WHERE rn = 1;

-- =============================================================================
-- TABLE: pipeline_state
-- =============================================================================
CREATE TABLE IF NOT EXISTS `az_daily_news_collection.pipeline_state` (
  name             STRING    NOT NULL OPTIONS(description="Pipeline state key, e.g. daily_news_scrape"),
  last_success_at  TIMESTAMP NOT NULL OPTIONS(description="Last successful main scrape/load completion time"),
  updated_at       TIMESTAMP NOT NULL OPTIONS(description="Last state update time")
)
OPTIONS(
  description="Small state table used to compute dynamic scheduled scrape windows."
);
