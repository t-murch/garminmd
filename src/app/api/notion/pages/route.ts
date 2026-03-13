import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { getUserById } from "@/lib/db/queries";
import { decrypt } from "@/lib/utils/crypto";
import { getSharedPages } from "@/lib/notion/reader";

export async function GET() {
  const session = await getServerSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  let pages;
  try {
    pages = await getSharedPages(accessToken);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch pages from Notion. Your token may have expired." },
      { status: 502 },
    );
  }

  return NextResponse.json(pages);
}
