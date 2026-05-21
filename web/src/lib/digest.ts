import { BRAND } from "@/lib/brand";
import type { Article, ArticleCategory } from "@/lib/types";

/**
 * Builder email digest harian "AZ Daily Media Monitoring".
 *
 * Output HTML email-safe: SEMUA style inline, layout berbasis <table>,
 * tanpa CSS eksternal — supaya render konsisten di Outlook/Gmail/dll.
 * Dipakai oleh /api/digest, dikirim oleh flow Power Automate.
 */

const JKT = "Asia/Jakarta";

/** Section email = pemetaan dari category artikel. */
const SECTIONS: { category: ArticleCategory; title: string }[] = [
  { category: "About AstraZeneca", title: "AstraZeneca Indonesia" },
  { category: "Regulatory/Policy", title: "Regulation & Policy" },
];

export interface Digest {
  subject: string;
  html: string;
  articleCount: number;
}

// =============================================================================
// Helpers
// =============================================================================

/** Escape supaya headline/summary tidak merusak struktur HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Format tanggal "22 May 2026" di timezone Jakarta. */
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    timeZone: JKT,
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function todayJakarta(): string {
  return new Date().toLocaleDateString("en-GB", {
    timeZone: JKT,
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// =============================================================================
// HTML fragments
// =============================================================================

const FONT = "font-family:Arial,Helvetica,sans-serif;";

function renderArticle(a: Article): string {
  const labelCell =
    `padding:6px 10px;background:#f3e6ee;color:${BRAND.mulberry};` +
    `font-weight:bold;font-size:12px;width:80px;border:1px solid #e3d3dd;${FONT}`;
  const valueCell =
    `padding:6px 10px;background:#ffffff;color:#1a1a1a;font-size:13px;` +
    `border:1px solid #e3d3dd;${FONT}`;

  const summary = a.summary?.trim()
    ? esc(a.summary.trim())
    : "<em style='color:#888;'>No summary available.</em>";

  return `
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 6px;">
    <tr>
      <td style="${labelCell}">Headline</td>
      <td style="${valueCell}font-weight:bold;">${esc(a.headline)}</td>
    </tr>
    <tr>
      <td style="${labelCell}">Date</td>
      <td style="${valueCell}">${fmtDate(a.date)}</td>
    </tr>
    <tr>
      <td style="${labelCell}">Link</td>
      <td style="${valueCell}">
        <a href="${esc(a.url)}" style="color:${BRAND.navy};word-break:break-all;">${esc(a.url)}</a>
      </td>
    </tr>
  </table>
  <p style="margin:0 0 4px;font-size:12px;font-weight:bold;color:${BRAND.mulberry};${FONT}">[SUMMARY]</p>
  <p style="margin:0 0 20px;font-size:13px;line-height:1.55;color:#333333;${FONT}">${summary}</p>`;
}

function renderSection(title: string, articles: Article[]): string {
  const heading = `
    <h2 style="margin:24px 0 12px;padding:8px 12px;background:${BRAND.mulberry};
               color:#ffffff;font-size:14px;letter-spacing:0.5px;${FONT}">
      ${esc(title.toUpperCase())}
    </h2>`;

  if (articles.length === 0) {
    return (
      heading +
      `<p style="margin:0 0 16px;font-size:13px;color:#888888;${FONT}">No news in this category.</p>`
    );
  }
  return heading + articles.map(renderArticle).join("");
}

// =============================================================================
// Public
// =============================================================================

export function buildDigest(articles: Article[]): Digest {
  const dateLabel = todayJakarta();
  const subject = `AZ Daily Media Monitoring - ${dateLabel}`;

  const sectionsHtml = SECTIONS.map((s) =>
    renderSection(
      s.title,
      articles.filter((a) => a.category === s.category),
    ),
  ).join("");

  const emptyNote =
    articles.length === 0
      ? `<p style="margin:16px 0;font-size:13px;color:#888888;${FONT}">
           No news captured in the last 24 hours.
         </p>`
      : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#f4f4f5;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f4f4f5;">
    <tr>
      <td align="center" style="padding:20px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #e3d3dd;">
          <!-- Header -->
          <tr>
            <td style="background:${BRAND.mulberry};padding:20px 24px;">
              <div style="color:#ffffff;font-size:20px;font-weight:bold;${FONT}">
                AZ Daily Media Monitoring
              </div>
              <div style="color:#f0c8de;font-size:13px;margin-top:4px;${FONT}">
                ${esc(dateLabel)}
              </div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:8px 24px 24px;">
              <p style="margin:16px 0 0;font-size:12px;color:#888888;${FONT}">
                Media monitoring digest &mdash; ${articles.length} article${articles.length === 1 ? "" : "s"} in the last 24 hours.
              </p>
              ${emptyNote}
              ${sectionsHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f3e6ee;padding:14px 24px;">
              <p style="margin:0;font-size:11px;color:#999999;${FONT}">
                Automated digest from AZ Media Monitor. News sourced from Google News,
                AI analysis powered by Groq Cloud.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, articleCount: articles.length };
}
