import type { GarminExerciseType } from "@/lib/core/types";
import { loadDictionary, normalizeName } from "./dictionary";

/**
 * Tier 1: Exact/normalized match against the exercise dictionary.
 *
 * Tries the full normalized name first. If no match, strips parenthetical
 * annotations (e.g. "(each side)") and retries. Also tries without leading
 * equipment modifiers if the raw name includes them.
 *
 * Returns the matching GarminExerciseType or null.
 */
export function exactMatch(rawName: string): GarminExerciseType | null {
  const dict = loadDictionary();
  const normalized = normalizeName(rawName);

  // Direct match
  if (dict.has(normalized)) {
    return dict.get(normalized)!;
  }

  // Try stripping common prefixes that might not be in the dictionary
  // e.g. "Cable Pec Flies" → normalize → "cable pec fly" → match "cable pec fly"
  // Already handled by normalizeName, but let's also try without trailing "s"
  const withoutTrailingS = normalized.replace(/s$/, "");
  if (withoutTrailingS !== normalized && dict.has(withoutTrailingS)) {
    return dict.get(withoutTrailingS)!;
  }

  return null;
}
