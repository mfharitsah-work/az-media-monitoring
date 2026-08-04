import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { currentUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Admin Login",
  description: "Admin login for Media Monitoring.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [sp, user] = await Promise.all([searchParams, currentUser()]);
  const redirectTo = safeRedirectPath(sp.redirectTo ?? "/");
  if (user.role !== "guest") redirect(redirectTo);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-6 space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LogIn className="h-4 w-4" />
            <span>Admin access</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[#4D0030]">
            Sign in
          </h1>
          <p className="text-sm text-muted-foreground">
            Guest visitors can browse the dashboard without signing in. Sign in
            only for digest compose and management access.
          </p>
        </div>

        {sp.error && (
          <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {sp.error}
          </p>
        )}

        <form action="/api/auth/login" method="post" className="space-y-4">
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <label className="space-y-1.5 text-sm font-medium">
            <span>Email</span>
            <Input name="email" type="email" required autoComplete="email" />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            <span>Password</span>
            <Input
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </label>
          <Button type="submit" className="w-full mt-2">
            Sign in
          </Button>
        </form>

        <div className="mt-4 border-t pt-4 text-center">
          <Link
            href="/"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Continue as guest
          </Link>
        </div>
      </div>
    </div>
  );
}

function safeRedirectPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.startsWith("/api/")) return "/";
  return value;
}
