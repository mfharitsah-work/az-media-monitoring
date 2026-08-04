import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, ShieldCheck, UserPlus } from "lucide-react";

import {
  listAuthAuditLogs,
  listAuthUsers,
  listComposeDigestLogs,
  type AuthAuditLog,
  type ComposeDigestLog,
} from "@/lib/auth/bigquery-auth-repository";
import { currentUser } from "@/lib/auth/session";
import { isSuperadmin, type AuthUser } from "@/lib/auth/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = {
  title: "Manage",
  description: "Superadmin management for Media Monitoring.",
};

export const revalidate = 0;

export default async function ManagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [sp, user] = await Promise.all([searchParams, currentUser()]);
  if (user.role === "guest") redirect("/login?redirectTo=/manage");
  if (!isSuperadmin(user)) redirect("/");

  const [users, composeLogs, auditLogs] = await Promise.all([
    listAuthUsers(),
    listComposeDigestLogs(50),
    listAuthAuditLogs(50),
  ]);
  const links = quickLinks();

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-10 lg:px-10">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
          <span>Superadmin only</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-[#4D0030]">
          Manage
        </h1>
        <p className="max-w-3xl text-muted-foreground">
          Manage admin credentials, review digest compose logs, and open quick
          operational links.
        </p>
      </header>

      {(sp.error || sp.ok) && (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            sp.error
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {sp.error ?? sp.ok}
        </p>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        <QuickLinkCard label="Production Site" href={links.productionSite} />
        <QuickLinkCard label="Main Scrape Workflow" href={links.mainWorkflow} />
        <QuickLinkCard label="Competitor Workflow" href={links.competitorWorkflow} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <CreateUserCard />
        <UserListCard users={users} currentEmail={user.email} />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <ComposeLogsCard logs={composeLogs} />
        <AuditLogsCard logs={auditLogs} />
      </section>
    </div>
  );
}

function CreateUserCard() {
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">Create Admin User</h2>
        </div>
        <form action="/api/manage/users" method="post" className="space-y-3">
          <input type="hidden" name="action" value="create" />
          <LabeledInput label="Email" name="email" type="email" required />
          <LabeledInput label="Name" name="name" required />
          <LabeledInput label="Job Title" name="jobTitle" />
          <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
            <span className="block">Role</span>
            <select
              name="role"
              defaultValue="admin"
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="admin">Admin</option>
              <option value="superadmin">Superadmin</option>
            </select>
          </label>
          <LabeledInput label="Temporary Password" name="password" type="password" required />
          <Button type="submit" className="w-full">
            Create user
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function UserListCard({
  users,
  currentEmail,
}: {
  users: AuthUser[];
  currentEmail: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <h2 className="font-semibold">Admin Credentials</h2>
        <div className="space-y-3">
          {users.map((user) => (
            <div key={user.email} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{user.name}</h3>
                    <Badge variant={user.role === "superadmin" ? "default" : "secondary"}>
                      {user.role}
                    </Badge>
                    <Badge variant={user.isActive ? "outline" : "destructive"}>
                      {user.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                  {user.jobTitle && (
                    <p className="text-sm text-muted-foreground">{user.jobTitle}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Last login: {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Never"}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <form action="/api/manage/users" method="post" className="space-y-2">
                  <input type="hidden" name="action" value="set_role" />
                  <input type="hidden" name="email" value={user.email} />
                  <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                    <span className="block">Role</span>
                    <select
                      name="role"
                      defaultValue={user.role}
                      className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <option value="admin">Admin</option>
                      <option value="superadmin">Superadmin</option>
                    </select>
                  </label>
                  <Button type="submit" variant="outline" size="sm" className="w-full mt-2">
                    Update role
                  </Button>
                </form>

                <form action="/api/manage/users" method="post" className="space-y-2">
                  <input type="hidden" name="action" value="reset_password" />
                  <input type="hidden" name="email" value={user.email} />
                  <LabeledInput label="New Password" name="password" type="password" required />
                  <Button type="submit" variant="outline" size="sm" className="w-full mt-2">
                    Reset password
                  </Button>
                </form>

                <form action="/api/manage/users" method="post" className="space-y-2">
                  <input type="hidden" name="action" value="set_active" />
                  <input type="hidden" name="email" value={user.email} />
                  <input
                    type="hidden"
                    name="isActive"
                    value={user.isActive ? "false" : "true"}
                  />
                  <span className="block text-xs font-medium text-muted-foreground">
                    Account status
                  </span>
                  <Button
                    type="submit"
                    variant={user.isActive ? "destructive" : "outline"}
                    size="sm"
                    className="w-full"
                    disabled={user.email === currentEmail && user.isActive}
                  >
                    {user.isActive ? "Deactivate" : "Reactivate"}
                  </Button>
                </form>
              </div>
            </div>
          ))}
          {users.length === 0 && (
            <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              No admin users found. Use the bootstrap script or create one here.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ComposeLogsCard({ logs }: { logs: ComposeDigestLog[] }) {
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <h2 className="font-semibold">Compose Digest Email Logs</h2>
        <div className="space-y-3">
          {logs.map((log) => (
            <div key={log.id} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{log.subject || "(No subject)"}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(log.composedAt)}
                </span>
              </div>
              <p className="text-muted-foreground">
                {log.userName || log.userEmail} ({log.userRole}) composed{" "}
                {log.articleCount} article{log.articleCount === 1 ? "" : "s"}.
              </p>
              <p className="truncate text-xs text-muted-foreground">
                To: {log.toRecipients || "-"} | CC: {log.ccRecipients || "-"}
              </p>
            </div>
          ))}
          {logs.length === 0 && <EmptyState text="No compose logs yet." />}
        </div>
      </CardContent>
    </Card>
  );
}

function AuditLogsCard({ logs }: { logs: AuthAuditLog[] }) {
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <h2 className="font-semibold">Admin Audit Logs</h2>
        <div className="space-y-3">
          {logs.map((log) => (
            <div key={log.id} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{log.action}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(log.createdAt)}
                </span>
              </div>
              <p className="text-muted-foreground">
                Actor: {log.actorEmail || "-"} | Target: {log.targetEmail || "-"}
              </p>
            </div>
          ))}
          {logs.length === 0 && <EmptyState text="No audit logs yet." />}
        </div>
      </CardContent>
    </Card>
  );
}

function QuickLinkCard({ label, href }: { label: string; href: string }) {
  return (
    <Link href={href} target="_blank" rel="noreferrer" className="group">
      <Card className="h-full transition-shadow group-hover:shadow-md">
        <CardContent className="flex items-center justify-between gap-3 p-5">
          <span className="font-medium">{label}</span>
          <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
        </CardContent>
      </Card>
    </Link>
  );
}

function LabeledInput({
  label,
  name,
  type = "text",
  required,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
      <span className="block">{label}</span>
      <Input name={name} type={type} required={required} />
    </label>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
      {text}
    </p>
  );
}

function quickLinks() {
  const repo = process.env.NEXT_PUBLIC_GITHUB_REPO_URL ?? "https://github.com/mfharitsah-work/az-media-monitoring";
  const site = normalizeSiteUrl(
    process.env.NEXT_PUBLIC_SITE_URL ?? process.env.VERCEL_URL ?? "https://az-media-monitoring.vercel.app",
  );
  return {
    productionSite: site,
    mainWorkflow: `${repo}/actions/workflows/scrape.yml`,
    competitorWorkflow: `${repo}/actions/workflows/competitor-news.yml`,
  };
}

function normalizeSiteUrl(value: string): string {
  if (!value) return "https://az-media-monitoring.vercel.app";
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `https://${value}`;
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));
}
