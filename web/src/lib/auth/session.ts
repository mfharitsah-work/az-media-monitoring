import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { GUEST_USER, type AuthRole, type SessionUser } from "./types";

export const SESSION_COOKIE_NAME = "az_mm_session";
export const SESSION_TTL_SECONDS = 60 * 60;

interface SessionPayload {
  id: string;
  email: string;
  name: string;
  jobTitle: string;
  role: AuthRole;
  exp: number;
}

function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET env var is required");
    }
    return "dev-only-auth-secret-change-before-production";
  }
  return secret;
}

function b64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function sign(payloadB64: string): string {
  return createHmac("sha256", authSecret()).update(payloadB64).digest("base64url");
}

function verifySignature(payloadB64: string, signature: string): boolean {
  const expected = Buffer.from(sign(payloadB64), "base64url");
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function createSessionToken(user: SessionUser): string {
  const payload: SessionPayload = {
    id: user.id,
    email: user.email,
    name: user.name,
    jobTitle: user.jobTitle,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const payloadB64 = b64Json(payload);
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function parseSessionToken(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) return null;
  if (!verifySignature(payloadB64, signature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!["admin", "superadmin"].includes(payload.role)) return null;
    return {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      jobTitle: payload.jobTitle,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

export async function currentUser(): Promise<SessionUser> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  return parseSessionToken(token) ?? GUEST_USER;
}
