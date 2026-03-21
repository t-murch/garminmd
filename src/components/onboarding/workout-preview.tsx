"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ParsedWorkout } from "@/lib/core/types";

interface WorkoutPreviewProps {
  pageId: string;
  workouts: ParsedWorkout[];
}

export function WorkoutPreview({ workouts }: WorkoutPreviewProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2">
        {workouts.map((workout) => (
          <Card key={`${workout.name}-${workout.dayOfWeek ?? ""}`} size="sm">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-sm">{workout.name}</CardTitle>
              <Badge variant="outline">Preview</Badge>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                {workout.dayOfWeek && <span>{workout.dayOfWeek}</span>}
                <span>
                  {workout.exercises.length} exercise
                  {workout.exercises.length !== 1 ? "s" : ""}
                </span>
                <span className="text-xs">
                  {workout.exercises
                    .slice(0, 3)
                    .map((e) => e.rawName)
                    .join(", ")}
                  {workout.exercises.length > 3 &&
                    ` +${workout.exercises.length - 3} more`}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="rounded-lg border border-muted bg-muted/30 px-4 py-3 text-center text-sm text-muted-foreground">
        Garmin push will be available once the exercise resolver pipeline is
        connected. Click Finish to continue to your dashboard.
      </p>
    </div>
  );
}
