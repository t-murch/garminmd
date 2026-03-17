import type {
  ExerciseDictionaryEntry,
  GarminExerciseType,
} from "@/lib/core/types";
import exercisesData from "../../../data/exercises.json";

// ─── Abbreviation Expansions ──────────────────────────────────

const ABBREVIATIONS: Record<string, string> = {
  db: "dumbbell",
  bb: "barbell",
  ez: "ez bar",
  kb: "kettlebell",
  ohp: "overhead press",
  rdl: "romanian deadlift",
  dl: "deadlift",
  bp: "bench press",
};

// ─── Normalization ────────────────────────────────────────────

/**
 * Normalize an exercise name for matching:
 * - lowercase
 * - strip parenthetical annotations like "(each side)" or "(warm-up)"
 * - expand common abbreviations (DB → dumbbell, BB → barbell, etc.)
 * - collapse whitespace
 * - strip trailing/leading whitespace
 */
export function normalizeName(raw: string): string {
  let name = raw
    .toLowerCase()
    .replace(/\(.*?\)/g, "") // strip parenthetical notes
    .trim();

  // Expand abbreviations as whole words (avoid double-expansion, e.g. "ez bar" → "ez bar bar")
  const words = name.split(/\s+/);
  name = words
    .map((word, i) => {
      const expansion = ABBREVIATIONS[word];
      if (!expansion) return word;
      // If expansion is multi-word and the next word already matches, skip expansion
      const expansionWords = expansion.split(" ");
      if (
        expansionWords.length > 1 &&
        words[i + 1] === expansionWords[expansionWords.length - 1]
      ) {
        return word;
      }
      return expansion;
    })
    .join(" ");

  // Fix double-bar from "EZ Bar" → "ez bar bar"
  name = name.replace(/\bez bar bar\b/g, "ez bar");

  // Normalize multiple spaces
  name = name.replace(/\s+/g, " ").trim();

  // Normalize common spelling variants
  name = name
    .replace(/flies/g, "fly")
    .replace(/flyes/g, "fly")
    .replace(/flye/g, "fly")
    .replace(/pressdowns/g, "pressdown")
    .replace(/skull crushers/g, "skull crusher")
    .replace(/pull-ups/g, "pull up")
    .replace(/pull ups/g, "pull up")
    .replace(/push-ups/g, "push up")
    .replace(/push ups/g, "push up");

  return name;
}

// ─── Dictionary Loading ───────────────────────────────────────

/** The dictionary maps normalized exercise names → GarminExerciseType */
let dictionary: Map<string, GarminExerciseType> | null = null;
let entries: ExerciseDictionaryEntry[] | null = null;

/**
 * Load and index the exercise dictionary.
 * Returns a Map of normalized name → GarminExerciseType.
 */
export function loadDictionary(): Map<string, GarminExerciseType> {
  if (dictionary) return dictionary;

  const data = exercisesData as ExerciseDictionaryEntry[];
  entries = data;
  dictionary = new Map();

  for (const entry of data) {
    const normalized = normalizeName(entry.name);
    const garminType: GarminExerciseType = {
      category: entry.garminCategory,
      exerciseName: entry.garminExerciseName,
      categoryId: entry.garminCategoryId,
      exerciseNameId: entry.garminExerciseNameId,
    };
    dictionary.set(normalized, garminType);
  }

  return dictionary;
}

/**
 * Get the raw dictionary entries (for passing to the LLM as context).
 */
export function getDictionaryEntries(): ExerciseDictionaryEntry[] {
  if (!entries) loadDictionary();
  return entries ?? [];
}

// ─── Validation ──────────────────────────────────────────────

/** Set of "CATEGORY/EXERCISE_NAME" pairs from the dictionary, built lazily */
let validPairs: Set<string> | null = null;

/**
 * Check if a category/exerciseName pair exists in the current dictionary.
 * Used to detect stale cache entries that reference old or wrong Garmin values.
 */
export function isValidExerciseMapping(
  category: string,
  exerciseName: string,
): boolean {
  if (!validPairs) {
    const dict = loadDictionary();
    validPairs = new Set<string>();
    for (const garminType of dict.values()) {
      validPairs.add(`${garminType.category}/${garminType.exerciseName}`);
    }
  }
  return validPairs.has(`${category}/${exerciseName}`);
}
