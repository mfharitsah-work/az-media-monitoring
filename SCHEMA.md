# Data Schema

Current production storage is BigQuery, not PostgreSQL.

Schema source of truth:

```text
infrastructure/bq_schema.sql
```

Scraper output source of truth:

```text
news_pipeline/output.py
```

## Main Article Pipeline

`fetch_news.py` writes `news.json` and `news.csv`. The workflow then loads `news.json` with `bq_load.py`.

Output columns:

| Column | Type | Notes |
|---|---|---|
| `id` | string | 12-char stable SHA-256 hash from canonical article URL |
| `headline` | string | English headline, primary UI display |
| `headline_id` | string | Original Indonesian headline from RSS |
| `url` | string | Resolved article URL |
| `date` | ISO timestamp | Article publish time |
| `source` | string | Publication name parsed from Google News title |
| `summary` | string | English summary |
| `summary_id` | string | Indonesian summary |
| `category` | string | Top-level category |
| `subcategory` | string/null | Subcategory where applicable |
| `sentiment` | string | `Positive`, `Neutral`, or `Negative` |
| `keywords` | string | English comma-separated keywords |
| `keywords_id` | string | Indonesian comma-separated keywords |
| `city` | string | Indonesian city focus, or empty |
| `province` | string | Indonesian province focus, or empty |
| `language` | string | Kept for compatibility; usually `en` after bilingual pipeline |
| `scraped_at` | ISO timestamp | Loader/scraper processing timestamp |

## Taxonomy

Top-level categories:

| Category | Meaning |
|---|---|
| `About AstraZeneca` | AstraZeneca is the main topic or mentioned materially |
| `Regulatory/Policy` | Health, pharma, market access, BPOM, Kemenkes, BPJS, DPR, or policy coverage |
| `Crisis & Disruption` | Events that can disrupt healthcare, pharma operations, supply, or access |

Subcategories:

| Subcategory | Parent category |
|---|---|
| `AZ Focus` | `About AstraZeneca` |
| `AZ Mentioned` | `About AstraZeneca` |
| `Stakeholder & Regulator` | `Regulatory/Policy` |
| `Pharma Policy` | `Regulatory/Policy` |
| `General Health Regulation` | `Regulatory/Policy` |

`Crisis & Disruption` is stored as a standalone category. Its `subcategory` is `NULL`.

The model can also emit `Not Relevant`; those articles are skipped and not loaded.

## BigQuery Objects

### `articles`

Raw table for main article rows.

Important design points:

| Property | Value |
|---|---|
| Partition | `DATE(date)` |
| Cluster | `id`, `category`, `subcategory` |
| Loader | `bq_load.py` |
| Dedupe key | `id` |

The loader avoids DML/MERGE. It loads new rows into a staging table, builds a deduped replacement table, then copies it over `articles`.

### `articles_latest`

Compatibility and dedupe view. It returns one latest row per `id`, ordered by `scraped_at DESC`.

The frontend should query this view for normal reads.

### `articles_last_24h`

Legacy compatibility view for rolling 24-hour reads.

The current UI concept uses "Latest News" date framing, so this view should not be treated as the main product definition.

### `competitor_articles`

Raw table for competitor count tracking.

| Property | Value |
|---|---|
| Partition | `DATE(published_at)` |
| Cluster | `company` |
| Loader | `bq_load_competitors.py` |
| Dedupe key | `company`, `url` |

### `competitor_articles_latest`

One latest row per `company + url`, ordered by `scraped_at DESC`.

### `pipeline_state`

Stores the last successful main scrape/load completion timestamp.

Used by:

```text
compute_scrape_window.py
update_pipeline_state.py
.github/workflows/scrape.yml
```

This lets scheduled runs use:

```text
last_success_at -> now + buffer
```

instead of a fixed 24-hour window.

## URL Identity

Article identity is based on canonicalized URL before `make_article_id(url)`.

Canonicalization removes common duplicate forms:

| Example | Handling |
|---|---|
| `/amp` path segment | removed |
| `amp.` or `m.` host prefix | normalized to `www.` |
| `utm_*`, `fbclid`, `gclid`, etc. | removed |
| `?page=all` or other `page` query | removed |
| `sindonews.com/newsread/...` | normalized to `/read/...` |

The canonicalization helper lives in:

```text
news_pipeline/url_utils.py
```

## Frontend Types

Frontend domain types live in:

```text
web/src/lib/types.ts
```

The BigQuery repository maps raw rows to those types in:

```text
web/src/lib/repositories/bigquery-article-repository.ts
```

## Operational Notes

Because GitHub Actions schedules can be delayed or skipped, correctness comes from:

1. Dynamic scrape window via `pipeline_state`.
2. URL canonicalization before article id creation.
3. BigQuery dedupe loaders.
4. Frontend reads from latest/deduped views.

This design is appropriate for the current small dataset and BigQuery free-tier constraints. If data volume grows significantly, replace full-table dedupe overwrite with a billing-enabled MERGE strategy or move high-traffic reads to a query layer with pagination and server-side filters.
