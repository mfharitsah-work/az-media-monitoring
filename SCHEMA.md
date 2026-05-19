# Data Schema — AstraZeneca News Monitoring

Dokumentasi field di CSV output, beserta padanan tipe data PostgreSQL dan TypeScript untuk Next.js.

## CSV Columns

| Column | Type (CSV) | Description | Example |
|---|---|---|---|
| `id` | string (12 char) | Stable hash dari URL — primary key | `62efc2831d4a` |
| `title` | string | Judul artikel asli | `AstraZeneca Indonesia umumkan...` |
| `summary` | string | Ringkasan 1-3 kalimat (rule-based atau AI) | `AstraZeneca dan Kemenkes...` |
| `source` | string | Nama publikasi | `Kompas.com`, `Detik Health` |
| `url` | string | URL artikel asli | `https://www.cnbcindonesia.com/...` |
| `published_at` | ISO 8601 datetime | Waktu publish artikel (timezone-aware) | `2025-05-27T15:30:00+07:00` |
| `scraped_at` | ISO 8601 datetime | Waktu sistem fetch (selalu UTC) | `2026-05-11T07:11:01+00:00` |
| `category` | enum | Klasifikasi konten | `Corporate`, `Product`, `Regulatory`, `Crisis`, `Competitor`, `Industry` |
| `sentiment` | enum | Label sentimen | `Positive`, `Neutral`, `Negative` |
| `sentiment_score` | float | Skor numerik -1.0 sd +1.0 | `-1.00`, `0.50`, `1.00` |
| `priority` | enum | Tingkat urgensi untuk CLT | `Critical`, `High`, `Normal`, `Low` |
| `language` | string (2 char) | ISO 639-1 language code | `id`, `en` |
| `keywords` | string (CSV-in-CSV) | Top-N kata kunci, dipisah koma | `kanker, paru, indonesia` |

## PostgreSQL DDL

```sql
CREATE TYPE article_category AS ENUM (
  'Corporate', 'Product', 'Regulatory', 'Crisis', 'Competitor', 'Industry'
);

CREATE TYPE article_sentiment AS ENUM ('Positive', 'Neutral', 'Negative');

CREATE TYPE article_priority AS ENUM ('Critical', 'High', 'Normal', 'Low');

CREATE TABLE articles (
  id              VARCHAR(12) PRIMARY KEY,
  title           TEXT NOT NULL,
  summary         TEXT,
  source          VARCHAR(100) NOT NULL,
  url             TEXT NOT NULL UNIQUE,
  published_at    TIMESTAMPTZ NOT NULL,
  scraped_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  category        article_category NOT NULL DEFAULT 'Industry',
  sentiment       article_sentiment NOT NULL DEFAULT 'Neutral',
  sentiment_score NUMERIC(3,2) NOT NULL DEFAULT 0.0,
  priority        article_priority NOT NULL DEFAULT 'Normal',
  language        CHAR(2) NOT NULL DEFAULT 'id',
  keywords        TEXT,
  
  -- Audit fields untuk pharma compliance
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_articles_published_at ON articles(published_at DESC);
CREATE INDEX idx_articles_priority ON articles(priority, published_at DESC);
CREATE INDEX idx_articles_category ON articles(category);
CREATE INDEX idx_articles_sentiment ON articles(sentiment);
CREATE INDEX idx_articles_source ON articles(source);

-- Full-text search di title + summary (Bahasa Indonesia + English)
CREATE INDEX idx_articles_fts ON articles 
  USING GIN(to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(summary, '')));
```

## TypeScript Types (Next.js)

