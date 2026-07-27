# AZ Media Monitoring Web

Next.js app for the media monitoring dashboard.

## Local Setup

Install dependencies from `web/`:

```bash
npm install
```

Create environment variables locally. The app reads BigQuery directly from server components.

Required variables:

| Key | Notes |
|---|---|
| `GCP_PROJECT_ID` | Required |
| `BQ_DATASET` | Defaults to `az_daily_news_collection` |
| `BQ_LOCATION` | Defaults to `asia-southeast2` |
| `GCP_SA_JSON` | Required on Vercel; optional locally if using ADC |
| `GOOGLE_APPLICATION_CREDENTIALS` | Optional local path to service account JSON |
| `REVALIDATE_SECRET` | Required for `/api/revalidate` |

Run locally:

```bash
npm run dev
```

## Validation

```bash
npm run lint
npx tsc --noEmit
npm run build
```

BigQuery smoke test:

```bash
npx dotenv -e ../.env -- tsx scripts/smoke-test-dal.ts
```

## Important Files

| File | Purpose |
|---|---|
| `src/app/page.tsx` | Home dashboard |
| `src/app/news/page.tsx` | All news page |
| `src/app/news/[id]/page.tsx` | Article detail page |
| `src/app/analytics/page.tsx` | Analytics dashboard |
| `src/components/email-digest-launcher.tsx` | Daily digest compose UI |
| `src/lib/repositories/bigquery-article-repository.ts` | BigQuery data access |
| `src/lib/types.ts` | Frontend domain types |
| `src/app/api/revalidate/route.ts` | Cache invalidation endpoint |

## Deployment

Vercel must use `web` as Root Directory.

See the root-level `DEPLOY.md` for full production setup.
