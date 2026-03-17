"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import type { ParsedWorkout } from "@/lib/core/types";

interface SyncResultItem {
  workoutName: string;
  action: "created" | "updated" | "unchanged";
  garminWorkoutId?: string;
}

interface WorkoutPreviewProps {
  pageId: string;
  workouts: ParsedWorkout[];
}

export function WorkoutPreview({ pageId, workouts }: WorkoutPreviewProps) {
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SyncResultItem[] | null>(null);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/garmin/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to sync workouts");
      }
      setResults(data.results);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to sync workouts",
      );
    } finally {
      setSyncing(false);
    }
  }

  function getStatusBadge(action: SyncResultItem["action"]) {
    switch (action) {
      case "created":
        return <Badge className="bg-green-600/10 text-green-700 dark:text-green-400">Created</Badge>;
      case "updated":
        return <Badge className="bg-yellow-600/10 text-yellow-700 dark:text-yellow-400">Updated</Badge>;
      case "unchanged":
        return <Badge variant="outline">Unchanged</Badge>;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2">
        {workouts.map((workout, i) => {
          const result = results?.find(
            (r) => r.workoutName === workout.name,
          );
          return (
            <Card key={i} size="sm">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-sm">{workout.name}</CardTitle>
                {result && getStatusBadge(result.action)}
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                  {workout.dayOfWeek && (
                    <span>{workout.dayOfWeek}</span>
                  )}
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
          );
        })}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!results && (
        <Button onClick={handleSync} disabled={syncing} size="lg">
          {syncing ? (
            <>
              <Spinner className="mr-2" />
              Syncing...
            </>
          ) : (
            "Sync All to Garmin"
          )}
        </Button>
      )}

      {results && (
        <p className="text-center text-sm text-muted-foreground">
          {results.filter((r) => r.action === "created").length} created,{" "}
          {results.filter((r) => r.action === "updated").length} updated,{" "}
          {results.filter((r) => r.action === "unchanged").length} unchanged.
          Sync your watch to see them.
        </p>
      )}
    </div>
  );
}

