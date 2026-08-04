import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  appendAuthUserVersion,
  findAuthUserByEmail,
  logAuthAudit,
} from "@/lib/auth/bigquery-auth-repository";
import { isGuardResponse, requireSuperadminUser } from "@/lib/auth/guards";
import { hashPassword } from "@/lib/auth/password";
import { PrivilegedRoleSchema } from "@/lib/auth/types";

export async function POST(req: NextRequest) {
  const actor = await requireSuperadminUser();
  if (isGuardResponse(actor)) return actor;

  const form = await req.formData();
  const action = String(form.get("action") ?? "");
  const email = String(form.get("email") ?? "").trim().toLowerCase();

  try {
    if (action === "create") {
      const role = PrivilegedRoleSchema.parse(String(form.get("role") ?? "admin"));
      const name = String(form.get("name") ?? "").trim();
      const jobTitle = String(form.get("jobTitle") ?? "").trim();
      const password = String(form.get("password") ?? "");
      if (!email || !name || !password) {
        return redirectManage(req, "Missing required user fields.");
      }
      const existing = await findAuthUserByEmail(email);
      if (existing) return redirectManage(req, "User already exists.");

      const now = new Date().toISOString();
      await appendAuthUserVersion({
        id: randomUUID(),
        email,
        name,
        jobTitle,
        role,
        passwordHash: hashPassword(password),
        isActive: true,
        createdAt: now,
        lastLoginAt: null,
        createdBy: actor.email,
        updatedBy: actor.email,
        action: "create",
      });
      await logAuthAudit({
        actor,
        action: "create_user",
        targetEmail: email,
        details: { role },
      }).catch(() => undefined);
      return redirectManage(req, null, "User created.");
    }

    const user = await findAuthUserByEmail(email);
    if (!user) return redirectManage(req, "User not found.");

    if (action === "reset_password") {
      const password = String(form.get("password") ?? "");
      if (!password) return redirectManage(req, "New password is required.");
      await appendAuthUserVersion({
        ...user,
        passwordHash: hashPassword(password),
        updatedBy: actor.email,
        action: "reset_password",
      });
      await logAuthAudit({
        actor,
        action: "reset_password",
        targetEmail: email,
      }).catch(() => undefined);
      return redirectManage(req, null, "Password reset.");
    }

    if (action === "set_role") {
      const role = PrivilegedRoleSchema.parse(String(form.get("role") ?? user.role));
      if (email === actor.email && role !== "superadmin") {
        return redirectManage(req, "You cannot downgrade your own superadmin role.");
      }
      await appendAuthUserVersion({
        ...user,
        role,
        updatedBy: actor.email,
        action: "set_role",
      });
      await logAuthAudit({
        actor,
        action: "set_role",
        targetEmail: email,
        details: { role },
      }).catch(() => undefined);
      return redirectManage(req, null, "Role updated.");
    }

    if (action === "set_active") {
      const isActive = String(form.get("isActive") ?? "") === "true";
      if (email === actor.email && !isActive) {
        return redirectManage(req, "You cannot deactivate your own account.");
      }
      await appendAuthUserVersion({
        ...user,
        isActive,
        updatedBy: actor.email,
        action: isActive ? "reactivate" : "deactivate",
      });
      await logAuthAudit({
        actor,
        action: isActive ? "reactivate_user" : "deactivate_user",
        targetEmail: email,
      }).catch(() => undefined);
      return redirectManage(req, null, isActive ? "User reactivated." : "User deactivated.");
    }

    return redirectManage(req, "Unknown user action.");
  } catch (error) {
    return redirectManage(
      req,
      error instanceof Error ? error.message : "Manage user action failed.",
    );
  }
}

function redirectManage(req: NextRequest, error?: string | null, ok?: string) {
  const url = new URL("/manage", req.url);
  if (error) url.searchParams.set("error", error);
  if (ok) url.searchParams.set("ok", ok);
  return NextResponse.redirect(url, { status: 303 });
}
