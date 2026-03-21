"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { ParsedWorkout } from "@/lib/core/types";

interface NotionPage {
  id: string;
  title: string;
}

interface SyncResult {
  pageId: string;
  title: string;
  workoutCount: number;
  workouts: ParsedWorkout[];
}

interface PageSelectorProps {
  selectedPageId: string | null;
  onPageSelected: (
    pageId: string,
    pageTitle: string,
    workouts: ParsedWorkout[],
  ) => void;
}

export function PageSelector({
  selectedPageId,
  onPageSelected,
}: PageSelectorProps) {
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  useEffect(() => {
    async function fetchPages() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/notion/pages");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to fetch pages");
        }
        const data: NotionPage[] = await res.json();
        setPages(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch pages");
      } finally {
        setLoading(false);
      }
    }
    fetchPages();
  }, []);

  async function handleSelect(page: NotionPage) {
    setSyncing(true);
    setError(null);
    setSyncResult(null);
    try {
      const res = await fetch("/api/notion/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: page.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to sync page");
      }
      const data: SyncResult = await res.json();
      setSyncResult(data);
      onPageSelected(page.id, page.title, data.workouts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync page");
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner className="text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">
          Loading your Notion pages...
        </span>
      </div>
    );
  }

  if (error) {
    return <ErrorBanner>{error}</ErrorBanner>;
  }

  if (pages.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No pages found. Make sure you shared at least one page with the GarminMD
        integration in Notion.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2">
        {pages.map((page) => (
          <Card
            key={page.id}
            className={`cursor-pointer transition-colors hover:bg-muted/50 ${
              selectedPageId === page.id ? "ring-2 ring-primary" : ""
            }`}
            size="sm"
            onClick={() => !syncing && handleSelect(page)}
          >
            <CardContent className="flex items-center justify-between">
              <span className="font-medium">{page.title}</span>
              {selectedPageId === page.id && (
                <Badge variant="secondary">Selected</Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {syncing && (
        <div className="flex items-center justify-center py-4">
          <LoadingSpinner className="text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">
            Parsing workout tables...
          </span>
        </div>
      )}

      {syncResult && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          Found {syncResult.workoutCount} workout session
          {syncResult.workoutCount !== 1 ? "s" : ""} in &ldquo;
          {syncResult.title}&rdquo; with{" "}
          {syncResult.workouts.reduce((sum, w) => sum + w.exercises.length, 0)}{" "}
          total exercises.
        </div>
      )}
    </div>
  );
}
