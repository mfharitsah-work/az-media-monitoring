"""Static configuration for news scraping and analysis."""

from __future__ import annotations

import os
import re


# Keyword tracks — CURATED SUBSET dari Media Monitoring Keyword spec (~44 keywords).
# Tiap keyword di-query terpisah ke Google News RSS; hasil di-dedupe by URL.
#
# Curation strategy:
# - Beberapa keyword spec di-append qualifier untuk narrow ke konteks pharma/health,
#   karena keyword sendirian terlalu broad dan menarik banyak noise:
#     "BPOM"              → "BPOM obat"                       (skip BPOM kosmetik/food/jamu)
#     "BPJS Kesehatan"    → "BPJS Kesehatan formularium"      (skip layanan klaim umum)
#     "Kementerian Kesehatan RI" → "Kementerian Kesehatan RI farmasi"
#     "Komisi IX DPR"     → "Komisi IX DPR kesehatan"         (handle non-health topics)
#     "Penyakit Langka"   → "Penyakit Langka AstraZeneca"     (narrow ke konteks AZ)
# - Beberapa keyword di-skip karena redundant via LM classification atau over-broad:
#   "Kemenperin farmasi", "LPPOM MUI vaksin halal", "pharma regulation Indonesia",
#   "innovative drug policy", "biologic regulation", "vaccine regulation",
#   "local content requirement pharmaceutical", "health technology assessment Indonesia",
#   "BPJS drug formulary", "e-catalogue obat Indonesia", "tender obat Indonesia",
#   "regulasi kesehatan Indonesia", "kebijakan kesehatan Indonesia",
#   "Undang-Undang Kesehatan Indonesia", "kebijakan Kementerian Kesehatan",
#   "kebijakan BPOM", "kebijakan JKN BPJS Kesehatan", "kebijakan distribusi obat"
#
# Quality control downstream:
#   1. Domain harus ada di SOURCE_WHITELIST (filter sebelum Groq → hemat quota)
#   2. Body length harus >= MIN_BODY_CHARS (filter article tanpa body lengkap)
#   3. LM final-klasifikasikan ke Subcategory (skip "Not Relevant")
# Per-category keyword lists — di-gabung jadi DEFAULT_KEYWORDS, tapi disimpan
# terpisah supaya bisa dipakai untuk targeted scrape (mis. cuma kategori baru).
KEYWORDS_AZ = [
    "AstraZeneca",
    "AstraZeneca Indonesia",
    "AZ Forest",
    "Young Health Programme",
    "Penyakit Langka AstraZeneca",
]

# Regulatory/Policy keywords — di-pecah per subcategory untuk dokumentasi +
# priority ordering. LM tetap classify final subcategory di runtime (keyword
# hanya hint, bukan binding hard). Urutan within Regulatory:
#   Stakeholder & Regulator > Pharma Policy > General Health Regulation
KEYWORDS_STAKEHOLDER = [
    # Existing — institusi
    "BPOM obat",
    "BPJS Kesehatan formularium",
    "Kementerian Kesehatan RI farmasi",
    "Komisi IX DPR kesehatan",
    # New — pejabat & jabatan
    "Menkes RI",
    "Wamenkes RI",
    "Budi Gunadi Sadikin",
    "Benjamin Paulus Octavianus",
]

KEYWORDS_PHARMA_POLICY = [
    # Existing
    "Formularium Nasional Fornas",
    "INA-CBGs",
    "TKDN farmasi",
    "e-katalog LKPP obat",
    "pharmaceutical policy Indonesia",
    "drug reimbursement Indonesia",
    "HTA Indonesia",
    "market access Indonesia pharmaceutical",
    "kebijakan harga obat",
    "regulasi uji klinis Indonesia",
    # New
    "Ekspor farmasi",
    "Harga obat",
    "Pengobatan inovatif",
    "Pengobatan presisi",
    "Akses obat inovatif",
]

