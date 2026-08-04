import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { bq, dataset as datasetName } from "@/lib/bigquery";
import { PASSWORD_ALGO } from "./password";
import type { AuthUser, PrivilegedRole, SessionUser } from "./types";

type BQValue = string | boolean | number | { value: string } | null | undefined;

const DEFAULT_LOCATION = "asia-southeast2";

const AUTH_USER_FIELDS = [
  { name: "id", type: "STRING", mode: "REQUIRED" },
  { name: "email", type: "STRING", mode: "REQUIRED" },
  { name: "name", type: "STRING", mode: "REQUIRED" },
  { name: "job_title", type: "STRING" },
  { name: "role", type: "STRING", mode: "REQUIRED" },
  { name: "password_hash", type: "STRING", mode: "REQUIRED" },
  { name: "password_algo", type: "STRING", mode: "REQUIRED" },
  { name: "is_active", type: "BOOL", mode: "REQUIRED" },
  { name: "created_at", type: "TIMESTAMP", mode: "REQUIRED" },
  { name: "updated_at", type: "TIMESTAMP", mode: "REQUIRED" },
  { name: "last_login_at", type: "TIMESTAMP" },
  { name: "created_by", type: "STRING" },
  { name: "updated_by", type: "STRING" },
  { name: "version_id", type: "STRING", mode: "REQUIRED" },
  { name: "action", type: "STRING", mode: "REQUIRED" },
] as const;

const AUDIT_LOG_FIELDS = [
  { name: "id", type: "STRING", mode: "REQUIRED" },
  { name: "actor_email", type: "STRING" },
  { name: "actor_role", type: "STRING" },
  { name: "action", type: "STRING", mode: "REQUIRED" },
  { name: "target_email", type: "STRING" },
  { name: "details_json", type: "STRING" },
  { name: "created_at", type: "TIMESTAMP", mode: "REQUIRED" },
] as const;

const COMPOSE_LOG_FIELDS = [
  { name: "id", type: "STRING", mode: "REQUIRED" },
  { name: "composed_at", type: "TIMESTAMP", mode: "REQUIRED" },
  { name: "user_email", type: "STRING", mode: "REQUIRED" },
  { name: "user_name", type: "STRING" },
  { name: "user_role", type: "STRING", mode: "REQUIRED" },
  { name: "sender_email", type: "STRING" },
  { name: "sender_name", type: "STRING" },
  { name: "sender_job_title", type: "STRING" },
  { name: "to_recipients", type: "STRING" },
  { name: "cc_recipients", type: "STRING" },
  { name: "subject", type: "STRING" },
  { name: "date_ranges_json", type: "STRING" },
  { name: "article_count", type: "INT64" },
  { name: "article_ids_json", type: "STRING" },
] as const;

export interface ComposeDigestLog {
  id: string;
  composedAt: string;
  userEmail: string;
  userName: string | null;
  userRole: string;
  senderEmail: string | null;
  senderName: string | null;
  senderJobTitle: string | null;
  toRecipients: string | null;
  ccRecipients: string | null;
  subject: string | null;
  dateRangesJson: string | null;
  articleCount: number;
  articleIdsJson: string | null;
}

export interface AuthAuditLog {
  id: string;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  targetEmail: string | null;
  detailsJson: string | null;
  createdAt: string;
}

export interface SaveComposeDigestLogInput {
  user: SessionUser;
  senderEmail: string;
  senderName: string;
  senderJobTitle: string;
  toRecipients: string;
  ccRecipients: string;
  subject: string;
  dateRanges: string[];
  articleCount: number;
  articleIds: string[];
}

function projectId(): string {
  const value = process.env.GCP_PROJECT_ID;
  if (!value) throw new Error("GCP_PROJECT_ID env var is required");
  return value;
}

function location(): string {
  return process.env.BQ_LOCATION ?? DEFAULT_LOCATION;
}

function fq(table: string): string {
  return `${projectId()}.${datasetName()}.${table}`;
}

function normString(value: BQValue): string | null {
  if (value == null) return null;
  if (typeof value === "object" && "value" in value) return value.value;
  return String(value);
}

function normBool(value: BQValue): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "object" && value?.value) return value.value === "true";
  return value === "true";
}

