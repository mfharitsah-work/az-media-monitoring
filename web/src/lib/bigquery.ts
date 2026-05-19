import { BigQuery } from "@google-cloud/bigquery";

/**
 * BigQuery client singleton.
 *
 * Auth strategy:
 * - Local dev: GOOGLE_APPLICATION_CREDENTIALS env var → path ke SA JSON
 * - Vercel: GCP_SA_JSON env var → isi JSON string penuh (parsed below)
 *
 * Pattern singleton penting di Next.js karena dev mode hot-reload bisa
 * bikin koneksi baru tiap reload. Module-level cache mencegahnya.
 */

declare global {
  // eslint-disable-next-line no-var
  var __bqClient: BigQuery | undefined;
}

function createClient(): BigQuery {
  const projectId = process.env.GCP_PROJECT_ID;
  if (!projectId) {
    throw new Error("GCP_PROJECT_ID env var is required");
  }

  const location = process.env.BQ_LOCATION ?? "asia-southeast2";

  // Vercel/production: SA JSON sebagai string env var
  const saJsonString = process.env.GCP_SA_JSON;
  if (saJsonString) {
    return new BigQuery({
      projectId,
      location,
      credentials: JSON.parse(saJsonString),
    });
  }

  // Local dev: ADC via GOOGLE_APPLICATION_CREDENTIALS path
  return new BigQuery({ projectId, location });
}

export function bq(): BigQuery {
  if (!global.__bqClient) {
    global.__bqClient = createClient();
  }
  return global.__bqClient;
}

export function dataset(): string {
  return process.env.BQ_DATASET ?? "az_daily_news_collection";
}

/** Fully qualified table/view name untuk query: `project.dataset.tableId` */
export function tbl(name: string): string {
  const projectId = process.env.GCP_PROJECT_ID;
  return `\`${projectId}.${dataset()}.${name}\``;
}
