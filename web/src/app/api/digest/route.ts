import { NextResponse, type NextRequest } from "next/server";

import { buildDigest } from "@/lib/digest";
import { articleRepo } from "@/lib/repositories";

/**
 * Daily digest endpoint — dipanggil oleh flow Power Automate (HTTP GET) tiap
 * pagi setelah pipeline scrape selesai. Return digest 24h sebagai HTML
 * siap-kirim + subject; flow tinggal teruskan ke "Send an email (V2)".
 *
 * Auth: Bearer token (DIGEST_SECRET) — mirror pola /api/revalidate.
 *
 * Usage:
 *   curl https://<app>/api/digest -H "Authorization: Bearer <DIGEST_SECRET>"
 */
export async function GET(req: NextRequest) {
  const secret = process.env.DIGEST_SECRET;
  if (!secret) {
    // Misconfig — tolak operasi supaya prod tidak menerima caller sembarangan.
    return NextResponse.json(
      { error: "DIGEST_SECRET not configured" },
      { status: 500 },
    );
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Limit besar — ambil semua artikel 24h (biasanya puluhan, tidak akan kena).
  const articles = await articleRepo.findLast24h(500);
  const digest = buildDigest(articles);

  return NextResponse.json({
    subject: digest.subject,
    html: digest.html,
    articleCount: digest.articleCount,
    generatedAt: new Date().toISOString(),
  });
}
