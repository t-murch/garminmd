import { NextResponse } from "next/server";
import { exchangeCodeForToken } from "@/lib/notion/oauth";
import { encrypt } from "@/lib/utils/crypto";
import {
  getUserByNotionId,
  createUser,
  updateUserToken,
} from "@/lib/db/queries";
import { getServerSession } from "@/lib/auth/session";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=no_code", request.url));
  }

  let tokenResponse;
  try {
    tokenResponse = await exchangeCodeForToken(code);
  } catch {
    return NextResponse.redirect(
      new URL("/login?error=token_exchange", request.url),
    );
  }

  const notionUserId = tokenResponse.owner.user.id;
  const encryptedToken = encrypt(tokenResponse.accessToken);

  // Find or create the user
  let isNewUser = false;
  let userId: string;

  const existingUser = await getUserByNotionId(notionUserId);
  if (existingUser) {
    userId = existingUser.id;
    await updateUserToken(userId, encryptedToken);
  } else {
    isNewUser = true;
    const created = await createUser(notionUserId, encryptedToken);
    userId = created.id;
  }

  // Create session
  const session = await getServerSession();
  session.userId = userId;
  session.notionUserId = notionUserId;
  await session.save();

  // New users go to onboarding, returning users go to dashboard
  const destination = isNewUser ? "/onboarding" : "/dashboard";
  return NextResponse.redirect(new URL(destination, request.url));
}
