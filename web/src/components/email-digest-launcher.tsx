"use client";

import {
  EmailDigestButton,
  type ArticleGroups,
} from "@/components/email-digest-button";
import {
  canComposeDigestClient,
  useCurrentSessionUser,
} from "@/lib/auth/client-session";

/**
 * Client-side launcher supaya page render tidak perlu membaca auth cookie atau
 * preload artikel digest. Data digest baru diminta saat admin membuka compose.
 */
export function EmailDigestLauncher() {
  const { user, ready } = useCurrentSessionUser();

  if (!ready || !canComposeDigestClient(user)) return null;

  return (
    <EmailDigestButton
      currentUser={user}
      loadArticleGroups={loadDigestArticleGroups}
    />
  );
}

async function loadDigestArticleGroups(): Promise<ArticleGroups> {
  const res = await fetch("/api/admin/digest-articles", {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error("Failed to load digest articles.");
  const payload = await res.json();
  return payload.articleGroups as ArticleGroups;
}