KEYWORDS_GEN_HEALTH_REG = [
    # Existing
    "Peraturan Menteri Kesehatan",
    "regulasi farmasi Indonesia",
    "kebijakan obat Indonesia",
    "kebijakan vaksin Indonesia",
    "RUU kesehatan Indonesia",
    # New
    "Prabowo AND Kesehatan",
    "Kesehatan AI",
    "Peraturan Kesehatan",
    "CKG (Cek Kesehatan Gratis)",
    "WHO",
]

KEYWORDS_REGULATORY = [
    *KEYWORDS_STAKEHOLDER,
    *KEYWORDS_PHARMA_POLICY,
    *KEYWORDS_GEN_HEALTH_REG,
]

# Crisis & Disruption — AND-queries spesifik per Google News.
# Beberapa keyword broad (banjir, gempa) jadi pakai AND dengan konteks farmasi
# untuk narrow ke berita yang punya nuansa industri kita.
KEYWORDS_CRISIS = [
    "banjir AND distribusi obat",
    "banjir AND rantai pasok",
    "banjir AND farmasi",
    "gempa bumi AND rumah sakit",
    "gempa bumi AND kesehatan",
    "tsunami Indonesia",
    "erupsi gunung Indonesia",
    "cuaca ekstrem Indonesia",
    "hujan ekstrem Indonesia",
    "bencana alam AND kesehatan",
    "bencana nasional Indonesia",
    "status siaga bencana",
    "status tanggap darurat",
    "darurat nasional",
    "demonstrasi AND Kementerian Kesehatan",
    "demonstrasi AND istana presiden",
    "demonstrasi AND gedung DPR",
    "aksi buruh AND farmasi",
    "force majeure AND industri farmasi",
    "gangguan logistik AND obat",
    "obat AND evakuasi",
]

# Gabungan semua kategori. Override via --keywords kalau perlu targeted scrape.
# Industry/Competitor news scrape SUDAH DIHAPUS — count-only via
# fetch_competitor_counts.py. AZ → Regulatory → Crisis priority order.
DEFAULT_KEYWORDS = [
    *KEYWORDS_AZ,
    *KEYWORDS_REGULATORY,
    *KEYWORDS_CRISIS,
]
GOOGLE_NEWS_RSS = "https://news.google.com/rss/search?q={query}&hl=id&gl=ID&ceid=ID:id"
# Real browser UA — beberapa news Indonesia (Tribunnews, Detik) blokir UA non-browser dengan 403.
# Untuk media monitoring legit (bukan abuse), ini practice umum.
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
DEFAULT_OUTPUT = "astrazeneca_news.csv"

# Source whitelist — hanya artikel dari publikasi ini yang di-process.
# Match by URL domain (apex + subdomains). Update kalau perlu tambah outlet.
#
# Subscription-only sources yang sengaja SKIP (tidak ada akses kredensial):
#   - "kompas.id"           (Kompas Premium subscription)
#   - The Jakarta Post E-Post (subscription edition)
# Kalau di masa depan ada subscription/API key, tambah domain di sini + handle
# auth header di fetch_article_text (mungkin perlu cookie jar atau bearer token).
SOURCE_WHITELIST = {
    # --- General news / wire services ---
    "kompas.com",          # umum + health (versi free)
    "kompas.tv",
    "detik.com",           # covers detiknews + health.detik.com + news.detik.com
    "tribunnews.com",      # covers regional: jateng/jabar/sumsel/medan/makassar/manado/pontianak/kupang/ambon/papua/bangka.tribunnews.com
    "antaranews.com",
    "liputan6.com",
    "kumparan.com",
    "tempo.co",
    "merdeka.com",
    "republika.co.id",
    "okezone.com",
    "sindonews.com",
    "inews.id",
    "viva.co.id",
    "jpnn.com",
    "suara.com",
    "idntimes.com",
    "idnnews.id",
    "tirto.id",
    "jawapos.com",
    "pikiran-rakyat.com",
    "mediaindonesia.com",
    "metrotvnews.com",
    "beritasatu.com",
    "narasi.tv",
    "rri.co.id",
    "tvonenews.com",
    "thejakartapost.com",

    # --- Business / market / political-economy ---
    "kontan.co.id",
    "bisnis.com",
    "cnbcindonesia.com",
    "cnnindonesia.com",
    "katadata.co.id",
    "investor.id",
    "swa.co.id",
    "wartaekonomi.co.id",

    # --- Health, parenting & lifestyle (relevant untuk health regulation coverage) ---
    "hellosehat.com",
    "haibunda.com",
    "theasianparent.com",  # id.theasianparent.com — subdomain match
    "popmama.com",
    "orami.co.id",
    "femina.co.id",
    "popbela.com",
    "sehatq.com",
    "grid.id",             # covers nakita.grid.id + health.grid.id (GridHealth)
}

