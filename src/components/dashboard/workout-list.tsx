"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { timeAgo } from "@/lib/utils/time";

interface Workout {
  id: string;
  workoutName: string;
  garminWorkoutId: string | null;
  lastPushedAt: number | null;
  notionPageId: string | null;
}

interface NotionPage {
  id: string;
  notionPageId: string;
  pageTitle: string;
  lastParsedAt: number | null;
}

interface WorkoutListProps {
  workouts: Workout[];
  notionPages: NotionPage[];
}

export function WorkoutList({ workouts, notionPages }: WorkoutListProps) {
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSyncAll() {
    if (notionPages.length === 0) return;
    setSyncingAll(true);
    setError(null);
    try {
      // Sync each page
      for (const page of notionPages) {
        const res = await fetch("/api/notion/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageId: page.notionPageId }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Failed to sync "${page.pageTitle}"`);
        }
      }
      // Reload to show fresh data
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncingAll(false);
    }
  }

  async function handleResync(workout: Workout) {
    if (!workout.notionPageId) return;
    setSyncing(workout.id);
    setError(null);
    try {
      const res = await fetch("/api/garmin/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: workout.notionPageId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to re-sync");
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-sync failed");
    } finally {
      setSyncing(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Workouts</h2>
        {notionPages.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncAll}
            disabled={syncingAll}
          >
            {syncingAll ? "Syncing..." : "Sync All from Notion"}
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {workouts.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No workouts synced yet. Connect Notion and push your first
            workouts from the onboarding flow.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {workouts.map((workout) => (
            <Card key={workout.id} size="sm">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-sm">
                  {workout.workoutName}
                </CardTitle>
                <CardAction>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleResync(workout)}
                    disabled={syncing === workout.id || !workout.notionPageId}
                  >
                    {syncing === workout.id ? "Syncing..." : "Re-sync"}
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
                {workout.garminWorkoutId && (
                  <Badge variant="secondary" className="text-xs">
                    On Garmin
                  </Badge>
                )}
                {workout.lastPushedAt && (
                  <span className="text-xs">
                    Last synced {timeAgo(workout.lastPushedAt)}
                  </span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
