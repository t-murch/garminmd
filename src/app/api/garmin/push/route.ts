import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/session";
import { decrypt, encrypt } from "@/lib/utils/crypto";
import {
  getGarminConnection,
  getNotionPages,
  upsertGarminConnection,
} from "@/lib/db/queries";
import {
  createGarminClient,
  GarminAuthError,
  GarminServiceError,
} from "@/lib/garmin/client";
import { syncWorkoutsToGarmin, type SyncResult } from "@/lib/garmin/sync";
import { StrengthAdapter } from "@/lib/adapters/strength";
import type {
  GarminWorkoutPayload,
  ResolvedWorkout,
} from "@/lib/core/types";
import type { IGarminTokens } from "@flow-js/garmin-connect";

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
  let garminClient;
  try {
    // Password is not stored (only email + session tokens).
    // If tokens are expired, this will fail and user needs to re-auth.
    // We pass an empty password since we rely on stored session tokens.
    garminClient = await createGarminClient(email, "", existingTokens);
  } catch (err) {
    if (err instanceof GarminAuthError) {
      console.error("[garmin/push] Auth error:", err.message);
      return NextResponse.json(
        { error: "Garmin authentication failed. Please reconnect your account in Settings." },
        { status: 401 },
      );
    }
    if (err instanceof GarminServiceError) {
      console.error("[garmin/push] Service error:", err.message);
      return NextResponse.json(
        { error: "Garmin service is temporarily unavailable. Try again later." },
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

  // Build Garmin workout payloads from the stored parsed workouts.
  //
  // In the full pipeline, this step would:
  //   1. Re-fetch/parse the Notion page (or use cached parse data)
  //   2. Resolve exercises (exact-match + LLM + cache)
  //   3. Build payloads via the StrengthAdapter
  //
  // For now, we expect parsed + resolved workout data to be available.
  // This will be connected once the full Notion sync + resolver pipeline
  // is wired up. We return a clear error until then.
  //
  // TODO: Wire up Notion page re-parse + exercise resolution pipeline
  const resolvedWorkouts = await getResolvedWorkoutsForPage(
    session.userId,
    pageId,
  );

  if (resolvedWorkouts.length === 0) {
    return NextResponse.json(
      {
        error:
          "No workouts found for this page. Sync from Notion first.",
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
    results = await syncWorkoutsToGarmin(session.userId, payloads, garminClient);
  } catch (err) {
    console.error("[garmin/push] Sync failed:", err instanceof Error ? err.message : err);
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

// ─── Placeholder ───────────────────────────────────────────────

/**
 * Retrieves resolved workouts for a Notion page.
 *
 * This is a placeholder that will be replaced once the full Notion
 * sync + exercise resolution pipeline is wired up. Currently returns
 * an empty array, causing the push route to return a clear error
 * message asking the user to sync from Notion first.
 *
 * When the pipeline is ready, this will:
 *   1. Read the cached page content from the DB
 *   2. Parse the markdown into ParsedWorkout[]
 *   3. Resolve exercises via the 3-tier resolver
 *   4. Return ResolvedWorkout[]
 */
async function getResolvedWorkoutsForPage(
  _userId: string,
  _pageId: string,
): Promise<ResolvedWorkout[]> {
  // TODO: Connect to Notion page cache + parser + resolver pipeline
  return [];
}
