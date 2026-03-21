import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { getUserById, upsertNotionPage } from "@/lib/db/queries";
import { getPageAsMarkdown, getSharedPages } from "@/lib/notion/reader";
import { parseMarkdown } from "@/lib/parser/markdown";
import { decrypt } from "@/lib/utils/crypto";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { session } = auth;

  const body = await request.json().catch(() => null);
  const pageId = body?.pageId;
  if (!pageId || typeof pageId !== "string") {
    return NextResponse.json({ error: "pageId is required" }, { status: 400 });
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

  // Verify the user's Notion token has access to this page
  let sharedPages: Awaited<ReturnType<typeof getSharedPages>>;
  try {
    sharedPages = await getSharedPages(accessToken);
  } catch {
    return NextResponse.json(
      {
        error:
          "Failed to verify page access. Your Notion token may have expired.",
      },
      { status: 502 },
    );
  }

  const sharedPage = sharedPages.find((p) => p.id === pageId);
  if (!sharedPage) {
    return NextResponse.json(
      { error: "Page not found or not shared with GarminMD." },
      { status: 404 },
    );
  }

  const title = sharedPage.title || "Untitled";

  // Fetch the markdown content from Notion
  let markdown: string;
  try {
    markdown = await getPageAsMarkdown(accessToken, pageId);
  } catch {
    return NextResponse.json(
      {
        error: "Failed to read page from Notion. Your token may have expired.",
      },
      { status: 502 },
    );
  }

  // Parse into structured workouts
  const workouts = parseMarkdown(markdown);

  // Compute a content hash for change detection
  const contentHash = createHash("sha256").update(markdown).digest("hex");

  // Upsert the page record
  await upsertNotionPage(session.userId, pageId, title, contentHash);

  return NextResponse.json({
    pageId,
    title,
    contentHash,
    workoutCount: workouts.length,
    workouts,
  });
}
