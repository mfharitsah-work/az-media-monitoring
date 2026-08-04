import { NextRequest, NextResponse } from "next/server";

import {
  appendAuthUserVersion,
  findAuthUserByEmail,
  logAuthAudit,
} from "@/lib/auth/bigquery-auth-repository";
import { verifyPassword } from "@/lib/auth/password";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from "@/lib/auth/session";
import type { SessionUser } from "@/lib/auth/types";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const redirectTo = String(form.get("redirectTo") ?? "/");

  if (!email || !password) {
    return redirectWithError(req, redirectTo, "Email and password are required.");
  }

  const authUser = await findAuthUserByEmail(email);
  if (!authUser || !authUser.isActive || !verifyPassword(password, authUser.passwordHash)) {
    await logAuthAudit({
      action: "login_failed",
      targetEmail: email,
      details: { reason: "invalid_credentials" },
    }).catch(() => undefined);
    return redirectWithError(req, redirectTo, "Invalid email or password.");
  }

  const sessionUser: SessionUser = {
    id: authUser.id,
    email: authUser.email,
    name: authUser.name,
    jobTitle: authUser.jobTitle,
    role: authUser.role,
  };

  await appendAuthUserVersion({
    ...authUser,
    lastLoginAt: new Date().toISOString(),
    updatedBy: authUser.email,
    action: "login",
  });
  await logAuthAudit({
    actor: sessionUser,
    action: "login_success",
    targetEmail: authUser.email,
  }).catch(() => undefined);

  const res = NextResponse.redirect(safeRedirectUrl(req, redirectTo), { status: 303 });
  res.cookies.set(SESSION_COOKIE_NAME, createSessionToken(sessionUser), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
  return res;
}

function redirectWithError(req: NextRequest, redirectTo: string, message: string) {
  const url = new URL("/login", req.url);
  url.searchParams.set("error", message);
  url.searchParams.set("redirectTo", safeRedirectPath(redirectTo));
  return NextResponse.redirect(url, { status: 303 });
}

function safeRedirectUrl(req: NextRequest, value: string): URL {
  return new URL(safeRedirectPath(value), req.url);
}

function safeRedirectPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.startsWith("/api/")) return "/";
  return value;
}
