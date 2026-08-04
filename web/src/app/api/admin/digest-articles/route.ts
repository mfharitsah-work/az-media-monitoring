import { NextResponse } from "next/server";

import { isGuardResponse, requireAdminUser } from "@/lib/auth/guards";
import { articleRepo } from "@/lib/repositories";

export async function GET() {
  const user = await requireAdminUser();
  if (isGuardResponse(user)) return user;

  const [yesterday, today, latest] = await Promise.all([
    articleRepo.findMany({ range: "yesterday", limit: 200 }),
    articleRepo.findMany({ range: "today", limit: 200 }),
    articleRepo.findMany({ range: "latest", limit: 300 }),
  ]);

  return NextResponse.json(
    {
      articleGroups: {
        yesterday: yesterday.items,
        today: today.items,
        latest: latest.items,
      },
    },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    },
  );
}
