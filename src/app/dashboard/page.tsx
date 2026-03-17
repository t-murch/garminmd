import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import {
  getUserById,
  getGarminConnection,
  getNotionPages,
  getGarminWorkouts,
  getInsights,
  getGarminActivities,
} from "@/lib/db/queries";
import { decrypt } from "@/lib/utils/crypto";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button-variants";
import { ConnectionStatus } from "@/components/dashboard/connection-status";
import { WorkoutList } from "@/components/dashboard/workout-list";
import { ThisWeek } from "@/components/dashboard/this-week";
import { InsightFeed } from "@/components/dashboard/insight-feed";
import { PerformanceWidget } from "@/components/dashboard/performance-widget";
import { StreakWidget } from "@/components/dashboard/streak-widget";

export default async function DashboardPage() {
  const session = await getServerSession();
  if (!session.isLoggedIn) {
    redirect("/login");
  }

  const user = await getUserById(session.userId);
  if (!user) {
    redirect("/login");
  }

  const [garminConn, notionPageRows, workoutRows, insightRows, activityRows] =
    await Promise.all([
      getGarminConnection(session.userId),
      getNotionPages(session.userId),
      getGarminWorkouts(session.userId),
      getInsights(session.userId, 5),
      getGarminActivities(session.userId, 20),
    ]);

  const needsOnboarding = notionPageRows.length === 0 || !garminConn;

  // Decrypt Garmin email for display (best-effort)
  let garminEmail: string | null = null;
  if (garminConn) {
    try {
      garminEmail = decrypt(garminConn.garminEmail);
    } catch {
      garminEmail = "(encrypted)";
    }
  }

  // Serialize for client components
  const notionPages = notionPageRows.map((p) => ({
    id: p.id,
    notionPageId: p.notionPageId,
    pageTitle: p.pageTitle,
    lastParsedAt: p.lastParsedAt,
  }));

  const workouts = workoutRows.map((w) => ({
    id: w.id,
    workoutName: w.workoutName,
    garminWorkoutId: w.garminWorkoutId,
    lastPushedAt: w.lastPushedAt,
    notionPageId: w.notionPageId,
  }));

  const insights = insightRows.map((i) => ({
    id: i.id,
    insightType: i.insightType,
    content: i.content,
    createdAt: i.createdAt,
    activityId: i.activityId,
  }));

  const activities = activityRows.map((a) => ({
    activityName: a.activityName,
    rawData: a.rawData,
    startTime: a.startTime,
    matchedWorkoutId: a.matchedWorkoutId,
  }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>

      {needsOnboarding && (
        <Alert>
          <AlertTitle>Setup incomplete</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>
              {!garminConn
                ? "Connect your Garmin account to start syncing workouts."
                : "Sync a Notion page to see your workouts here."}
            </span>
            <a
              href="/onboarding"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Complete Setup
            </a>
          </AlertDescription>
        </Alert>
      )}

      <ConnectionStatus
        notionConnected={notionPageRows.length > 0}
        notionPageCount={notionPageRows.length}
        garminConnected={!!garminConn}
        garminEmail={garminEmail}
      />

      {workouts.length > 0 && (
        <ThisWeek workouts={workouts} activities={activities} />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <InsightFeed insights={insights} />
        </div>
        <div>
          <PerformanceWidget activities={activities} />
        </div>
      </div>

      <StreakWidget activities={activities} workoutCount={workouts.length} />

      <WorkoutList
        workouts={workouts}
        notionPages={notionPages}
        garminConnected={!!garminConn}
      />
    </div>
  );
}
