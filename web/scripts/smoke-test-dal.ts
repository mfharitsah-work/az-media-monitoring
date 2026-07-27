/**
 * Smoke test BigQuery wiring without Next.js cache/runtime.
 *
 * Run from web/:
 *   npx dotenv -e ../.env -- tsx scripts/smoke-test-dal.ts
 */
import { bq, tbl } from "../src/lib/bigquery";

type CountRow = { n: number | string };
type ArticlePreviewRow = {
  id: string;
  headline: string;
  category: string | null;
  sentiment: string | null;
  source: string | null;
};
type CategoryRow = { category: string | null; n: number | string };
type StateRow = {
  name: string;
  last_success_at: { value?: string } | string;
  updated_at: { value?: string } | string;
};

function countValue(row: CountRow): number {
  return Number(row.n ?? 0);
}

function timestampValue(value: StateRow["last_success_at"]): string {
  return typeof value === "string" ? value : value?.value ?? "";
}

async function main() {
  console.log("=== articles_latest count ===");
  const [latestRows] = await bq().query({
    query: `SELECT COUNT(*) AS n FROM ${tbl("articles_latest")}`,
  });
  console.log(`  total: ${countValue(latestRows[0] as CountRow)}`);

  console.log("\n=== latest article preview ===");
  const [previewRows] = await bq().query({
    query: `
      SELECT id, headline, category, sentiment, source
      FROM ${tbl("articles_latest")}
      ORDER BY date DESC
      LIMIT 3
    `,
  });
  (previewRows as ArticlePreviewRow[]).forEach((a) => {
    console.log(
      `  [${a.id}] ${a.category ?? "-"} / ${a.sentiment ?? "-"} / ${a.source ?? "-"} - ${a.headline.slice(0, 80)}`,
    );
  });

  console.log("\n=== articles_last_24h count ===");
  const [last24Rows] = await bq().query({
    query: `SELECT COUNT(*) AS n FROM ${tbl("articles_last_24h")}`,
  });
  console.log(`  total: ${countValue(last24Rows[0] as CountRow)}`);

  console.log("\n=== category breakdown ===");
  const [categoryRows] = await bq().query({
    query: `
      SELECT category, COUNT(*) AS n
      FROM ${tbl("articles_latest")}
      WHERE category IS NOT NULL
      GROUP BY 1
      ORDER BY 2 DESC
    `,
  });
  (categoryRows as CategoryRow[]).forEach((c) => {
    console.log(`  ${(c.category ?? "-").padEnd(24)} ${countValue(c as CountRow)}`);
  });

  console.log("\n=== competitor latest count ===");
  const [competitorRows] = await bq().query({
    query: `SELECT COUNT(*) AS n FROM ${tbl("competitor_articles_latest")}`,
  });
  console.log(`  total: ${countValue(competitorRows[0] as CountRow)}`);

  console.log("\n=== pipeline_state ===");
  const [stateRows] = await bq().query({
    query: `
      SELECT name, last_success_at, updated_at
      FROM ${tbl("pipeline_state")}
      ORDER BY updated_at DESC
      LIMIT 5
    `,
  });
  (stateRows as StateRow[]).forEach((s) => {
    console.log(
      `  ${s.name}: last_success_at=${timestampValue(s.last_success_at)} updated_at=${timestampValue(s.updated_at)}`,
    );
  });

  console.log("\n[OK] BigQuery wiring works.");
}

main().catch((err) => {
  console.error("[FAIL]", err);
  process.exit(1);
});
