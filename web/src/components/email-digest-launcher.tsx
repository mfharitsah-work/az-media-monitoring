import { EmailDigestButton } from "@/components/email-digest-button";
import { currentUser } from "@/lib/auth/session";
import { canComposeDigest } from "@/lib/auth/types";
import { articleRepo } from "@/lib/repositories";

/**
 * Server component yang mengambil artikel untuk opsi digest lalu render tombol
 * compose. Reusable di home page dan All News page saat Latest News aktif.
 */
export async function EmailDigestLauncher() {
  const user = await currentUser();
  if (!canComposeDigest(user)) return null;

  const [yesterday, today, latest] = await Promise.all([
    articleRepo.findMany({ range: "yesterday", limit: 200 }),
    articleRepo.findMany({ range: "today", limit: 200 }),
    articleRepo.findMany({ range: "latest", limit: 300 }),
  ]);

  return (
    <EmailDigestButton
      articleGroups={{
        yesterday: yesterday.items,
        today: today.items,
        latest: latest.items,
      }}
      currentUser={user}
    />
  );
}
