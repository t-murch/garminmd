// ─── rest-detector.ts ───────────────────────────────────────────
// Detect rest periods from section headers.
// Part of the 4-tier detection chain:
//   1. Explicit Rest column (handled in table parser)
//   2. Section header (this file)
//   3. User config (~/.garminmd/config.toml)
//   4. Hardcoded default (90s)

/**
 * Parse rest from a heading like "**Target:** 10–12 reps · Rest 60–90s"
 * Returns the upper bound (90s) since Garmin rest timers use a single value.
 */
export function detectRestFromHeader(heading: string): number | null {
  // Match patterns: "Rest 60–90s", "Rest 90s", "Rest: 60-90 sec", "rest 120 seconds"
  const patterns = [
    /rest[:\s]*(\d+)\s*[–\-]\s*(\d+)\s*s(?:ec(?:onds?)?)?/i,
    /rest[:\s]*(\d+)\s*s(?:ec(?:onds?)?)?/i,
  ];

  for (const pattern of patterns) {
    const match = heading.match(pattern);
    if (match) {
      // If range (60–90), use the upper bound
      return match[2] ? parseInt(match[2]) : parseInt(match[1]);
    }
  }

  return null;
}

/**
 * Parse rep target from a heading like "**Target:** 10–12 reps"
 * Returns the upper bound (12) as the target.
 */
export function detectRepsFromHeader(heading: string): number | null {
  const patterns = [/(\d+)\s*[–\-]\s*(\d+)\s*reps?/i, /(\d+)\s*reps?/i];

  for (const pattern of patterns) {
    const match = heading.match(pattern);
    if (match) {
      return match[2] ? parseInt(match[2]) : parseInt(match[1]);
    }
  }

  return null;
}
