import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth/session";
import { encrypt } from "@/lib/utils/crypto";
import { upsertGarminConnection } from "@/lib/db/queries";
import {
  createGarminClient,
  GarminAuthError,
  GarminServiceError,
} from "@/lib/garmin/client";

const bodySchema = z.object({
  email: z.string().email("A valid email address is required."),
  password: z.string().min(1, "Password is required."),
});

/**
 * POST /api/garmin/auth
 *
 * Authenticates with Garmin Connect using the provided credentials,
 * then stores the encrypted email and session tokens in the database.
 *
 * Requires an active session (user must be logged in via Notion first).
 */
export async function POST(request: Request) {
  // Verify the user is logged in
  const session = await getServerSession();
  if (!session.isLoggedIn) {
    return NextResponse.json(
      { error: "You must be logged in to connect Garmin." },
      { status: 401 },
    );
  }

  // Validate request body
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "Invalid input.";
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const { email, password } = parsed.data;

  // Attempt Garmin login
  let garminClient;
  try {
    garminClient = await createGarminClient(email, password);
  } catch (err) {
    if (err instanceof GarminAuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof GarminServiceError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    return NextResponse.json(
      { error: "Failed to connect to Garmin. Try again later." },
      { status: 500 },
    );
  }

  // Persist encrypted credentials and session tokens
  const encryptedEmail = encrypt(email);
  const encryptedPassword = encrypt(password);
  const sessionTokens = garminClient.getSessionTokens();
  const encryptedSession = encrypt(JSON.stringify(sessionTokens));

  await upsertGarminConnection(
    session.userId,
    encryptedEmail,
    encryptedSession,
    encryptedPassword,
  );

  return NextResponse.json({ success: true, email });
}
