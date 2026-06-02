import { NextResponse, type NextRequest } from "next/server";

/**
 * On-demand translation endpoint untuk news detail page.
 *
 * Pipeline (Python `translate_articles.py`) menyimpan SEMUA artikel dalam
 * English ke BigQuery. Endpoint ini memungkinkan UI menampilkan versi
 * Bahasa Indonesia jika user mau (button "Translate to Indonesian").
 *
 * Body (JSON):
 *   { headline: string, summary: string, keywords: string, target?: 'id' | 'en' }
 *
 * Response (JSON):
 *   { headline: string, summary: string, keywords: string }
 *
 * Auth: tidak ada. Endpoint hanya menerjemahkan teks yang dikirim client —
 * tidak mengakses DB atau secret lain. Risk surface: Groq token quota.
 */

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";

const PRESERVE_TERMS =
  "AstraZeneca, Vaxzevria, Imfinzi, Tagrisso, Forxiga, Soliris, " +
  "BPOM, Kemenkes, Kementerian Kesehatan, Menkes, BPJS, JKN, " +
  "Formularium Nasional, Fornas, INA-CBGs, TKDN, LKPP, MUI, " +
  "Komisi IX, DPR, Permenkes, UU Kesehatan, RUU Kesehatan, " +
  "AZ Forest, Young Health Programme";

const TRANSLATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "summary", "keywords"],
  properties: {
    headline: { type: "string" },
    summary: { type: "string", maxLength: 600 },
    keywords: { type: "string" },
  },
} as const;

interface TranslateBody {
  headline?: unknown;
  summary?: unknown;
  keywords?: unknown;
  target?: unknown;
}

interface TranslationOut {
  headline: string;
  summary: string;
  keywords: string;
}

function systemPrompt(target: "id" | "en"): string {
  if (target === "id") {
    return `Anda penerjemah profesional English → Indonesian untuk AstraZeneca Indonesia.

Terjemahkan headline, summary, dan keywords dari English ke Bahasa Indonesia
yang natural dan jurnalistik (gaya media nasional seperti Kompas/Tempo).

PERTAHANKAN apa adanya (jangan diterjemahkan):
${PRESERVE_TERMS}

Aturan:
- Jaga makna, nada, dan fakta. Jangan tambah/kurangi informasi.
- Headline: ringkas, mirip panjang aslinya.
- Summary: 2-3 kalimat, maksimal 300 karakter.
- Keywords: terjemahkan tiap keyword, comma-separated, max 5.
- Field kosong → return "".`;
  }
  return `You are a professional Indonesian → English translator for AstraZeneca
Indonesia media monitoring.

Translate the headline, summary, and keywords to natural journalistic English.

PRESERVE EXACTLY (do not translate):
${PRESERVE_TERMS}

Rules:
- Keep meaning, tone, and facts. Do not add or remove information.
- Headline: concise, similar length to original.
- Summary: 2-3 sentences, max 300 characters.
- Keywords: translate each, comma-separated, max 5.
- Empty field → return "".`;
}

async function callGroq(
  apiKey: string,
  target: "id" | "en",
  headline: string,
  summary: string,
  keywords: string,
): Promise<TranslationOut | null> {
  const userPrompt =
    `Translate the following AZ media monitoring entry to ${target === "id" ? "Indonesian" : "English"}.\n\n` +
    `HEADLINE: ${headline}\n\n` +
    `SUMMARY: ${summary || "(empty)"}\n\n` +
    `KEYWORDS: ${keywords || "(empty)"}`;

  const payload = {
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: systemPrompt(target) },
      { role: "user", content: userPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "TranslationOut",
        schema: TRANSLATION_SCHEMA,
        strict: true,
      },
    },
    temperature: 0.2,
    max_tokens: 1500,
  };

  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[translate] Groq ${res.status}: ${errBody.slice(0, 500)}`);
    return null;
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;

  try {
    const parsed = JSON.parse(content) as TranslationOut;
    if (
      typeof parsed.headline !== "string" ||
      typeof parsed.summary !== "string" ||
      typeof parsed.keywords !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GROQ_API_KEY not configured" },
      { status: 500 },
    );
  }

  let body: TranslateBody;
  try {
    body = (await req.json()) as TranslateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const headline = typeof body.headline === "string" ? body.headline : "";
  const summary = typeof body.summary === "string" ? body.summary : "";
  const keywords = typeof body.keywords === "string" ? body.keywords : "";
  const target: "id" | "en" = body.target === "en" ? "en" : "id";

  if (!headline.trim()) {
    return NextResponse.json({ error: "headline is required" }, { status: 400 });
  }

  const out = await callGroq(apiKey, target, headline, summary, keywords);
  if (!out) {
    return NextResponse.json({ error: "Translation failed" }, { status: 502 });
  }

  return NextResponse.json(out);
}
