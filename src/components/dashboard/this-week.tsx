"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

interface Workout {
  id: string;
  workoutName: string;
  garminWorkoutId: string | null;
  lastPushedAt: number | null;
}

interface Activity {
  activityName: string | null;
  startTime: number | null;
  matchedWorkoutId: string | null;
}

interface ThisWeekProps {
  workouts: Workout[];
  activities?: Activity[];
}

/**
 * Attempts to match a workout name to a day of week by checking if the
 * workout name contains a day keyword (e.g. "Monday Push" -> Mon).
 */
function matchDay(workoutName: string): string | null {
  const lower = workoutName.toLowerCase();
  const dayMap: Record<string, string> = {
    monday: "Mon",
    tuesday: "Tue",
    wednesday: "Wed",
    thursday: "Thu",
    friday: "Fri",
    saturday: "Sat",
    sunday: "Sun",
    mon: "Mon",
    tue: "Tue",
    wed: "Wed",
    thu: "Thu",
    fri: "Fri",
    sat: "Sat",
    sun: "Sun",
  };
  for (const [keyword, day] of Object.entries(dayMap)) {
    if (lower.includes(keyword)) return day;
  }
  return null;
}

export function ThisWeek({ workouts, activities = [] }: ThisWeekProps) {
  // Build a map of day -> workout
  const dayWorkouts = new Map<string, Workout>();
  for (const w of workouts) {
    const day = matchDay(w.workoutName);
    if (day) {
      dayWorkouts.set(day, w);
    }
  }

  // Build a set of completed workout IDs from activities
  const completedWorkoutIds = new Set<string>();
  for (const a of activities) {
    if (a.matchedWorkoutId) {
      completedWorkoutIds.add(a.matchedWorkoutId);
    }
  }

  // If no workouts match any day, don't render
  if (dayWorkouts.size === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">This Week</h2>
      <div className="grid grid-cols-7 gap-2">
        {DAYS.map((day) => {
          const workout = dayWorkouts.get(day);
          return (
            <Card
              key={day}
              size="sm"
              className={!workout ? "opacity-40" : ""}
            >
              <CardHeader>
                <CardTitle className="text-center text-xs uppercase tracking-wide text-muted-foreground">
                  {day}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-1">
                {workout ? (
                  <>
                    <span className="text-center text-xs font-medium leading-tight">
                      {workout.workoutName
                        .replace(/monday|tuesday|wednesday|thursday|friday|saturday|sunday/gi, "")
                        .trim()
                        .replace(/^[-—:]\s*/, "") || workout.workoutName}
                    </span>
                    {completedWorkoutIds.has(workout.id) ? (
                      <Badge variant="secondary" className="mt-1 text-[10px] bg-green-600/10 text-green-700 dark:text-green-400">
                        Done
                      </Badge>
                    ) : workout.garminWorkoutId ? (
                      <Badge variant="secondary" className="mt-1 text-[10px]">
                        Synced
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="mt-1 text-[10px]">
                        Pending
                      </Badge>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">--</span>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
