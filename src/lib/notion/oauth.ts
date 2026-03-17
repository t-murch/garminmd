/**
 * Notion OAuth helpers.
 *
 * getNotionAuthUrl()        — builds the authorization redirect URL
 * exchangeCodeForToken()    — swaps an auth code for an access token
 */

const NOTION_AUTH_URL = "https://api.notion.com/v1/oauth/authorize";
const NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token";

function getClientId(): string {
  const id = process.env.NOTION_CLIENT_ID;
  if (!id) throw new Error("NOTION_CLIENT_ID environment variable is required");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.NOTION_CLIENT_SECRET;
  if (!secret)
    throw new Error("NOTION_CLIENT_SECRET environment variable is required");
  return secret;
}

function getRedirectUri(): string {
  return (
    process.env.NOTION_REDIRECT_URI || "http://localhost:3000/api/notion/callback"
  );
}

/** Returns the full Notion OAuth authorization URL the browser should navigate to. */
export function getNotionAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    response_type: "code",
    redirect_uri: getRedirectUri(),
    owner: "user",
    state,
  });
  return `${NOTION_AUTH_URL}?${params.toString()}`;
}

export interface NotionTokenResponse {
  accessToken: string;
  workspaceId: string;
  workspaceName: string;
  botId: string;
  owner: {
    type: "user";
    user: {
      id: string;
      name: string | null;
      avatarUrl: string | null;
    };
  };
}

/**
 * Exchange a Notion OAuth authorization code for an access token.
 *
 * POST https://api.notion.com/v1/oauth/token
 * Auth: Basic base64(client_id:client_secret)
 */
export async function exchangeCodeForToken(
  code: string,
): Promise<NotionTokenResponse> {
  const credentials = Buffer.from(
    `${getClientId()}:${getClientSecret()}`,
  ).toString("base64");

  const res = await fetch(NOTION_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: getRedirectUri(),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion token exchange failed (${res.status}): ${body}`);
  }

  const data = await res.json();

  return {
    accessToken: data.access_token,
    workspaceId: data.workspace_id,
    workspaceName: data.workspace_name,
    botId: data.bot_id,
    owner: {
      type: "user",
      user: {
        id: data.owner?.user?.id ?? "",
        name: data.owner?.user?.name ?? null,
        avatarUrl: data.owner?.user?.avatar_url ?? null,
      },
    },
  };
}
