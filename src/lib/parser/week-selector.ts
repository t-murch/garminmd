// ─── week-selector.ts ───────────────────────────────────────────
// Determines which week's data to use when progression columns exist.

export interface WeekSelectionResult {
  /** The week number selected */
  week: number;
  /** How it was determined */
  source: "explicit" | "auto" | "fallback";
}

/**
 * Determine which week to use for weight/rep data.
 *
 * Priority:
 *   1. Explicit --week flag
 *   2. Auto-detect from program start date (future: config)
 *   3. Fallback to most recent week with data
 */
export function selectWeek(
  availableWeeks: number[],
  opts: { explicitWeek?: number; programStartDate?: string },
): WeekSelectionResult {
  if (opts.explicitWeek !== undefined) {
    return { week: opts.explicitWeek, source: "explicit" };
  }

  if (opts.programStartDate) {
    const start = new Date(opts.programStartDate);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffWeeks = Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000));
    const clamped = Math.max(
      1,
      Math.min(diffWeeks, Math.max(...availableWeeks)),
    );
    return { week: clamped, source: "auto" };
  }

  // Fallback: use the highest available week number
  const maxWeek = Math.max(...availableWeeks, 1);
  return { week: maxWeek, source: "fallback" };
}
