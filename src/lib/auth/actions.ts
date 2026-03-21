"use server";

import { getServerSession } from "@/lib/auth/session";
import { getNotionAuthUrl } from "@/lib/notion/oauth";

/** Generate OAuth state, persist to session cookie, return the full Notion auth URL. */
export async function generateNotionAuthUrl(): Promise<string> {
  const session = await getServerSession();
  const state = crypto.randomUUID();
  session.oauthState = state;
  await session.save();
  return getNotionAuthUrl(state);
}
