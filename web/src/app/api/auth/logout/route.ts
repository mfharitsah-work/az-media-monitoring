import { NextRequest, NextResponse } from "next/server";

import { logAuthAudit } from "@/lib/auth/bigquery-auth-repository";
import { currentUser, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (user.role !== "guest") {
    await logAuthAudit({
      actor: user,
      action: "logout",
      targetEmail: user.email,
    }).catch(() => undefined);
  }

  const redirectTo = String((await req.formData().catch(() => new FormData())).get("redirectTo") ?? "/");
  const res = NextResponse.redirect(new URL(safeRedirectPath(redirectTo), req.url), {
    status: 303,
  });
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return res;
}

function safeRedirectPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.startsWith("/api/")) return "/";
  return value;
}
