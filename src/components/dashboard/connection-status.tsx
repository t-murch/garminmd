import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

interface ConnectionStatusProps {
  notionConnected: boolean;
  notionPageCount: number;
  garminConnected: boolean;
  garminEmail: string | null;
}

export function ConnectionStatus({
  notionConnected,
  notionPageCount,
  garminConnected,
  garminEmail,
}: ConnectionStatusProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card size="sm">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-sm">Notion</CardTitle>
          {notionConnected ? (
            <Badge variant="secondary" className="bg-green-600/10 text-green-700 dark:text-green-400">
              Connected
            </Badge>
          ) : (
            <Badge variant="outline">Disconnected</Badge>
          )}
        </CardHeader>
        <CardContent>
          {notionConnected ? (
            <p className="text-sm text-muted-foreground">
              {notionPageCount} page{notionPageCount !== 1 ? "s" : ""} synced
            </p>
          ) : (
            <a
              href="/onboarding"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Connect
            </a>
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-sm">Garmin</CardTitle>
          {garminConnected ? (
            <Badge variant="secondary" className="bg-green-600/10 text-green-700 dark:text-green-400">
              Connected
            </Badge>
          ) : (
            <Badge variant="outline">Disconnected</Badge>
          )}
        </CardHeader>
        <CardContent>
          {garminConnected && garminEmail ? (
            <p className="text-sm text-muted-foreground">{garminEmail}</p>
          ) : (
            <a
              href="/onboarding"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Connect
            </a>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
