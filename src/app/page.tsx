import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getServerSession } from "@/lib/auth/session";

export default async function Home() {
  const session = await getServerSession();
  if (session.isLoggedIn) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold tracking-tight">
            GarminMD
          </CardTitle>
          <CardDescription className="text-base">
            Plan in Notion. Train with Garmin. Get coached by AI.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6">
          <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-primary">1.</span>
              <span>
                Write your workout plan in Notion — exercises, sets, reps,
                weights.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-primary">2.</span>
              <span>
                GarminMD pushes your plan to Garmin Connect. Sync your watch and
                train.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-primary">3.</span>
              <span>
                After each session, get AI coaching — plan vs actual comparison,
                progression insights, and next-step recommendations.
              </span>
            </li>
          </ul>
          <a
            href="/login"
            className={buttonVariants({ size: "lg", className: "w-full" })}
          >
            Get Started
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
