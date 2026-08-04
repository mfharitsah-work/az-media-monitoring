import { NextRequest, NextResponse } from "next/server";

import { isGuardResponse, requireAdminUser } from "@/lib/auth/guards";
import { saveComposeDigestLog } from "@/lib/auth/bigquery-auth-repository";

export async function POST(req: NextRequest) {
  const user = await requireAdminUser();
  if (isGuardResponse(user)) return user;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const articleIds = Array.isArray(body.articleIds)
    ? body.articleIds.map(String).filter(Boolean)
    : [];
  const dateRanges = Array.isArray(body.dateRanges)
    ? body.dateRanges.map(String).filter(Boolean)
    : [];

  await saveComposeDigestLog({
    user,
    senderEmail: String(body.senderEmail ?? ""),
    senderName: String(body.senderName ?? ""),
    senderJobTitle: String(body.senderJobTitle ?? ""),
    toRecipients: String(body.toRecipients ?? ""),
    ccRecipients: String(body.ccRecipients ?? ""),
    subject: String(body.subject ?? ""),
    dateRanges,
    articleCount: Number(body.articleCount ?? articleIds.length),
    articleIds,
  });

  return NextResponse.json({ ok: true });
}
