# Email Digest Otomatis — Setup Power Automate

Mengirim digest harian "AZ Daily Media Monitoring" ke distribution list AZ,
dari mailbox `@astrazeneca.com`, lewat **Power Automate**.

## Cara kerja

```
GitHub Actions (08:00 WIB)        Vercel app                Power Automate (tenant AZ)
  scrape → load BQ → revalidate     /api/digest               Recurrence 08:30 WIB
                                    (HTML siap-kirim)    ───►   HTTP GET /api/digest
                                                                Send email (V2) → DL
```

- **Sistem** menyediakan endpoint `GET /api/digest` → balikan JSON
  `{ subject, html, articleCount }`. HTML sudah jadi (section per kategori,
  tabel Headline/Date/Link + summary).
- **Power Automate** (Anda buat di tenant AZ) menjadwalkan, memanggil endpoint,
  lalu mengirim email via connector Office 365 Outlook — email keluar dari
  mailbox M365 asli AZ, lolos SPF/DKIM/DMARC tanpa setup DNS.

## Prasyarat (sekali saja)

1. **Deploy** kode terbaru ke Vercel (lihat bagian bawah).
2. Set env var **`DIGEST_SECRET`** di Vercel dashboard (Production) — value
   sama dengan yang di `web/.env.local`.
3. Punya akses Power Automate di akun AZ Anda.

## Langkah 0 — Verifikasi connector HTTP

Connector **HTTP** itu *premium*. Cek dulu:
1. Buka https://make.powerautomate.com → **Create** → **Instant cloud flow**
2. Tambah action, cari **HTTP**.
3. Kalau muncul & bisa dipakai → lanjut Langkah 1.
4. Kalau diblokir (DLP / butuh lisensi premium) → lihat **Plan B** di bawah.

## Langkah 1 — Buat scheduled flow

1. https://make.powerautomate.com → **Create** → **Scheduled cloud flow**
2. Nama: `AZ Daily Media Monitoring Email`
3. **Repeat every**: 1 **Day**. Set jam mulai ~**08:30** (zona waktu Jakarta/
   SE Asia). Harus SETELAH pipeline scrape jam 08:00 WIB.
4. **Create**.

## Langkah 2 — Action: HTTP GET ke /api/digest

Tambah action **HTTP**:
- **Method**: `GET`
- **URI**: `https://<URL-VERCEL-ANDA>/api/digest`
- **Headers**:
  | Key | Value |
  |---|---|
  | `Authorization` | `Bearer <DIGEST_SECRET>` |

(`<DIGEST_SECRET>` = value dari `web/.env.local` / Vercel env var.)

## Langkah 3 — Action: Parse JSON

Tambah action **Parse JSON**:
- **Content**: `Body` (output dari step HTTP)
- **Schema**:
  ```json
  {
    "type": "object",
    "properties": {
      "subject": { "type": "string" },
      "html": { "type": "string" },
      "articleCount": { "type": "integer" }
    }
  }
  ```

## Langkah 4 — (Opsional) Condition: skip kalau kosong

Tambah **Condition**: `articleCount` **is greater than** `0`.
Taruh step kirim email di cabang **If yes**. (Kalau dilewati, email tetap
terkirim walau "no news" — tetap valid, cuma kurang berguna.)

## Langkah 5 — Action: Send an email (V2)

Tambah action **Send an email (V2)** (connector **Office 365 Outlook**):
- **To**: distribution list AZ (mis. `IDIAIndonesiaCLTSG-AstraZenecaSingaporePteLtd@astrazeneca.com`)
- **CC** (opsional): grup Corporate Affairs / individu
- **Subject**: pilih dynamic content `subject` (dari Parse JSON)
- **Body**: klik ikon **`</>`** (Code view) di toolbar body, lalu pilih dynamic
  content `html`. **Penting**: body harus mode HTML, bukan plain text.

Penerima dikelola di flow ini — ubah kapan saja tanpa redeploy aplikasi.

## Langkah 6 — Test

1. **Save** flow → klik **Test** → **Manually** → **Run flow**.
2. Cek tiap step hijau. Cek email masuk ke inbox.
3. Verifikasi: From = mailbox AZ Anda, layout render benar di Outlook.
4. Kalau OK, flow akan jalan otomatis tiap hari 08:30.

---

## Plan B — kalau HTTP connector diblokir

Kalau Langkah 0 gagal (connector HTTP tidak tersedia), kabari — kita pivot:
sistem akan menulis file digest HTML ke SharePoint/OneDrive, dan flow memakai
trigger **"When a file is created"** + connector SharePoint (standar, non-premium).
Perlu sedikit perubahan kode (menambah step upload di pipeline).

---

## Deploy kode (prasyarat)

```bash
# 1. Commit + push (Vercel auto-deploy)
cd c:/Users/knrl389/Documents/projects/media-monitoring
git add -A
git commit -m "Add /api/digest endpoint for Power Automate email digest"
git push origin main

# 2. Di Vercel dashboard → Settings → Environment Variables:
#    tambah DIGEST_SECRET (value dari web/.env.local), scope Production. Redeploy.

# 3. Verifikasi endpoint (ganti <secret> + <url>):
curl https://<URL-VERCEL>/api/digest -H "Authorization: Bearer <DIGEST_SECRET>"
#    → harus balikan JSON { subject, html, articleCount }
```
