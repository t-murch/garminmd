import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ActivityData {
  activityName: string | null;
  rawData: string | null;
  startTime: number | null;
  matchedWorkoutId: string | null;
}

interface PerformanceWidgetProps {
  activities: ActivityData[];
}

interface ExerciseEntry {
  name: string;
  weights: { weight: number; time: number }[];
}

/**
 * Parse rawData JSON to extract exercise names and weights from exercise sets.
 * rawData format: { exerciseSets: [{ exerciseName, sets: [{ weight }] }] }
 */
function extractExerciseData(
  activities: ActivityData[],
): Map<string, ExerciseEntry> {
  const exercises = new Map<string, ExerciseEntry>();

  for (const activity of activities) {
    if (!activity.rawData) continue;

    let raw: { exerciseSets?: Array<{ exerciseName?: string; category?: string; sets?: Array<{ weight?: number }> }> };
    try {
      raw = JSON.parse(activity.rawData);
    } catch {
      continue;
    }

    if (!raw.exerciseSets) continue;

    for (const exerciseSet of raw.exerciseSets) {
      const name =
        exerciseSet.exerciseName ?? exerciseSet.category ?? "Unknown";
      const maxWeight = Math.max(
        0,
        ...(exerciseSet.sets ?? []).map((s) => s.weight ?? 0),
      );
      if (maxWeight <= 0) continue;

      const entry = exercises.get(name) ?? { name, weights: [] };
      entry.weights.push({
        weight: maxWeight,
        time: activity.startTime ?? 0,
      });
      exercises.set(name, entry);
    }
  }

  return exercises;
}

export function PerformanceWidget({ activities }: PerformanceWidgetProps) {
  const exercises = extractExerciseData(activities);

  if (exercises.size === 0) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Performance</h2>
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Complete some workouts to see your progression.
          </CardContent>
        </Card>
      </div>
    );
  }

  // Sort by frequency (most sets tracked), take top 6
  const topExercises = Array.from(exercises.values())
    .sort((a, b) => b.weights.length - a.weights.length)
    .slice(0, 6);

  // For each exercise, find most recent weight and previous weight
  const rows = topExercises.map((ex) => {
    const sorted = ex.weights.sort((a, b) => b.time - a.time);
    const current = sorted[0].weight;
    const previous = sorted.length > 1 ? sorted[1].weight : null;

    let changePercent: number | null = null;
    let direction: "up" | "down" | "same" = "same";
    if (previous !== null && previous > 0) {
      changePercent = Math.round(((current - previous) / previous) * 100);
      if (changePercent > 0) direction = "up";
      else if (changePercent < 0) direction = "down";
    }

    return { name: ex.name, current, changePercent, direction };
  });

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Performance</h2>
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">
            Weight Progression
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            {rows.map((row) => (
              <div
                key={row.name}
                className="flex items-center justify-between text-sm"
              >
                <span className="truncate font-medium">{formatExerciseName(row.name)}</span>
                <div className="ml-4 flex items-center gap-2 tabular-nums">
                  <span>{row.current} kg</span>
                  {row.changePercent !== null && row.changePercent !== 0 && (
                    <span
                      className={
                        row.direction === "up"
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-500 dark:text-red-400"
                      }
                    >
                      {row.direction === "up" ? "+" : ""}
                      {row.changePercent}%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Format a Garmin-style exercise name (e.g. "DUMBBELL_BENCH_PRESS")
 * into a readable form ("Dumbbell Bench Press").
 */
function formatExerciseName(name: string): string {
  return name
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