```typescript
// types/article.ts

export type ArticleCategory = 
  | 'Corporate' 
  | 'Product' 
  | 'Regulatory' 
  | 'Crisis' 
  | 'Competitor' 
  | 'Industry';

export type ArticleSentiment = 'Positive' | 'Neutral' | 'Negative';

export type ArticlePriority = 'Critical' | 'High' | 'Normal' | 'Low';

export interface Article {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;   // ISO 8601
  scrapedAt: string;     // ISO 8601
  category: ArticleCategory;
  sentiment: ArticleSentiment;
  sentimentScore: number; // -1.0 to 1.0
  priority: ArticlePriority;
  language: 'id' | 'en';
  keywords: string;       // comma-separated
}
```

## Load CSV ke PostgreSQL

```sql
-- Cara cepat via COPY (paling efisien untuk batch)
COPY articles(id, title, summary, source, url, published_at, scraped_at,
              category, sentiment, sentiment_score, priority, language, keywords)
FROM '/path/to/astrazeneca_news.csv'
DELIMITER ','
CSV HEADER
ON CONFLICT (id) DO UPDATE SET
  scraped_at = EXCLUDED.scraped_at,
  sentiment = EXCLUDED.sentiment,
  sentiment_score = EXCLUDED.sentiment_score,
  priority = EXCLUDED.priority;
```

Atau pakai Node.js di Next.js:

```typescript
// scripts/import-csv.ts
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { db } from '@/lib/db';

const csv = readFileSync('astrazeneca_news.csv', 'utf-8');
const rows = parse(csv, { columns: true, skip_empty_lines: true });

for (const row of rows) {
  await db.article.upsert({
    where: { id: row.id },
    create: {
      id: row.id,
      title: row.title,
      summary: row.summary,
      source: row.source,
      url: row.url,
      publishedAt: new Date(row.published_at),
      scrapedAt: new Date(row.scraped_at),
      category: row.category,
      sentiment: row.sentiment,
      sentimentScore: parseFloat(row.sentiment_score),
      priority: row.priority,
      language: row.language,
      keywords: row.keywords,
    },
    update: {
      scrapedAt: new Date(row.scraped_at),
      sentiment: row.sentiment,
      sentimentScore: parseFloat(row.sentiment_score),
      priority: row.priority,
    },
  });
}
```

## Priority Logic (cara sistem decide)

| Kondisi | Priority |
|---|---|
| `category = Crisis` | **Critical** |
| `category = Regulatory` AND `sentiment = Negative` | **Critical** |
| `sentiment = Negative` AND `sentiment_score ≤ -0.5` | **High** |
| `category in (Regulatory, Product)` | **High** |
| Lainnya | **Normal** |

Threshold ini bisa disesuaikan di `fetch_news.py` fungsi `assess_priority()` sesuai kebutuhan CLT.

## Category Detection Logic

System scan title + body untuk keyword berikut (urutan priority):

1. **Crisis** — krisis, tarik, recall, tuntutan, gugat, skandal, kontroversi, investigasi, hoaks
2. **Regulatory** — bpom, kemenkes, izin edar, regulasi, fda, ema, approval, bpjs, jkn, formularium
3. **Product** — vaksin, obat, [nama produk AZ], uji klinis, fase 3, indikasi, terapi
4. **Competitor** — pfizer, roche, novartis, gsk, merck, msd, sanofi, bayer
5. **Corporate** — investasi, ekspansi, ceo, csr, kemitraan, mou, penghargaan
6. **Industry** — default fallback

Untuk akurasi production, gunakan flag `--use-claude` yang memakai Claude API.

## Sentiment Logic

Default: lexicon-based scoring di kamus POSITIVE_WORDS dan NEGATIVE_WORDS (Bahasa Indonesia).

Formula: `score = (positive_count - negative_count) / total_count`

Threshold label:
- `score ≥ 0.25` → **Positive**
- `score ≤ -0.25` → **Negative**
- Antara → **Neutral**

Untuk production yang lebih akurat, opsi:
1. `--use-claude` — pakai Claude API (paling akurat, ada biaya per call)
2. Replace dengan IndoBERT-sentiment dari HuggingFace (one-time setup, free)
3. Pakai Azure AI Language sentiment analysis (jika sudah ada Azure subscription)
