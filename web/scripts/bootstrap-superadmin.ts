/**
 * Create or reset the first superadmin account in BigQuery.
 *
 * Run from web/:
 *   npx dotenv -e ../.env -- tsx scripts/bootstrap-superadmin.ts \
 *     --email you@astrazeneca.com \
 *     --name "Your Name" \
 *     --job-title "Communications Lead" \
 *     --password "temporary-password"
 */
import { randomBytes, randomUUID } from "node:crypto";

import {
  appendAuthUserVersion,
  ensureAuthSchema,
  findAuthUserByEmail,
  logAuthAudit,
} from "../src/lib/auth/bigquery-auth-repository";
import { hashPassword } from "../src/lib/auth/password";

interface Args {
  email?: string;
  name?: string;
  jobTitle?: string;
  password?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key.startsWith("--")) continue;
    if (!value || value.startsWith("--")) continue;
    i++;
    if (key === "--email") args.email = value;
    else if (key === "--name") args.name = value;
    else if (key === "--job-title") args.jobTitle = value;
    else if (key === "--password") args.password = value;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = args.email?.trim().toLowerCase();
  const name = args.name?.trim();
  const jobTitle = args.jobTitle?.trim() ?? "";
  const password = args.password ?? randomBytes(18).toString("base64url");

  if (!email || !name) {
    console.error("[FAIL] --email and --name are required.");
    process.exit(1);
  }

  await ensureAuthSchema();
  const existing = await findAuthUserByEmail(email);
  const now = new Date().toISOString();

  await appendAuthUserVersion({
    id: existing?.id ?? randomUUID(),
    email,
    name,
    jobTitle,
    role: "superadmin",
    passwordHash: hashPassword(password),
    isActive: true,
    createdAt: existing?.createdAt ?? now,
    lastLoginAt: existing?.lastLoginAt ?? null,
    createdBy: existing?.createdBy ?? "bootstrap",
    updatedBy: "bootstrap",
    action: existing ? "bootstrap_reset_superadmin" : "bootstrap_create_superadmin",
  });
  await logAuthAudit({
    action: existing ? "bootstrap_reset_superadmin" : "bootstrap_create_superadmin",
    targetEmail: email,
    details: { name, jobTitle },
  }).catch(() => undefined);

  console.log(`[OK] Superadmin ${existing ? "updated" : "created"}: ${email}`);
  if (!args.password) {
    console.log(`[TEMP PASSWORD] ${password}`);
    console.log("Store this password securely. It is shown only once.");
  }
}

main().catch((error) => {
  console.error("[FAIL]", error);
  process.exit(1);
});
