import { redirect } from "next/navigation";
import { ConnectionStatus } from "@/components/dashboard/connection-status";
import { ThisWeek } from "@/components/dashboard/this-week";
import { WorkoutList } from "@/components/dashboard/workout-list";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button-variants";
import { getServerSession } from "@/lib/auth/session";
import {
  getGarminConnection,
  getGarminWorkouts,
  getNotionPages,
  getUserById,
} from "@/lib/db/queries";
import { decrypt } from "@/lib/utils/crypto";

export default async function DashboardPage() {
  const session = await getServerSession();
  if (!session.isLoggedIn) {
    redirect("/login");
  }

  const user = await getUserById(session.userId);
  if (!user) {
    redirect("/login");
  }

  const [garminConn, notionPageRows, workoutRows] = await Promise.all([
    getGarminConnection(session.userId),
    getNotionPages(session.userId),
    getGarminWorkouts(session.userId),
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

      {workouts.length > 0 && <ThisWeek workouts={workouts} />}

      <WorkoutList workouts={workouts} notionPages={notionPages} />
    </div>
  );
}
