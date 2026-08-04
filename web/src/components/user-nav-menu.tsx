"use client";

import Link from "next/link";
import { ChevronDown, LogIn, LogOut, Settings, UserRound } from "lucide-react";

import type { SessionUser } from "@/lib/auth/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function UserNavMenu({
  user,
  pathname,
  loading = false,
}: {
  user: SessionUser;
  pathname: string;
  loading?: boolean;
}) {
  const isGuest = user.role === "guest";
  const displayName = loading ? "User" : isGuest ? "Guest" : user.name;

  return (
    <Popover>
      <PopoverTrigger
        aria-label="Open user menu"
        className="inline-flex h-9 items-center gap-2 rounded-md bg-white/10 px-2.5 text-sm font-medium text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <UserRound className="size-4" />
        <span className="hidden max-w-28 truncate md:inline">
          {displayName}
        </span>
        <ChevronDown className="size-3.5 opacity-80" />
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 p-0">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">
            {loading ? "Checking session" : isGuest ? "Guest access" : user.name}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {loading
              ? "Loading user access..."
              : isGuest
                ? "Browsing without admin privileges"
                : user.email}
          </p>
          {!isGuest && user.jobTitle ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {user.jobTitle}
            </p>
          ) : null}
        </div>

        <div className="space-y-1 p-2">
          {loading ? (
            <p className="px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">
              User details will appear here after session check completes.
            </p>
          ) : isGuest ? (
            <>
              <p className="px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">
                Login is only needed for admin tools such as composing digest
                emails and managing access.
              </p>
              <Link
                href={`/login?redirectTo=${encodeURIComponent(pathname)}`}
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium hover:bg-muted"
              >
                <LogIn className="size-4" />
                Admin login
              </Link>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs text-muted-foreground">
                <span>Role</span>
                <span className="font-medium capitalize text-foreground">
                  {user.role}
                </span>
              </div>

              {user.role === "superadmin" ? (
                <Link
                  href="/manage"
                  className="flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium hover:bg-muted"
                >
                  <Settings className="size-4" />
                  Manage
                </Link>
              ) : null}

              <form action="/api/auth/logout" method="post">
                <input type="hidden" name="redirectTo" value={pathname} />
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="size-4" />
                  Logout
                </button>
              </form>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