# Title patterns yang menandakan entry RSS rusak (image filename, dll.) — skip.
JUNK_TITLE_RE = re.compile(r"\.(jpg|jpeg|png|gif|webp|html|aspx)\b", re.IGNORECASE)

# Body length threshold before sending text to Groq. Below this, article body is
# usually too thin and the model tends to paraphrase only the headline.
MIN_BODY_CHARS = 500

# Groq config
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
# Default: openai/gpt-oss-120b — support Structured Outputs + lebih reliable di JSON grammar.
# Test menunjukkan llama-4-scout kadang generate extra brace `}}` → Groq strict reject.
# gpt-oss-120b lebih lambat (~1.3s vs 0.5s) tapi 100% pass rate di sample test.
# Catatan: llama-3.3-70b-versatile TIDAK support json_schema, jangan dipakai.
# Override via env: GROQ_MODEL=... — daftar model: https://console.groq.com/docs/structured-outputs#supported-models
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
GROQ_TIMEOUT = 30  # detik per call (Groq biasanya 1-3 detik)

POSITIVE_WORDS = {
    "berhasil", "sukses", "tumbuh", "meningkat", "naik", "untung", "positif",
    "manfaat", "inovasi", "kemitraan", "kerja sama", "kolaborasi", "investasi",
    "ekspansi", "luncurkan", "dukung", "bantu", "selamatkan", "sembuh",
    "tingkatkan", "perluas", "perbaikan", "raih", "penghargaan", "terdepan",
    "unggul", "efektif", "aman", "disetujui", "approve", "approved",
    "breakthrough", "terobosan", "harapan", "solusi"
}
NEGATIVE_WORDS = {
    "gagal", "turun", "rugi", "kritik", "tolak", "larang", "tarik", "recall",
    "bahaya", "efek samping", "kematian", "meninggal", "korban", "krisis",
    "tuntutan", "gugat", "skandal", "hoaks", "kontroversi", "masalah",
    "khawatir", "ragu", "tunda", "tidak aman", "ditarik", "dilarang",
    "dicabut", "merugikan", "berisiko", "ancaman", "buruk", "memburuk",
    "investigasi"
}

REGULATORY_KEYWORDS = [
    "bpom", "kemenkes", "kementerian kesehatan", "menkes", "izin edar",
    "regulasi", "fda", "ema", "approval", "registrasi", "kebijakan",
    "pemerintah", "bpjs", "jkn", "formularium", "regulator", "perpres",
    "peraturan menteri", "permenkes", "pp kesehatan", "uu kesehatan"
]

# Schema enforced via Groq Structured Outputs (JSON Schema mode).
# Struktur dijamin sama dengan Pydantic model di bawah — prompt hanya jelaskan SEMANTIK.
PRESERVE_TERMS = (
    "AstraZeneca, Vaxzevria, Imfinzi, Tagrisso, Forxiga, Soliris, "
    "BPOM, Kemenkes, Kementerian Kesehatan, Menkes, BPJS, JKN, "
    "Formularium Nasional, Fornas, INA-CBGs, TKDN, LKPP, MUI, "
    "Komisi IX, DPR, Permenkes, UU Kesehatan, RUU Kesehatan, "
    "AZ Forest, Young Health Programme"
)

