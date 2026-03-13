/**
 * Notion page reader.
 *
 * getSharedPages()      — lists pages the user shared with the integration
 * getPageAsMarkdown()   — converts a Notion page to markdown via notion-to-md
 *
 * The markdown output feeds directly into parseMarkdown() from lib/parser/markdown.ts.
 */

import { Client } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";

/** Minimal page descriptor returned by getSharedPages. */
export interface SharedPage {
  id: string;
  title: string;
}

/**
 * List every page the user shared with the Notion integration.
 * Uses the Notion search endpoint filtered to pages.
 */
export async function getSharedPages(
  accessToken: string,
): Promise<SharedPage[]> {
  const notion = new Client({ auth: accessToken });

  const response = await notion.search({
    filter: { value: "page", property: "object" },
  });

  return response.results
    .filter((r): r is Extract<typeof r, { object: "page" }> => r.object === "page")
    .map((page) => ({
      id: page.id,
      title: extractPageTitle(page),
    }));
}

/**
 * Fetch a single Notion page and convert its blocks to a markdown string.
 *
 * Uses the `notion-to-md` library which recursively reads child blocks
 * and produces markdown that our parser understands (headings, GFM tables, etc.).
 */
export async function getPageAsMarkdown(
  accessToken: string,
  pageId: string,
): Promise<string> {
  const notion = new Client({ auth: accessToken });
  const n2m = new NotionToMarkdown({ notionClient: notion });

  const mdBlocks = await n2m.pageToMarkdown(pageId);
  const mdString = n2m.toMarkdownString(mdBlocks);

  // notion-to-md v3+ returns { parent: string } instead of a plain string
  if (typeof mdString === "string") return mdString;
  return (mdString as { parent: string }).parent;
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Extract a human-readable title from a Notion page object.
 * Pages store their title in the `properties` map under a `title` type property.
 */
function extractPageTitle(page: Record<string, any>): string {
  const props = page.properties ?? {};
  for (const prop of Object.values(props)) {
    if ((prop as any)?.type === "title") {
      const titleParts = (prop as any).title ?? [];
      return titleParts.map((t: any) => t.plain_text ?? "").join("") || "Untitled";
    }
  }
  return "Untitled";
}
