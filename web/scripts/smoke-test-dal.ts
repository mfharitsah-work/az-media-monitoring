/**
 * Smoke test BigQuery wiring — pakai bq() langsung tanpa unstable_cache
 * (yang perlu Next.js runtime). Pages-nya akan pakai DAL ber-cache.
 */
import { bq, tbl } from "../src/lib/bigquery";

async function main() {
  console.log("=== articles_latest count ===");
  const [r1] = await bq().query({
    query: `SELECT COUNT(*) AS n FROM ${tbl("articles_latest")}`,
  });
  console.log(`  total: ${r1[0].n}`);

  console.log("\n=== articles_today (limit 3) ===");
  const [r2] = await bq().query({
    query: `SELECT id, headline, category, sentiment, city FROM ${tbl("articles_today")} LIMIT 3`,
  });
  r2.forEach((a: { id: string; headline: string; category: string; sentiment: string; city: string }) => {
    console.log(`  [${a.id}] ${a.category}/${a.sentiment} ${a.city ? `@${a.city}` : ""} — ${a.headline.slice(0, 60)}`);
  });

  console.log("\n=== categoryBreakdown ===");
  const [r3] = await bq().query({
    query: `SELECT category, COUNT(*) AS n FROM ${tbl("articles_latest")} WHERE category IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`,
  });
  r3.forEach((c: { category: string; n: number }) => console.log(`  ${c.category.padEnd(12)} ${c.n}`));

  console.log("\n=== sentimentTrend (last 7d) ===");
  const [r4] = await bq().query({
    query: `
      SELECT
        FORMAT_DATE('%Y-%m-%d', DATE(date, "Asia/Jakarta")) AS d,
        COUNTIF(sentiment = 'Positive') AS pos,
        COUNTIF(sentiment = 'Neutral')  AS neu,
        COUNTIF(sentiment = 'Negative') AS neg
      FROM ${tbl("articles_latest")}
      WHERE DATE(date, "Asia/Jakarta") >= DATE_SUB(CURRENT_DATE("Asia/Jakarta"), INTERVAL 7 DAY)
      GROUP BY d ORDER BY d
    `,
  });
  r4.forEach((t: { d: string; pos: number; neu: number; neg: number }) =>
    console.log(`  ${t.d}  pos:${t.pos} neu:${t.neu} neg:${t.neg}`),
  );

  console.log("\n[OK] BigQuery wiring works.");
}

main().catch((err) => {
  console.error("[FAIL]", err);
  process.exit(1);
});
