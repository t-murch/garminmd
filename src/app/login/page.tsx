import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ErrorBanner } from "@/components/ui/error-banner";
import { NotionConnectButton } from "@/components/ui/notion-connect-button";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  const errorMessages: Record<string, string> = {
    no_code: "Notion did not return an authorization code. Please try again.",
    token_exchange: "Failed to connect to Notion. Please try again.",
    csrf: "Security validation failed. Please try again.",
    unknown: "Something went wrong. Please try again.",
  };

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
          {params.error && (
            <ErrorBanner>
              {errorMessages[params.error] ?? errorMessages.unknown}
            </ErrorBanner>
          )}
          <p className="text-center text-sm text-muted-foreground">
            Connect your Notion workspace to get started. GarminMD reads your
            training plan, pushes workouts to your Garmin watch, and delivers AI
            coaching insights after every session.
          </p>
          <NotionConnectButton size="lg" className="w-full">
            Connect with Notion
          </NotionConnectButton>
        </CardContent>
      </Card>
    </div>
  );
}
