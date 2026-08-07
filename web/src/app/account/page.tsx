import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeyRound, ShieldCheck, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { currentUser } from "@/lib/auth/session";
import { canComposeDigest } from "@/lib/auth/types";

export const metadata: Metadata = {
  title: "Account",
  description: "Manage your Media Monitoring account password.",
};

export const revalidate = 0;

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [sp, user] = await Promise.all([searchParams, currentUser()]);
  if (!canComposeDigest(user)) {
    redirect(`/login?redirectTo=${encodeURIComponent("/account")}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <UserRound className="h-4 w-4" />
          <span>Admin account</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-[#4D0030]">
          Account Settings
        </h1>
        <p className="text-muted-foreground">
          Review your profile details and update your own password.
        </p>
      </header>

      {sp.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {sp.error}
        </p>
      ) : null}
      {sp.ok ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
          {sp.ok}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <ProfileField label="Name" value={user.name} />
          <ProfileField label="Role" value={user.role} />
          <ProfileField label="Email" value={user.email} />
          <ProfileField label="Job title" value={user.jobTitle || "-"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Change Password
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Use the temporary password from superadmin as your current password
            the first time you update it.
          </p>
        </CardHeader>
        <CardContent>
          <form action="/api/account/password" method="post" className="space-y-4">
            <PasswordField
              label="Current password"
              name="currentPassword"
              autoComplete="current-password"
            />
            <PasswordField
              label="New password"
              name="newPassword"
              autoComplete="new-password"
            />
            <PasswordField
              label="Confirm new password"
              name="confirmPassword"
              autoComplete="new-password"
            />
            <div className="flex justify-end">
              <Button type="submit">Update password</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <span className="block text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <span className="mt-1 block break-words text-sm font-medium">{value}</span>
    </div>
  );
}

function PasswordField({
  label,
  name,
  autoComplete,
}: {
  label: string;
  name: string;
  autoComplete: string;
}) {
  return (
    <label className="block space-y-1.5 text-sm font-medium">
      <span>{label}</span>
      <Input
        name={name}
        type="password"
        autoComplete={autoComplete}
        required
        minLength={8}
      />
    </label>
  );
}
