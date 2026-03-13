import Anthropic from "@anthropic-ai/sdk";
import type {
  ExerciseDictionaryEntry,
  GarminExerciseType,
} from "@/lib/core/types";

const SYSTEM_PROMPT = `You are an exercise name resolver for Garmin Connect. Given an exercise name from a user's workout plan, find the best matching exercise from the Garmin exercise dictionary.

Rules:
- Match the exercise intent, not just keywords. "Cable Overhead Tricep Pull" is a triceps extension.
- Consider equipment type (cable, dumbbell, barbell, machine, bodyweight).
- Consider the muscle group and movement pattern.
- If no good match exists, say so with low confidence.

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "category": "GARMIN_CATEGORY",
  "exerciseName": "GARMIN_EXERCISE_NAME",
  "categoryId": 0,
  "exerciseNameId": 0,
  "confidence": 0.95
}

If you cannot find a reasonable match, respond with:
{ "confidence": 0 }`;

/**
 * Tier 2: LLM-based exercise resolution.
 *
 * Sends the raw exercise name and the full dictionary to Claude, which picks
 * the best match. Returns null if confidence is below 0.7.
 */
export async function llmMatch(
  rawName: string,
  dictionary: ExerciseDictionaryEntry[],
): Promise<{ garminType: GarminExerciseType; confidence: number } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn(
      "ANTHROPIC_API_KEY not set — skipping LLM exercise resolution",
    );
    return null;
  }

  const client = new Anthropic({ apiKey });

  // Build a compact dictionary summary for context
  const dictSummary = dictionary
    .map(
      (e) =>
        `${e.name} → ${e.garminCategory}/${e.garminExerciseName} (catId: ${e.garminCategoryId}, exId: ${e.garminExerciseNameId})`,
    )
    .join("\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Exercise to resolve: "${rawName}"\n\nAvailable Garmin exercises:\n${dictSummary}`,
      },
    ],
  });

  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "";

  try {
    const parsed = JSON.parse(text);
    const confidence = parsed.confidence ?? 0;

    if (confidence < 0.7) return null;

    return {
      garminType: {
        category: parsed.category,
        exerciseName: parsed.exerciseName,
        categoryId: parsed.categoryId,
        exerciseNameId: parsed.exerciseNameId,
      },
      confidence,
    };
  } catch {
    console.warn("Failed to parse LLM response for exercise resolution:", text);
    return null;
  }
}
