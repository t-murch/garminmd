import {
  getIronSession,
  type IronSession,
  type SessionOptions,
} from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export interface SessionData {
  userId: string;
  notionUserId: string;
  /** Transient: OAuth CSRF state token, cleared after callback validation */
  oauthState?: string;
}

export type AuthenticatedSession = IronSession<SessionData> & {
  isLoggedIn: true;
  userId: string;
  notionUserId: string;
};

type AuthResult =
  | { session: AuthenticatedSession; error?: never }
  | { session?: never; error: NextResponse };

function getSessionOptions(): SessionOptions {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET environment variable is required");
  }
  if (secret.length < 32) {
    throw new Error("NEXTAUTH_SECRET must be at least 32 characters long");
  }
  return {
    password: secret,
    cookieName: "garminmd-session",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax" as const,
    },
  };
}

/** For Server Components and Server Actions — reads session from cookies() */
export async function getServerSession(): Promise<
  IronSession<SessionData> & { isLoggedIn: boolean }
> {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(
    cookieStore,
    getSessionOptions(),
  );
  return Object.assign(session, {
    isLoggedIn: !!session.userId,
  });
}

/** Validates session and returns authenticated session or 401 response */
export async function requireAuth(): Promise<AuthResult> {
  const session = await getServerSession();
  if (!session.isLoggedIn) {
    return {
      error: NextResponse.json(
        { error: "You must be logged in." },
        { status: 401 },
      ),
    };
  }
  return { session: session as AuthenticatedSession };
}

/** Destroy session (for logout) — clears cookie data */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(
    cookieStore,
    getSessionOptions(),
  );
  session.destroy();
}