SYSTEM_PROMPT = f"""Anda adalah analis media untuk AstraZeneca Indonesia. Tugas: analisis artikel + hasilkan output BAHASA INDONESIA dan ENGLISH sekaligus.

Output schema punya field SEPARATE untuk Indonesian (`summary_id`, `keywords_id`) dan English (`headline_en`, `summary_en`, `keywords_en`). Hasilkan SEMUA — content identik secara fakta, hanya bahasa yang beda.

=== PRESERVE EXACTLY di output English (jangan diterjemahkan) ===
{PRESERVE_TERMS}

Aturan translation:
- `headline_en`: terjemahan headline yang diberikan user. Bahasa Inggris jurnalistik natural, mirip panjang aslinya.
- `summary_en`: terjemahan dari `summary_id`. Fakta identik, bahasa English natural.
- `keywords_en`: terjemahan dari `keywords_id`. Comma-separated, max 5.
- `city` dan `province`: TIDAK diterjemahkan (nama tempat Indonesia).

=== Klasifikasi Subcategory (urutan prioritas dari atas) ===

=== Category: About AstraZeneca ===

1. "AZ Focus" — AstraZeneca atau produknya (Vaxzevria, Imfinzi, Tagrisso, Forxiga, dll) menjadi TOPIK UTAMA artikel.
   Contoh: "AstraZeneca raih izin edar obat X", "AZ Forest dorong reforestasi", "Kemitraan AZ dengan Kemenkes".

2. "AZ Mentioned" — AstraZeneca disebut sebagai data point/contoh untuk topik yang lebih general.
   Contoh: artikel industri farmasi yg menyebut AZ sebagai salah satu dari banyak perusahaan, riset penyakit langka yg sebut AZ sebagai donor.

=== Category: Regulatory/Policy ===

3. "Stakeholder & Regulator" — fokus ke AKTOR/INSTITUSI: BPOM, Kementerian Kesehatan, Menkes, BPJS Kesehatan, Komisi IX DPR, Kemenperin, LKPP, MUI Halal vaksin.
   Contoh: "BPOM perketat pengawasan obat", "Menkes umumkan program X", "Komisi IX DPR bahas RUU kesehatan".

4. "Pharma Policy" — kebijakan SPESIFIK industri farmasi: HTA, Formularium Nasional, e-katalog/tender obat, izin edar obat, INA-CBGs, TKDN farmasi, drug reimbursement, market access farmasi, biologic/vaccine regulation, uji klinis.
   Contoh: "Pemerintah revisi e-katalog obat", "HTA proses penilaian obat baru".

5. "General Health Regulation" — regulasi/kebijakan kesehatan UMUM (di luar farmasi spesifik): UU Kesehatan, RUU Kesehatan, Permenkes umum, kebijakan vaksin/JKN/distribusi obat, harga obat.
   Contoh: "Pemerintah terbitkan UU Kesehatan baru", "Kebijakan vaksinasi dewasa direvisi".

=== Category: Crisis & Disruption (standalone — tidak ada sub-level) ===

6. "Crisis & Disruption" — bencana alam, civil unrest, atau peristiwa yang berpotensi mengganggu operasi farmasi / rantai pasok obat / akses layanan kesehatan.
   Termasuk: banjir, gempa bumi, tsunami, erupsi gunung, cuaca ekstrem, hujan ekstrem, bencana nasional/alam; demonstrasi (istana presiden, Kementerian Kesehatan, gedung DPR), aksi buruh, status siaga/tanggap darurat, darurat nasional; gangguan logistik obat, force majeure industri farmasi, gangguan rantai pasok, evakuasi obat.
   Contoh: "Banjir di Jakarta ganggu distribusi obat", "Gempa Cianjur rumah sakit rusak", "Demonstrasi di gedung DPR farmasi terhambat".
   CATATAN: kalau peristiwa terjadi tapi TIDAK ada konteks farmasi/kesehatan/distribusi → "Not Relevant".

=== Skip ===

7. "Not Relevant" — TIDAK fit ke 5 di atas. Pilih ini kalau:
   - Artikel kesehatan umum tanpa konteks AZ/farmasi/regulasi
   - Artikel BPJS layanan klaim/keanggotaan umum (bukan obat/farmasi)
   - Artikel pejabat/politik tanpa relevansi farmasi/kesehatan
   - Artikel KOMPETITOR farmasi (Roche, Pfizer, Novartis, dll) — tracking competitor sudah dipisah ke count-only pipeline, tidak masuk DB news utama.
   PENTING: "Not Relevant" akan di-skip. Jangan paksa fit kalau memang tidak relevan.

Aturan sentiment dari sudut pandang AstraZeneca:
- "Positive": kemitraan baru, approval AZ, prestasi AZ, growth AZ, kebijakan yg menguntungkan AZ
- "Negative": kegagalan trial AZ, recall produk AZ, kontroversi AZ, kritik terhadap AZ, kebijakan yg menghambat AZ
- "Neutral": factual update tanpa positioning jelas. Default untuk Regulatory dan Not Relevant.

=== Aturan SUMMARY (PENTING — sering dilanggar) ===

Summary HARUS berasal dari BODY artikel, BUKAN dari HEADLINE.

ATURAN MUTLAK:
- JANGAN sekedar paraphrase atau perluas headline. Headline 1 kalimat singkat — summary harus
  membawa info SPESIFIK yang TIDAK ADA di headline (angka konkret, nama orang/instansi, alasan,
  konteks, dampak, kutipan).
- BUKAN bentuk: "Headline X. Hal ini terjadi karena Y." kalau Y tidak detail.
- BUKAN bentuk: "Artikel membahas tentang [headline rephrased]." — INI YANG SERING SALAH.
- BENTUK YANG BENAR: "[Aktor] [aksi spesifik] [angka/lokasi]. [Alasan/konteks]. [Dampak/respons]."

Contoh BAD: headline "BPOM Tarik 11 Kosmetik Berbahaya" → summary "BPOM melakukan penarikan
terhadap 11 produk kosmetik yang dianggap berbahaya."  ❌ ini cuma rewrite headline.

Contoh GOOD: summary "BPOM tarik 11 kosmetik yang mengandung merkuri dan hidrokuinon, ditemukan
di Jakarta dan Surabaya. Produk dikeluarkan tanpa izin edar resmi sejak 2024. Konsumen diminta
laporkan via aplikasi BPOM Mobile."  ✓ tambah merk bahan, lokasi, periode, channel respons.

Kalau body terlalu singkat / cuma paragraf pertama copy headline → return summary kosong (string "")
DI KEDUA FIELD (`summary_id` dan `summary_en`).
JANGAN paksa bikin summary fake — Pydantic schema mengizinkan empty string.

Panjang summary: 2-3 kalimat, maksimal 300 karakter (berlaku untuk Indonesian dan English).
Keywords: 5 kata kunci penting (entitas/topik specific), dipisah koma. Hasilkan di kedua field
(`keywords_id` Indonesian, `keywords_en` English).

Aturan city + province:
- Ekstrak kota & provinsi Indonesia yang menjadi FOKUS berita (lokasi event, kantor, pasien, pejabat berbicara, dll.).
- Gunakan nama resmi provinsi: "DKI Jakarta", "Jawa Barat", "Jawa Timur", "Banten", "Bali", "Sumatera Utara", dll.
- Untuk Jakarta, kota = "Jakarta" (tanpa keterangan utara/selatan kecuali eksplisit), province = "DKI Jakarta".
- Kalau berita nasional tanpa kota spesifik, atau berita global/luar negeri, isi kedua field dengan string kosong "".
- JANGAN tebak; lebih baik kosong daripada salah."""
