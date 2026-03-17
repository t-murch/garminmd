"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/utils/time";

interface InsightData {
  id: string;
  insightType: string;
  content: string;
  createdAt: number;
  activityId: string | null;
}

interface InsightFeedProps {
  insights: InsightData[];
}

export function InsightFeed({ insights }: InsightFeedProps) {
  const router = useRouter();
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDeepAnalysis() {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weeks: 4 }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Analysis failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Coaching Insights</h2>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {insights.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No coaching insights yet. Sync your Garmin activities to get
            started.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {insights.map((insight) => (
            <Card key={insight.id} size="sm">
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      insight.insightType === "deep" ? "default" : "secondary"
                    }
                    className="text-[10px]"
                  >
                    {insight.insightType === "deep" ? "Deep" : "Auto"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {timeAgo(insight.createdAt)}
                  </span>
                </div>
                <p className="text-sm leading-relaxed">{insight.content}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={handleDeepAnalysis}
        disabled={analyzing}
        className="self-start"
      >
        {analyzing ? "Analyzing..." : "Deep Analysis"}
      </Button>
    </div>
  );
}
