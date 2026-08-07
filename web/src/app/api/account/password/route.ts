import { NextRequest, NextResponse } from "next/server";

import {
  appendAuthUserVersion,
  findAuthUserByEmail,
  logAuthAudit,
} from "@/lib/auth/bigquery-auth-repository";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { currentUser } from "@/lib/auth/session";
import { canComposeDigest } from "@/lib/auth/types";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!canComposeDigest(user)) {
    return NextResponse.redirect(
      new URL(`/login?redirectTo=${encodeURIComponent("/account")}`, req.url),
      { status: 303 },
    );
  }

  const form = await req.formData();
  const currentPassword = String(form.get("currentPassword") ?? "");
  const newPassword = String(form.get("newPassword") ?? "");
  const confirmPassword = String(form.get("confirmPassword") ?? "");

  try {
    if (!currentPassword || !newPassword || !confirmPassword) {
      return redirectAccount(req, "All password fields are required.");
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return redirectAccount(
        req,
        `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
    }
    if (newPassword !== confirmPassword) {
      return redirectAccount(req, "New password confirmation does not match.");
    }
    if (newPassword === currentPassword) {
      return redirectAccount(req, "New password must be different.");
    }

    const authUser = await findAuthUserByEmail(user.email);
    if (!authUser || !authUser.isActive) {
      return redirectAccount(req, "Active account was not found.");
    }
    if (!verifyPassword(currentPassword, authUser.passwordHash)) {
      await logAuthAudit({
        actor: user,
        action: "change_password_failed",
        targetEmail: user.email,
        details: { reason: "invalid_current_password" },
      }).catch(() => undefined);
      return redirectAccount(req, "Current password is incorrect.");
    }

    await appendAuthUserVersion({
      ...authUser,
      passwordHash: hashPassword(newPassword),
      updatedBy: user.email,
      action: "change_password",
    });
    await logAuthAudit({
      actor: user,
      action: "change_password",
      targetEmail: user.email,
    }).catch(() => undefined);

    return redirectAccount(req, null, "Password updated.");
  } catch (error) {
    return redirectAccount(
      req,
      error instanceof Error ? error.message : "Password update failed.",
    );
  }
}

function redirectAccount(req: NextRequest, error?: string | null, ok?: string) {
  const url = new URL("/account", req.url);
  if (error) url.searchParams.set("error", error);
  if (ok) url.searchParams.set("ok", ok);
  return NextResponse.redirect(url, { status: 303 });
}
