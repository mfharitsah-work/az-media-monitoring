import { NextResponse } from "next/server";

import { currentUser } from "./session";
import { canComposeDigest, isSuperadmin, type SessionUser } from "./types";

export async function requireAdminUser(): Promise<SessionUser | NextResponse> {
  const user = await currentUser();
  if (!canComposeDigest(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return user;
}

export async function requireSuperadminUser(): Promise<SessionUser | NextResponse> {
  const user = await currentUser();
  if (!isSuperadmin(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return user;
}

export function isGuardResponse(value: SessionUser | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}
