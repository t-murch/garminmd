import type { IGarminTokens } from "@flow-js/garmin-connect";
import { NextResponse } from "next/server";
import { z } from "zod";
import { StrengthAdapter } from "@/lib/adapters/strength";
import { requireAuth } from "@/lib/auth/session";
import type { GarminWorkoutPayload, ResolvedWorkout } from "@/lib/core/types";
import {
  getGarminConnection,
  getNotionPages,
  getUserById,
  upsertGarminConnection,
} from "@/lib/db/queries";
import {
  createGarminClient,
  GarminAuthError,
  GarminServiceError,
} from "@/lib/garmin/client";
import { type SyncResult, syncWorkoutsToGarmin } from "@/lib/garmin/sync";
import { decrypt, encrypt } from "@/lib/utils/crypto";

const bodySchema = z.object({
  pageId: z.string().min(1, "Page ID is required."),
});

/**
 * POST /api/garmin/push
 *
 * Pushes workouts from a Notion page to Garmin Connect.
 *
 * Flow:
 *   1. Validate session + Garmin connection
 *   2. Create authenticated Garmin client (reusing stored session tokens)
 *   3. Load parsed workouts for the page
 *   4. Build Garmin payloads via StrengthAdapter
 *   5. Sync to Garmin (idempotent: create/update/unchanged)
 *   6. Return sync results
 */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { session } = auth;

  // Validate request body
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "Invalid input.";
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const { pageId } = parsed.data;

  // Verify the page belongs to this user
  const pages = await getNotionPages(session.userId);
  const page = pages.find((p) => p.notionPageId === pageId);
  if (!page) {
    return NextResponse.json(
      { error: "Page not found or not connected to your account." },
      { status: 404 },
    );
  }

  // Get and verify Garmin connection
  const garminConn = await getGarminConnection(session.userId);
  if (!garminConn) {
    return NextResponse.json(
      { error: "Garmin is not connected. Connect your account first." },
      { status: 400 },
    );
  }

  // Decrypt credentials and session tokens
  const email = decrypt(garminConn.garminEmail);
  let existingTokens: IGarminTokens | undefined;
  if (garminConn.garminSession) {
    try {
      existingTokens = JSON.parse(
        decrypt(garminConn.garminSession),
      ) as IGarminTokens;
    } catch {
      // Corrupted session data — will fall back to fresh login
    }
  }

  // Create authenticated Garmin client
  let garminClient: Awaited<ReturnType<typeof createGarminClient>>;
  try {
    // Password is not stored (only email + session tokens).
    // If tokens are expired, this will fail and user needs to re-auth.
    // We pass an empty password since we rely on stored session tokens.
    garminClient = await createGarminClient(email, "", existingTokens);
  } catch (err) {
    if (err instanceof GarminAuthError) {
      console.error("[garmin/push] Auth error:", err.message);
      return NextResponse.json(
        {
          error:
            "Garmin authentication failed. Please reconnect your account in Settings.",
        },
        { status: 401 },
      );
    }
    if (err instanceof GarminServiceError) {
      console.error("[garmin/push] Service error:", err.message);
      return NextResponse.json(
        {
          error: "Garmin service is temporarily unavailable. Try again later.",
        },
        { status: 502 },
      );
    }
    return NextResponse.json(
      {
        error:
          "Garmin session expired. Please reconnect your Garmin account in Settings.",
      },
      { status: 401 },
    );
  }

  // Fetch the Notion page, parse workouts, and resolve exercises
  let resolvedWorkouts: ResolvedWorkout[];
  try {
    resolvedWorkouts = await getResolvedWorkoutsForPage(
      session.userId,
      pageId,
    );
  } catch (err) {
    if (err instanceof NotionPipelineError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Failed to load workouts: ${message}` },
      { status: 500 },
    );
  }

  if (resolvedWorkouts.length === 0) {
    return NextResponse.json(
      {
        error: "No workouts found for this page. Sync from Notion first.",
      },
      { status: 400 },
    );
  }

  // Build Garmin payloads
  const adapter = new StrengthAdapter();
  const payloads: GarminWorkoutPayload[] = [];
  const validationWarnings: string[] = [];

  for (const workout of resolvedWorkouts) {
    const validation = adapter.validate(workout);
    if (!validation.valid) {
      validationWarnings.push(
        `Skipped "${workout.name}": ${validation.errors.join("; ")}`,
      );
      continue;
    }
    if (validation.warnings.length > 0) {
      validationWarnings.push(
        ...validation.warnings.map((w) => `${workout.name}: ${w}`),
      );
    }
    payloads.push(adapter.build(workout));
  }

  if (payloads.length === 0) {
    return NextResponse.json(
      {
        error: "All workouts failed validation.",
        warnings: validationWarnings,
      },
      { status: 400 },
    );
  }

  // Sync to Garmin
  let results: SyncResult[];
  try {
    results = await syncWorkoutsToGarmin(
      session.userId,
      payloads,
      garminClient,
    );
  } catch (err) {
    console.error(
      "[garmin/push] Sync failed:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Failed to sync workouts to Garmin. Try again later." },
      { status: 502 },
    );
  }

  // Update stored session tokens (they may have been refreshed)
  // This is best-effort; a failure here shouldn't block the response.
  try {
    const freshTokens = garminClient.getSessionTokens();
    await upsertGarminConnection(
      session.userId,
      garminConn.garminEmail,
      encrypt(JSON.stringify(freshTokens)),
    );
  } catch {
    // Non-critical — tokens will be refreshed on next request
  }

  return NextResponse.json({
    results,
    warnings: validationWarnings.length > 0 ? validationWarnings : undefined,
    summary: {
      created: results.filter((r) => r.action === "created").length,
      updated: results.filter((r) => r.action === "updated").length,
      unchanged: results.filter((r) => r.action === "unchanged").length,
      total: results.length,
    },
  });
}

// ─── Notion → Parse → Resolve Pipeline ─────────────────────────

/**
 * Fetches a Notion page, parses its markdown tables into workouts,
 * and resolves every exercise through the 3-tier resolver chain.
 *
 * Steps:
 *   1. Look up the user to get their encrypted Notion access token
 *   2. Decrypt the token
 *   3. Fetch the Notion page as markdown
 *   4. Parse markdown into ParsedWorkout[]
 *   5. Resolve each workout's exercises (exact → cache → LLM)
 *   6. Return ResolvedWorkout[]
 *
 * Throws an error with a descriptive message if Notion fetch fails
 * so the caller can return an appropriate HTTP status.
 */
async function getResolvedWorkoutsForPage(
  userId: string,
  pageId: string,
): Promise<ResolvedWorkout[]> {
  // 1. Get user and decrypt Notion token
  const user = await getUserById(userId);
  if (!user) {
    throw new NotionPipelineError("User not found.");
  }

  const accessToken = decrypt(user.notionAccessToken);

  // 2. Fetch the Notion page as markdown
  let markdown: string;
  try {
    markdown = await getPageAsMarkdown(accessToken, pageId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new NotionPipelineError(
      `Failed to fetch Notion page: ${message}`,
    );
  }

  // 3. Parse markdown into structured workouts
  const parsedWorkouts = parseMarkdown(markdown);

  // 4. Resolve exercises for each workout
  const resolved: ResolvedWorkout[] = [];
  for (const parsed of parsedWorkouts) {
    resolved.push(await resolveWorkout(parsed));
  }

  return resolved;
}

/** Distinguishes Notion pipeline errors from other failures. */
class NotionPipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotionPipelineError";
  }
}
