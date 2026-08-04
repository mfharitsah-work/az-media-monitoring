"use client";

import { useEffect, useState } from "react";

import type { SessionUser } from "./types";

export const CLIENT_GUEST_USER: SessionUser = {
  id: "guest",
  email: "",
  name: "Guest",
  jobTitle: "",
  role: "guest",
};

export function useCurrentSessionUser(refreshKey?: string) {
  const [user, setUser] = useState<SessionUser>(CLIENT_GUEST_USER);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    fetchCurrentSessionUser()
      .then((nextUser) => {
        if (!active) return;
        setUser(nextUser);
        setReady(true);
      })
      .catch(() => {
        if (!active) return;
        setUser(CLIENT_GUEST_USER);
        setReady(true);
      });

    return () => {
      active = false;
    };
  }, [refreshKey]);

  return { user, ready };
}

export async function fetchCurrentSessionUser(): Promise<SessionUser> {
  const res = await fetch("/api/auth/me", {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!res.ok) return CLIENT_GUEST_USER;
  return readSessionUser(await res.json());
}

export function canComposeDigestClient(user: SessionUser): boolean {
  return user.role === "admin" || user.role === "superadmin";
}

function readSessionUser(payload: unknown): SessionUser {
  if (!payload || typeof payload !== "object" || !("user" in payload)) {
    return CLIENT_GUEST_USER;
  }
  const user = (payload as { user?: Partial<SessionUser> }).user;
  if (!user || typeof user !== "object") return CLIENT_GUEST_USER;
  if (!["guest", "admin", "superadmin"].includes(String(user.role))) {
    return CLIENT_GUEST_USER;
  }
  return {
    id: String(user.id ?? CLIENT_GUEST_USER.id),
    email: String(user.email ?? ""),
    name: String(user.name ?? CLIENT_GUEST_USER.name),
    jobTitle: String(user.jobTitle ?? ""),
    role: user.role as SessionUser["role"],
  };
}
