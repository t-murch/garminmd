import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { getUserById } from "@/lib/db/queries";
import { getSharedPages } from "@/lib/notion/reader";
import { decrypt } from "@/lib/utils/crypto";

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { session } = auth;

  const user = await getUserById(session.userId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let accessToken: string;
  try {
    accessToken = decrypt(user.notionAccessToken);
  } catch {
    return NextResponse.json(
      { error: "Failed to decrypt Notion token. Please reconnect Notion." },
      { status: 500 },
    );
  }

  let pages: Awaited<ReturnType<typeof getSharedPages>>;
  try {
    pages = await getSharedPages(accessToken);
  } catch {
    return NextResponse.json(
      {
        error:
          "Failed to fetch pages from Notion. Your token may have expired.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json(pages);
}
