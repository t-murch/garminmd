import Anthropic from "@anthropic-ai/sdk";
import type {
  AutoInsightResult,
  DeepAnalysisResult,
  PlanContext,
  ActualContext,
} from "@/lib/core/types";
import {
  AUTO_INSIGHT_SYSTEM_PROMPT,
  DEEP_ANALYSIS_SYSTEM_PROMPT,
  buildAutoInsightContext,
  buildDeepAnalysisContext,
} from "./prompts";

const ANALYSIS_MODEL = "claude-sonnet-4-20250514";

/**
 * Extract JSON from an LLM response that may be wrapped in markdown code blocks.
 */
function extractJson(text: string): string {
  return text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
}

/**
 * Generate auto-insights for a single workout session by comparing
 * the plan against what was actually performed.
 *
 * Returns a fallback message (not an error) when:
 * - ANTHROPIC_API_KEY is not set
 * - The API call fails
 * - The response can't be parsed as JSON
 */
export async function generateAutoInsight(
  plan: PlanContext,
  actual: ActualContext,
): Promise<AutoInsightResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      insights: [
        {
          type: "general",
          message: "Configure ANTHROPIC_API_KEY for coaching insights.",
        },
      ],
      raw: "",
    };
  }

  const client = new Anthropic({ apiKey });
  const userMessage = buildAutoInsightContext(plan, actual);

  let text: string;
  try {
    const response = await client.messages.create({
      model: ANALYSIS_MODEL,
      max_tokens: 1024,
      system: AUTO_INSIGHT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    text =
      response.content[0]?.type === "text" ? response.content[0].text : "";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Auto-insight API call failed:", message);
    return {
      insights: [
        {
          type: "general",
          message: "Coaching analysis temporarily unavailable. Try again later.",
        },
      ],
      raw: "",
    };
  }

  try {
    const jsonStr = extractJson(text);
    const parsed = JSON.parse(jsonStr) as {
      insights: Array<{ type: string; message: string }>;
    };
    return { insights: parsed.insights ?? [], raw: text };
  } catch {
    // JSON parsing failed — return the raw text as a single insight
    return {
      insights: [
        {
          type: "general",
          message: text.trim() || "Unable to generate insight.",
        },
      ],
      raw: text,
    };
  }
}

/**
 * Generate a deep analysis across multiple weeks of training data.
 * Looks for trends in progression, muscle balance, recovery, and
 * provides actionable program suggestions.
 */
export async function generateDeepAnalysis(
  plans: PlanContext[],
  actuals: ActualContext[],
  weekCount = 4,
): Promise<DeepAnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      sections: [
        {
          title: "Configuration Required",
          content: "Configure ANTHROPIC_API_KEY for deep analysis.",
          type: "suggestion",
        },
      ],
      raw: "",
    };
  }

  const client = new Anthropic({ apiKey });
  const userMessage = buildDeepAnalysisContext(plans, actuals, weekCount);

  let text: string;
  try {
    const response = await client.messages.create({
      model: ANALYSIS_MODEL,
      max_tokens: 2048,
      system: DEEP_ANALYSIS_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    text =
      response.content[0]?.type === "text" ? response.content[0].text : "";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Deep analysis API call failed:", message);
    return {
      sections: [
        {
          title: "Analysis Unavailable",
          content:
            "Coaching analysis temporarily unavailable. Try again later.",
          type: "suggestion",
        },
      ],
      raw: "",
    };
  }

  try {
    const jsonStr = extractJson(text);
    const parsed = JSON.parse(jsonStr) as {
      sections?: Array<{ title: string; content: string; type: string }>;
    };
    const sections = parsed.sections;
    if (!Array.isArray(sections) || sections.length === 0) {
      throw new Error("No sections in response");
    }
    return { sections, raw: text };
  } catch {
    return {
      sections: [
        {
          title: "Analysis",
          content: text.trim() || "Unable to generate analysis.",
          type: "suggestion",
        },
      ],
      raw: text,
    };
  }
}
