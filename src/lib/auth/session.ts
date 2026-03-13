import { getIronSession, type IronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  userId: string;
  notionUserId: string;
}

function getSessionOptions(): SessionOptions {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET environment variable is required");
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
  const session = await getIronSession<SessionData>(cookieStore, getSessionOptions());
  return Object.assign(session, {
    isLoggedIn: !!session.userId,
  });
}

/** For Route Handlers — reads session from request/response pair */
export async function getRouteSession(
  req: Request,
  res: Response,
): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(req, res, getSessionOptions());
}

/** Destroy session (for logout) — clears cookie data */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, getSessionOptions());
  session.destroy();
}
