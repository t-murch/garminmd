"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ErrorBanner } from "@/components/ui/error-banner";
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
  garminConnected?: boolean;
}

export function WorkoutList({ workouts, notionPages, garminConnected }: WorkoutListProps) {
  const router = useRouter();
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [pullingGarmin, setPullingGarmin] = useState(false);
  const [pullResult, setPullResult] = useState<string | null>(null);
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
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncingAll(false);
    }
  }

  async function handlePullGarmin() {
    setPullingGarmin(true);
    setError(null);
    setPullResult(null);
    try {
      const res = await fetch("/api/garmin/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to pull from Garmin");
      }
      const data = await res.json();
      setPullResult(
        `Pulled ${data.pulled} activities, ${data.matched} matched`,
      );
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pull failed");
    } finally {
      setPullingGarmin(false);
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
      router.refresh();
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
        <div className="flex items-center gap-2">
          {garminConnected && (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePullGarmin}
              disabled={pullingGarmin}
            >
              {pullingGarmin ? "Pulling..." : "Sync from Garmin"}
            </Button>
          )}
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
      </div>

      {pullResult && (
        <div className="rounded-lg border border-green-500/50 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          {pullResult}
        </div>
      )}

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {workouts.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No workouts synced yet. Connect Notion and push your first workouts
            from the onboarding flow.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {workouts.map((workout) => (
            <Card key={workout.id} size="sm">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-sm">{workout.workoutName}</CardTitle>
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
