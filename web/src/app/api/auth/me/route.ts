import { NextResponse } from "next/server";

import { currentUser } from "@/lib/auth/session";

export async function GET() {
  const user = await currentUser();
  return NextResponse.json(
    { user },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    },
  );
}
