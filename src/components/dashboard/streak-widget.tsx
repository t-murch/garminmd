import {
  Card,
  CardContent,
} from "@/components/ui/card";

interface StreakWidgetProps {
  activities: Array<{ startTime: number | null }>;
  workoutCount: number;
}

/**
 * Calculate the current streak: consecutive days (up to today)
 * with at least one activity.
 */
function calculateStreak(activities: Array<{ startTime: number | null }>): number {
  if (activities.length === 0) return 0;

  // Collect unique dates (as YYYY-MM-DD strings) with activity
  const activeDays = new Set<string>();
  for (const a of activities) {
    if (a.startTime) {
      const d = new Date(a.startTime);
      activeDays.add(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      );
    }
  }

  if (activeDays.size === 0) return 0;

  // Walk backwards from today counting consecutive days
  let streak = 0;
  const now = new Date();
  // Start from today
  for (let i = 0; i < 365; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (activeDays.has(key)) {
      streak++;
    } else if (i === 0) {
      // Today might not have an activity yet — skip it and check yesterday
      continue;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Count activities that fall within the current week (Mon-Sun).
 */
function activitiesThisWeek(activities: Array<{ startTime: number | null }>): number {
  const now = new Date();
  // Get Monday of the current week
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(monday.getDate() - mondayOffset);
  monday.setHours(0, 0, 0, 0);

  const mondayMs = monday.getTime();

  return activities.filter(
    (a) => a.startTime !== null && a.startTime >= mondayMs,
  ).length;
}

export function StreakWidget({ activities, workoutCount }: StreakWidgetProps) {
  const streak = calculateStreak(activities);
  const thisWeek = activitiesThisWeek(activities);
  const weekTarget = Math.max(workoutCount, 1);

  if (activities.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Start training to build your streak!
        </CardContent>
      </Card>
    );
  }

  const completionPct = Math.min(
    100,
    Math.round((thisWeek / weekTarget) * 100),
  );

  return (
    <Card size="sm">
      <CardContent>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className="text-3xl font-bold tabular-nums">{streak}</span>
            <span className="text-sm text-muted-foreground">
              day streak
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">
                {thisWeek}/{weekTarget} workouts this week
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {completionPct}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-primary transition-all"
                style={{ width: `${completionPct}%` }}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
