import type { PlanContext, ActualContext } from "@/lib/core/types";

export const AUTO_INSIGHT_SYSTEM_PROMPT = `You are a strength training coach analyzing a single workout session.
Compare the planned workout against what was actually performed.
Be specific, encouraging, and actionable. Keep insights to 2-3 sentences each.

Respond with JSON only:
{
  "insights": [
    { "type": "rep_completion" | "weight_progression" | "fatigue" | "streak" | "general", "message": "..." }
  ]
}`;

export const DEEP_ANALYSIS_SYSTEM_PROMPT = `You are a strength training coach analyzing multiple weeks of training data.
Look for trends in progression, muscle balance, recovery patterns, and program effectiveness.
Be specific with numbers and percentages. Give actionable recommendations.

Respond with JSON only:
{
  "sections": [
    { "title": "...", "content": "...", "type": "progression" | "balance" | "recovery" | "suggestion" }
  ]
}`;

/**
 * Formats a single workout's plan and actual data into a readable string
 * for the LLM to compare.
 */
export function buildAutoInsightContext(
  plan: PlanContext,
  actual: ActualContext,
): string {
  const lines: string[] = [];

  lines.push("## Planned Workout");
  lines.push(`Workout: ${plan.workoutName}`);
  lines.push("");
  lines.push("| Exercise | Sets | Reps | Weight |");
  lines.push("| --- | --- | --- | --- |");
  for (const ex of plan.exercises) {
    const weight =
      ex.weight != null
        ? `${ex.weight} ${ex.weightUnit ?? "lbs"}`
        : "bodyweight";
    lines.push(
      `| ${ex.name} | ${ex.sets} | ${ex.reps ?? "—"} | ${weight} |`,
    );
  }

  lines.push("");
  lines.push("## Actual Performance");
  lines.push(`Activity: ${actual.activityName}`);
  lines.push(`Duration: ${Math.round(actual.duration / 60)} minutes`);
  if (actual.totalReps != null) {
    lines.push(`Total reps recorded: ${actual.totalReps}`);
  }

  if (actual.exerciseSets.length > 0) {
    lines.push("");
    lines.push("| Exercise | Set # | Reps | Weight |");
    lines.push("| --- | --- | --- | --- |");
    for (const set of actual.exerciseSets) {
      const name = set.exerciseName ?? set.category ?? "Unknown";
      const weight =
        set.weight != null
          ? `${set.weight} ${set.weightUnit ?? "lbs"}`
          : "bodyweight";
      lines.push(
        `| ${name} | ${set.setOrder} | ${set.reps ?? "—"} | ${weight} |`,
      );
    }
  } else {
    lines.push("No per-set data available. Provide general feedback.");
  }

  return lines.join("\n");
}

/**
 * Formats multi-week plan and actual data for deep analysis.
 */
export function buildDeepAnalysisContext(
  plans: PlanContext[],
  actuals: ActualContext[],
  weekCount: number,
): string {
  const lines: string[] = [];

  lines.push(`## Training Data — Last ${weekCount} Weeks`);
  lines.push(`Total planned sessions: ${plans.length}`);
  lines.push(`Total completed activities: ${actuals.length}`);

  if (plans.length > 0) {
    const completionRate =
      actuals.length > 0
        ? Math.round((actuals.length / plans.length) * 100)
        : 0;
    lines.push(`Completion rate: ${completionRate}%`);
  }

  lines.push("");
  lines.push("## Planned Sessions");
  for (const plan of plans) {
    lines.push("");
    lines.push(`### ${plan.workoutName}`);
    lines.push("| Exercise | Sets | Reps | Weight |");
    lines.push("| --- | --- | --- | --- |");
    for (const ex of plan.exercises) {
      const weight =
        ex.weight != null
          ? `${ex.weight} ${ex.weightUnit ?? "lbs"}`
          : "bodyweight";
      lines.push(
        `| ${ex.name} | ${ex.sets} | ${ex.reps ?? "—"} | ${weight} |`,
      );
    }
  }

  lines.push("");
  lines.push("## Completed Activities");
  for (const actual of actuals) {
    lines.push("");
    lines.push(`### ${actual.activityName}`);
    lines.push(`Duration: ${Math.round(actual.duration / 60)} minutes`);
    if (actual.totalReps != null) {
      lines.push(`Total reps: ${actual.totalReps}`);
    }

    if (actual.exerciseSets.length > 0) {
      lines.push("| Exercise | Set # | Reps | Weight |");
      lines.push("| --- | --- | --- | --- |");
      for (const set of actual.exerciseSets) {
        const name = set.exerciseName ?? set.category ?? "Unknown";
        const weight =
          set.weight != null
            ? `${set.weight} ${set.weightUnit ?? "lbs"}`
            : "bodyweight";
        lines.push(
          `| ${name} | ${set.setOrder} | ${set.reps ?? "—"} | ${weight} |`,
        );
      }
    }
  }

  lines.push("");
  lines.push(
    "Analyze progression, muscle balance, recovery patterns, and provide actionable suggestions.",
  );

  return lines.join("\n");
}
