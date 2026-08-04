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

Legacy raw table for competitor count tracking.

| Property | Value |
|---|---|
| Partition | `DATE(published_at)` |
| Cluster | `company` |
| Loader | `bq_load_competitors.py` |
| Dedupe key | `company`, `url` |

### `competitor_articles_latest`

One latest row per `company + url`, ordered by `scraped_at DESC`.

This remains for compatibility. New competitor pages should read from
`competitor_news_latest`.

### `competitor_news_articles`

Raw table for full competitor news scraping.

| Property | Value |
|---|---|
| Partition | `DATE(published_at)` |
| Cluster | `company`, `id` |
| Loader | `bq_load_competitor_news.py` |
| Dedupe key | `id` = stable hash from `company + canonical_url` |

Important columns:

| Column | Type | Notes |
|---|---|---|
| `id` | string | 16-char stable hash from company + canonical URL |
| `company` | string | Canonical competitor name |
| `headline` | string | RSS headline |
| `url` | string | Canonicalized article URL |
| `source` | string | Apex media domain |
| `published_at` | ISO timestamp | RSS publish time |
| `snippet` | string | RSS snippet/description |
| `is_whitelisted_source` | bool | False can still be valid for Roche bypass |
| `scraped_at` | ISO timestamp | Loader/scraper processing timestamp |

### `competitor_news_articles_latest`

One latest row per raw competitor article id.

### `competitor_news_enrichment`

Cerebras enrichment table for competitor news. It intentionally does not store
sentiment.

| Property | Value |
|---|---|
| Partition | `DATE(analyzed_at)` |
| Cluster | `article_id`, `company` |
| Loader | `bq_load_competitor_enrichment.py` |
| Dedupe key | `article_id` |

Important columns:

| Column | Type | Notes |
|---|---|---|
| `article_id` | string | Logical FK to `competitor_news_articles.id` |
| `summary` | string | English summary from Cerebras |
| `keywords` | string | English comma-separated keywords |
| `key_message` | string | Main competitor signal |
| `relevance` | string | `Relevant` or `Not Relevant` |
| `lm_model` | string | Model used for enrichment |
| `analysis_status` | string | `analyzed`, `pending`, `skipped`, or `failed` |
| `analysis_error` | string | Short skip/failure reason |

### `competitor_news_latest`

Joined view from `competitor_news_articles_latest` and
`competitor_news_enrichment_latest`.

The frontend `/competitors` page reads this view. Share of Voice can count from
`competitor_news_articles_latest` and falls back to the legacy
`competitor_articles_latest` table while the new pipeline is being rolled out.

### `pipeline_state`

Stores the last successful main scrape/load completion timestamp.

Used by:

```text
compute_scrape_window.py
update_pipeline_state.py
.github/workflows/scrape.yml
.github/workflows/competitor-news.yml
```

This lets scheduled runs use:

```text
last_success_at -> now + buffer
```

instead of a fixed 24-hour window.

### `auth_users`

Append-only credential version table for admin and superadmin users. Guest is
not stored here; anonymous visitors are treated as `guest`.

| Property | Value |
|---|---|
| Partition | `DATE(updated_at)` |
| Cluster | `email`, `role` |
| Dedupe/latest key | `email` via `auth_users_latest` |

Important columns:

| Column | Type | Notes |
|---|---|---|
| `email` | string | Login email, normalized lowercase |
| `name` | string | Used to autofill digest sender name |
| `job_title` | string | Used to autofill digest sender job title |
| `role` | string | `admin` or `superadmin` |
| `password_hash` | string | PBKDF2 hash only; never plaintext |
| `is_active` | bool | Inactive users cannot login |
| `last_login_at` | timestamp | Updated after successful login |
| `action` | string | create/login/reset_password/set_role/deactivate/reactivate |

### `auth_users_latest`

One latest row per email, ordered by `updated_at DESC, version_id DESC`.

### `auth_audit_logs`

Append-only log for login and credential management events.

### `compose_digest_logs`

Append-only log for Compose Digest Email usage. It stores the logged-in user,
sender autofill values actually used in the dialog, recipients, subject,
selected digest ranges, and article ids.

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
