# Deployment Guide

End-to-end setup for AZ Media Monitoring:

1. GitHub repository stores the code.
2. Vercel deploys the Next.js app from `web/`.
3. GitHub Actions runs the scraper and loads data to BigQuery.
4. The workflow calls `/api/revalidate` so the deployed app drops cached data.

## Architecture

```text
GitHub Actions
  - compute dynamic scrape window
  - fetch_news.py
  - bq_load.py
  - update_pipeline_state.py
  - fetch_competitor_counts.py
  - bq_load_competitors.py
  - POST /api/revalidate
        |
        v
BigQuery dataset: az_daily_news_collection
        |
        v
Vercel / Next.js app
  - /
  - /news
  - /news/[id]
  - /analytics
  - /astrazeneca
  - /sentiment
```

## GitHub Repository

Create a private GitHub repository, then connect local `main` to the new origin:

```bash
git remote set-url origin https://github.com/<owner>/<repo>.git
git branch -M main
git push -u origin main
```

Before pushing, confirm secrets and runtime outputs are not staged:

```bash
git status --short
```

Do not commit `.env`, service account JSON files, `.venv`, `news.csv`, `news.json`, or `competitor_news.json`.

## Vercel

Import the GitHub repo into Vercel.

Required project setting:

| Setting | Value |
|---|---|
| Framework Preset | Next.js |
| Root Directory | `web` |
| Build Command | default |
| Output Directory | default |

Required Vercel environment variables:

| Key | Notes |
|---|---|
| `GCP_PROJECT_ID` | GCP project id |
| `BQ_DATASET` | Defaults to `az_daily_news_collection` if omitted |
| `BQ_LOCATION` | Defaults to `asia-southeast2` if omitted |
| `GCP_SA_JSON` | Full service account JSON content |
| `REVALIDATE_SECRET` | Must match the GitHub Actions secret |

After deployment, smoke check:

```text
https://<deployment>.vercel.app/
https://<deployment>.vercel.app/news
https://<deployment>.vercel.app/analytics
https://<deployment>.vercel.app/api/revalidate
```

`/api/revalidate` should return `401` without an Authorization header.

## GitHub Actions Secrets

Open GitHub repo -> Settings -> Secrets and variables -> Actions, then add:

| Secret | Notes |
|---|---|
| `GROQ_API_KEY` | Used by `fetch_news.py --use-groq` |
| `GCP_PROJECT_ID` | Same project used by Vercel |
| `GCP_SA_JSON` | Full service account JSON content |
| `VERCEL_URL` | Production URL, for example `https://az-media-monitoring.vercel.app` |
| `REVALIDATE_SECRET` | Same value as Vercel |

Important: `VERCEL_URL` must include `https://`. If it is only a hostname or malformed secret value, the cache invalidation curl step can fail with `Could not resolve host`.

## Workflow Schedule

Workflow file:

```text
.github/workflows/scrape.yml
```

Current cron:

```yaml
cron: "17 0,6,12,18 * * *"
```

Approximate WIB schedule:

| UTC | WIB |
|---|---|
| 00:17 | 07:17 |
| 06:17 | 13:17 |
| 12:17 | 19:17 |
| 18:17 | 01:17 next day |

GitHub scheduled workflows are not exact timers. Runs can be delayed or occasionally skipped, especially near busy times. The project handles this by computing a dynamic scrape window from `pipeline_state` instead of relying on a fixed 24-hour window.

## Manual Workflow Test

Open GitHub -> Actions -> Daily News Scrape & Load -> Run workflow.

Useful test inputs:

| Input | Suggested value |
|---|---|
| `hours` | `6` for quick test, `24` for normal backfill |
| `max_per_keyword` | `3` for quota-light test, `5` for normal run |

Expected successful steps:

```text
Checkout
Setup Python
Install dependencies
Authenticate to Google Cloud
Compute scrape window
Run scraper
Load to BigQuery
Update scrape state
Scrape competitor counts
Load competitor counts to BigQuery
Invalidate Vercel cache
Upload artifact
```

## BigQuery Setup

Run the schema once from the repository root:

```bash
bq query --use_legacy_sql=false < infrastructure/bq_schema.sql
```

Main objects:

| Object | Purpose |
|---|---|
| `articles` | Raw article table loaded idempotently |
| `articles_latest` | 1 latest row per article id |
| `articles_last_24h` | Legacy compatibility view |
| `competitor_articles` | Competitor count table |
| `competitor_articles_latest` | 1 latest row per company + URL |
| `pipeline_state` | Last successful scrape timestamp |

Loaders intentionally avoid BigQuery DML/MERGE so the project can run without billing enabled. They dedupe by building a replacement table and copying it over the target table.

## Local Validation

Python syntax:

```bash
python -m py_compile fetch_news.py fetch_competitor_counts.py bq_load.py bq_load_competitors.py compute_scrape_window.py update_pipeline_state.py
```

Frontend:

```bash
cd web
npm run lint
npx tsc --noEmit
npm run build
```

BigQuery smoke test:

```bash
cd web
npx dotenv -e ../.env -- tsx scripts/smoke-test-dal.ts
```

## Troubleshooting

### Vercel returns 404 for every URL

The Vercel Root Directory is usually wrong. Set it to `web`.

### Vercel runtime says `GCP_PROJECT_ID env var is required`

Set the environment variable in the Vercel project for Production. Redeploy after changing env vars.

### GitHub cache invalidation fails with `Could not resolve host`

Check `VERCEL_URL`. It must look like:

```text
https://az-media-monitoring.vercel.app
```

Do not store quoted strings with extra characters.

### Workflow does not run at the exact cron minute

This is normal GitHub Actions behavior. Use the dynamic scrape window and BigQuery dedupe as the source of correctness, not exact timer precision.

### BigQuery DML/MERGE fails because billing is disabled

This project does not require DML for normal loads. If a DML error appears, verify you are running the current `bq_load.py` and `bq_load_competitors.py`.
