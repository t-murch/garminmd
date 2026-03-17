import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import {
  getUserById,
  getGarminConnection,
  getNotionPages,
} from "@/lib/db/queries";
import { decrypt } from "@/lib/utils/crypto";
import { getNotionAuthUrl } from "@/lib/notion/oauth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { Separator } from "@/components/ui/separator";
import { GarminSettingsForm } from "@/components/dashboard/garmin-settings-form";

export default async function SettingsPage() {
  const session = await getServerSession();
  if (!session.isLoggedIn) {
    redirect("/login");
  }

  const user = await getUserById(session.userId);
  if (!user) {
    redirect("/login");
  }

  const [garminConn, notionPageRows] = await Promise.all([
    getGarminConnection(session.userId),
    getNotionPages(session.userId),
  ]);

  let garminEmail: string | null = null;
  if (garminConn) {
    try {
      garminEmail = decrypt(garminConn.garminEmail);
    } catch {
      garminEmail = "(encrypted)";
    }
  }

  const notionAuthUrl = getNotionAuthUrl();

  const notionPages = notionPageRows.map((p) => ({
    id: p.id,
    pageTitle: p.pageTitle,
    lastParsedAt: p.lastParsedAt,
  }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      {/* Notion section */}
      <Card>
        <CardHeader>
          <CardTitle>Notion Connection</CardTitle>
          <CardDescription>
            Manage your Notion integration and synced pages.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Status</span>
              {notionPages.length > 0 ? (
                <Badge
                  variant="secondary"
                  className="bg-green-600/10 text-green-700 dark:text-green-400"
                >
                  Connected
                </Badge>
              ) : (
                <Badge variant="outline">No pages synced</Badge>
              )}
            </div>
            <a
              href={notionAuthUrl}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Reconnect Notion
            </a>
          </div>

          {notionPages.length > 0 && (
            <>
              <Separator />
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Synced Pages</span>
                {notionPages.map((page) => (
                  <div
                    key={page.id}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                  >
                    <span>{page.pageTitle}</span>
                    {page.lastParsedAt && (
                      <span className="text-xs text-muted-foreground">
                        Last parsed:{" "}
                        {new Date(page.lastParsedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Garmin section */}
      <Card>
        <CardHeader>
          <CardTitle>Garmin Connection</CardTitle>
          <CardDescription>
            Manage your Garmin Connect credentials.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Status</span>
            {garminConn ? (
              <Badge
                variant="secondary"
                className="bg-green-600/10 text-green-700 dark:text-green-400"
              >
                Connected
              </Badge>
            ) : (
              <Badge variant="outline">Disconnected</Badge>
            )}
            {garminEmail && (
              <span className="text-sm text-muted-foreground">
                ({garminEmail})
              </span>
            )}
          </div>

          <Separator />

          <GarminSettingsForm connected={!!garminConn} />
        </CardContent>
      </Card>
    </div>
  );
}
