# Deployment Guide

End-to-end setup: GitHub repo → Vercel deployment → daily auto-scrape via GitHub Actions.

## Architecture overview

```
   ┌─────────────────────────────────┐
   │  GitHub Actions (cron 06:00 WIB)│
   │  - run fetch_news.py            │      ┌───────────────┐
   │  - run bq_load.py               │ ───► │   BigQuery    │
   │  - POST /api/revalidate         │      │   (Jakarta)   │
   └─────────────────────────────────┘      └───────┬───────┘
                  │                                  │ queries
                  ▼ revalidate                       │
   ┌─────────────────────────────────┐               │
   │  Vercel (Next.js)               │ ◄─────────────┘
   │  - / /news /astrazeneca         │
   │  - /sentiment /analytics        │
   │  - /api/revalidate              │
   └─────────────────────────────────┘
```

## Prerequisites

- GitHub account
- Vercel account (sign up at https://vercel.com — free tier OK)
- GCP project + service account JSON (already set up — see `infrastructure/`)
- Groq API key (already in local `.env`)

---

## Step 1 — Push repo to GitHub

### 1a. Create GitHub repo

1. Open https://github.com/new
2. Repository name: `media-monitoring` (atau bebas)
3. **Private** (mengandung referensi project AZ — jangan public)
4. **JANGAN** centang "Initialize with README" (kita sudah punya commit lokal)
5. Klik **Create repository**

### 1b. Push local repo

GitHub akan menampilkan instruksi. Pakai yang **"push an existing repository"**:

```bash
cd c:/Users/knrl389/Documents/projects/media-monitoring
git remote add origin https://github.com/<your-username>/media-monitoring.git
git branch -M main
git push -u origin main
```

Sebelum push, **verifikasi tidak ada secret yang akan ke-commit**:

```bash
git status        # tidak boleh ada .env, *.json (SA key), .venv
git log --oneline # confirm 1 initial commit ada
```

---

## Step 2 — Deploy ke Vercel

### 2a. Import project

1. Login ke https://vercel.com
2. **Add New** → **Project**
3. Pilih repo `media-monitoring` (otorisasi GitHub kalau belum)
4. **Configure Project**:
   - **Framework Preset**: Next.js (auto-detect)
   - **Root Directory**: klik **Edit** → `web` (penting!)
   - **Build Command**, **Output Directory**: leave default

### 2b. Set Environment Variables (di Vercel dashboard)

Klik **Environment Variables**. Tambahkan 5 vars berikut. Semua → **All environments** (Production, Preview, Development):

| Key | Value source | Notes |
|---|---|---|
| `GCP_PROJECT_ID` | `.env` line `GCP_PROJECT_ID=` | Public-safe ID, OK untuk dilihat |
| `BQ_DATASET` | `.env` line `BQ_DATASET=` | Public-safe |
| `BQ_LOCATION` | `.env` line `BQ_LOCATION=` | Public-safe |
| `GCP_SA_JSON` | `infrastructure/az-media-monitoring-*.json` (paste seluruh isi file) | Secret — JSON full content `{...}` |
| `REVALIDATE_SECRET` | `web/.env.local` line `REVALIDATE_SECRET=` | Secret — copy paste value-nya |

**Cara dapatkan `GCP_SA_JSON`**: buka file `infrastructure/az-media-monitoring-dd3cf7eb59fc.json`, copy SEMUA isi (termasuk `{` dan `}`), paste ke Vercel value field.

### 2c. Deploy

Klik **Deploy**. Tunggu ~2 menit. Setelah selesai, Vercel kasih URL seperti `https://media-monitoring-xxxx.vercel.app`. **Catat URL ini** — dipakai di Step 3.

### 2d. Smoke test

Buka URL Vercel di browser. Pastikan:
- Landing page render dengan KPI cards
- /news/, /astrazeneca, /sentiment, /analytics semua HTTP 200
- /api/revalidate response 401 tanpa auth (security check)

---

## Step 3 — Setup GitHub Secrets untuk daily scrape

Daily scrape jalan di GitHub Actions runner. Butuh akses ke Groq + BigQuery + Vercel revalidate endpoint.

1. Buka repo di GitHub → **Settings** → **Secrets and variables** → **Actions**
2. Klik **New repository secret** untuk tiap secret berikut:

| Name | Value source | Notes |
|---|---|---|
| `GROQ_API_KEY` | `.env` line `GROQ_API_KEY=` (di-quote/un-quote OK) | Secret |
| `GCP_PROJECT_ID` | `.env` line `GCP_PROJECT_ID=` | Public-safe |
| `GCP_SA_JSON` | `infrastructure/az-media-monitoring-*.json` (paste full content) | Secret — JSON full |
| `REVALIDATE_SECRET` | `web/.env.local` line `REVALIDATE_SECRET=` (HARUS sama dengan Vercel) | Secret |
| `VERCEL_URL` | Vercel deployment URL dari Step 2c (mis. `https://xxx.vercel.app`) | Public-safe |

---

## Step 4 — Verify automation end-to-end

### 4a. Trigger workflow manually

1. GitHub → repo → **Actions** tab
2. Pilih workflow **"Daily News Scrape & Load"**
3. Klik **Run workflow** (kanan atas)
4. Opsional: ubah `hours` ke `48` untuk window lebih lebar
5. Klik **Run workflow** (green button)
6. Klik run yang baru muncul untuk lihat progress

Verifikasi tiap step succeed:
- ✅ Checkout
- ✅ Setup Python
- ✅ Install dependencies (~1-2 menit)
- ✅ Authenticate to Google Cloud
- ✅ Run scraper (~5-10 menit; Groq calls jadi bottleneck)
- ✅ Load to BigQuery
- ✅ Invalidate Vercel cache
- ✅ Upload artifact

### 4b. Confirm data sampai web

1. Buka Vercel URL → / atau /news
2. Cek KPI cards menampilkan angka baru (incl. delta "+N today")
3. Card terbaru harus ada di top list

### 4c. Confirm cron schedule

Workflow akan auto-trigger jam 23:00 UTC harian = **06:00 WIB**. Cek tab Actions besok pagi untuk konfirmasi run automatic muncul tanpa intervensi.

---

## Troubleshooting

### Workflow gagal di "Authenticate to Google Cloud"
- Pastikan `GCP_SA_JSON` di GitHub Secrets adalah JSON full (mulai `{` sampai `}`), bukan path file.
- Pastikan SA punya role **BigQuery Data Editor** + **BigQuery Job User** (sudah di-grant saat setup awal).

### Workflow sukses tapi data tidak update di web
- Cek apakah step **"Invalidate Vercel cache"** menampilkan response 200. Kalau 401, secret `REVALIDATE_SECRET` di GitHub ≠ Vercel.
- Workaround sementara: tunggu cache TTL 24 jam expired, atau manual hit `/api/revalidate` dengan correct auth.

### Vercel build error: "Cannot find module '@google-cloud/bigquery'"
- Root Directory di Vercel salah. Set ke `web`.

### Vercel runtime error: "GCP_PROJECT_ID env var is required"
- Env var di Vercel belum di-set, atau di-set tapi untuk environment yang salah. Pastikan tick **Production + Preview + Development**.

### Daily cron tidak jalan
- GitHub Actions free tier limit: 2000 menit/bulan. Daily scrape ~10 menit × 30 = 300 menit/bulan. Aman.
- Cron di GitHub kadang delay 5-15 menit. Bukan exact 06:00 WIB.
- Repo yang inactive 60 hari (tidak ada commit) bikin GitHub disable scheduled workflow. Solusi: minimal 1 commit per 2 bulan.

---

## Cost estimate (rough)

| Component | Free tier | Estimated usage | Notes |
|---|---|---|---|
| GitHub Actions | 2000 min/month | ~300 min/month | Daily 10-min run |
| Vercel | 100GB bandwidth, 100K function invocations | < 1% utilization | Internal dashboard |
| BigQuery | 10GB storage + 1TB query/month | < 1MB storage + < 100MB query | Tiny dataset |
| Groq | 200K tokens/day | ~20-30K tokens/day | Daily 48h window |

Total expected monthly cost: **$0**.