function normNumber(value: BQValue): number {
  if (typeof value === "number") return value;
  if (typeof value === "object" && value?.value) return Number(value.value);
  return Number(value ?? 0);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function ensureTable(
  tableName: string,
  fields: readonly Record<string, string>[],
  options: Record<string, unknown> = {},
) {
  const dataset = bq().dataset(datasetName());
  const table = dataset.table(tableName);
  const [exists] = await table.exists();
  if (!exists) {
    await dataset.createTable(tableName, {
      schema: { fields: [...fields] },
      ...options,
    });
  }
}

async function appendRows(
  tableName: string,
  fields: readonly Record<string, string>[],
  rows: Record<string, unknown>[],
) {
  if (rows.length === 0) return;
  await ensureAuthSchema();

  const filePath = join(tmpdir(), `az-auth-${tableName}-${randomUUID()}.ndjson`);
  await writeFile(
    filePath,
    rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
    "utf8",
  );

  try {
    await bq().dataset(datasetName()).table(tableName).load(filePath, {
      sourceFormat: "NEWLINE_DELIMITED_JSON",
      schema: { fields: [...fields] },
      writeDisposition: "WRITE_APPEND",
      ignoreUnknownValues: true,
      location: location(),
    } as never);
  } finally {
    await unlink(filePath).catch(() => undefined);
  }
}

let ensurePromise: Promise<void> | null = null;

export function ensureAuthSchema(): Promise<void> {
  ensurePromise ??= ensureAuthSchemaInner();
  return ensurePromise;
}

async function ensureAuthSchemaInner() {
  await ensureTable("auth_users", AUTH_USER_FIELDS, {
    timePartitioning: { type: "DAY", field: "updated_at" },
    clustering: { fields: ["email", "role"] },
  });
  await ensureTable("auth_audit_logs", AUDIT_LOG_FIELDS, {
    timePartitioning: { type: "DAY", field: "created_at" },
    clustering: { fields: ["actor_email", "action"] },
  });
  await ensureTable("compose_digest_logs", COMPOSE_LOG_FIELDS, {
    timePartitioning: { type: "DAY", field: "composed_at" },
    clustering: { fields: ["user_email", "user_role"] },
  });

  await bq().query({
    query: `
CREATE OR REPLACE VIEW \`${fq("auth_users_latest")}\` AS
SELECT * EXCEPT(rn)
FROM (
  SELECT
    *,
    ROW_NUMBER() OVER (PARTITION BY email ORDER BY updated_at DESC, version_id DESC) AS rn
  FROM \`${fq("auth_users")}\`
)
WHERE rn = 1
`,
    location: location(),
  });
}

function rowToAuthUser(row: Record<string, BQValue>): AuthUser {
  return {
    id: normString(row.id) ?? "",
    email: normString(row.email) ?? "",
    name: normString(row.name) ?? "",
    jobTitle: normString(row.job_title) ?? "",
    role: (normString(row.role) ?? "admin") as PrivilegedRole,
    passwordHash: normString(row.password_hash) ?? "",
    passwordAlgo: normString(row.password_algo) ?? PASSWORD_ALGO,
    isActive: normBool(row.is_active),
    createdAt: normString(row.created_at) ?? "",
    updatedAt: normString(row.updated_at) ?? "",
    lastLoginAt: normString(row.last_login_at),
    createdBy: normString(row.created_by),
    updatedBy: normString(row.updated_by),
    versionId: normString(row.version_id) ?? "",
    action: normString(row.action) ?? "",
  };
}

function rowToComposeLog(row: Record<string, BQValue>): ComposeDigestLog {
  return {
    id: normString(row.id) ?? "",
    composedAt: normString(row.composed_at) ?? "",
    userEmail: normString(row.user_email) ?? "",
    userName: normString(row.user_name),
    userRole: normString(row.user_role) ?? "",
    senderEmail: normString(row.sender_email),
    senderName: normString(row.sender_name),
    senderJobTitle: normString(row.sender_job_title),
    toRecipients: normString(row.to_recipients),
    ccRecipients: normString(row.cc_recipients),
    subject: normString(row.subject),
    dateRangesJson: normString(row.date_ranges_json),
    articleCount: normNumber(row.article_count),
    articleIdsJson: normString(row.article_ids_json),
  };
}

function rowToAuditLog(row: Record<string, BQValue>): AuthAuditLog {
  return {
    id: normString(row.id) ?? "",
    actorEmail: normString(row.actor_email),
    actorRole: normString(row.actor_role),
    action: normString(row.action) ?? "",
    targetEmail: normString(row.target_email),
    detailsJson: normString(row.details_json),
    createdAt: normString(row.created_at) ?? "",
  };
}

export async function listAuthUsers(): Promise<AuthUser[]> {
  await ensureAuthSchema();
  const [rows] = await bq().query({
    query: `
SELECT *
FROM \`${fq("auth_users_latest")}\`
ORDER BY role DESC, email ASC
`,
    location: location(),
  });
  return (rows as Record<string, BQValue>[]).map(rowToAuthUser);
}

export async function findAuthUserByEmail(email: string): Promise<AuthUser | null> {
  await ensureAuthSchema();
  const [rows] = await bq().query({
    query: `
SELECT *
FROM \`${fq("auth_users_latest")}\`
WHERE email = @email
LIMIT 1
`,
    params: { email: normalizeEmail(email) },
    location: location(),
  });
  const first = (rows as Record<string, BQValue>[])[0];
  return first ? rowToAuthUser(first) : null;
}

export async function appendAuthUserVersion(
  user: Omit<AuthUser, "versionId" | "updatedAt" | "action" | "passwordAlgo"> & {
    passwordAlgo?: string;
    updatedAt?: string;
    action: string;
  },
) {
  const now = user.updatedAt ?? new Date().toISOString();
  await appendRows("auth_users", AUTH_USER_FIELDS, [{
    id: user.id,
    email: normalizeEmail(user.email),
    name: user.name,
    job_title: user.jobTitle,
    role: user.role,
    password_hash: user.passwordHash,
    password_algo: user.passwordAlgo ?? PASSWORD_ALGO,
    is_active: user.isActive,
    created_at: user.createdAt,
    updated_at: now,
    last_login_at: user.lastLoginAt,
    created_by: user.createdBy,
    updated_by: user.updatedBy,
    version_id: randomUUID(),
    action: user.action,
  }]);
}

export async function logAuthAudit(input: {
  actor?: SessionUser | null;
  action: string;
  targetEmail?: string | null;
  details?: unknown;
}) {
  await appendRows("auth_audit_logs", AUDIT_LOG_FIELDS, [{
    id: randomUUID(),
    actor_email: input.actor?.email || null,
    actor_role: input.actor?.role || null,
    action: input.action,
    target_email: input.targetEmail ? normalizeEmail(input.targetEmail) : null,
    details_json: input.details == null ? null : JSON.stringify(input.details),
    created_at: new Date().toISOString(),
  }]);
}

export async function listAuthAuditLogs(limit = 50): Promise<AuthAuditLog[]> {
  await ensureAuthSchema();
  const [rows] = await bq().query({
    query: `
SELECT *
FROM \`${fq("auth_audit_logs")}\`
ORDER BY created_at DESC
LIMIT @limit
`,
    params: { limit },
    location: location(),
  });
  return (rows as Record<string, BQValue>[]).map(rowToAuditLog);
}

export async function saveComposeDigestLog(input: SaveComposeDigestLogInput) {
  await appendRows("compose_digest_logs", COMPOSE_LOG_FIELDS, [{
    id: randomUUID(),
    composed_at: new Date().toISOString(),
    user_email: input.user.email,
    user_name: input.user.name,
    user_role: input.user.role,
    sender_email: input.senderEmail,
    sender_name: input.senderName,
    sender_job_title: input.senderJobTitle,
    to_recipients: input.toRecipients,
    cc_recipients: input.ccRecipients,
    subject: input.subject,
    date_ranges_json: JSON.stringify(input.dateRanges),
    article_count: input.articleCount,
    article_ids_json: JSON.stringify(input.articleIds),
  }]);
}

export async function listComposeDigestLogs(limit = 100): Promise<ComposeDigestLog[]> {
  await ensureAuthSchema();
  const [rows] = await bq().query({
    query: `
SELECT *
FROM \`${fq("compose_digest_logs")}\`
ORDER BY composed_at DESC
LIMIT @limit
`,
    params: { limit },
    location: location(),
  });
  return (rows as Record<string, BQValue>[]).map(rowToComposeLog);
}
