import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { getNotionAuthUrl } from "@/lib/notion/oauth";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const notionUrl = getNotionAuthUrl();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold tracking-tight">
            GarminMD
          </CardTitle>
          <CardDescription>
            Plan in Notion. Train with Garmin. Get coached by AI.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <LoginError searchParams={searchParams} />
          <p className="text-center text-sm text-muted-foreground">
            Connect your Notion workspace to get started. GarminMD reads your
            training plan, pushes workouts to your Garmin watch, and delivers
            AI coaching insights after every session.
          </p>
          <a
            href={notionUrl}
            className={buttonVariants({ size: "lg", className: "w-full" })}
          >
            Connect with Notion
          </a>
        </CardContent>
      </Card>
    </div>
  );
}

async function LoginError({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  if (!params.error) return null;

  const messages: Record<string, string> = {
    no_code: "Notion did not return an authorization code. Please try again.",
    token_exchange: "Failed to connect to Notion. Please try again.",
    unknown: "Something went wrong. Please try again.",
  };

  return (
    <div className="w-full rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {messages[params.error] ?? messages.unknown}
    </div>
  );
}
