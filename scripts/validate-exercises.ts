/**
 * Validates data/exercises.json against Garmin's official exercise dictionary.
 *
 * Usage: npx tsx scripts/validate-exercises.ts
 *
 * Fetches https://connect.garmin.com/web-data/exercises/Exercises.json
 * and checks that every entry in our dictionary has a valid category and
 * exercise name according to Garmin's authoritative source.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const GARMIN_EXERCISES_URL =
  "https://connect.garmin.com/web-data/exercises/Exercises.json";

interface GarminOfficialResponse {
  categories: Record<string, {
    exercises: Record<string, unknown>;
  }>;
}

interface OurEntry {
  name: string;
  garminCategory: string;
  garminExerciseName: string;
  garminCategoryId: number;
  garminExerciseNameId: number;
}

async function main() {
  console.log("Fetching Garmin official exercise dictionary...");
  const res = await fetch(GARMIN_EXERCISES_URL);
  if (!res.ok) {
    console.error(`Failed to fetch: ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const official: GarminOfficialResponse = await res.json();

  // Build lookup: category → Set<exerciseName>
  const categoryMap = new Map<string, Set<string>>();
  let totalExercises = 0;
  for (const [catName, catData] of Object.entries(official.categories)) {
    const names = new Set(Object.keys(catData.exercises));
    categoryMap.set(catName, names);
    totalExercises += names.size;
  }

  console.log(
    `Loaded ${categoryMap.size} categories, ${totalExercises} exercises from Garmin.\n`,
  );

  // Load our dictionary
  const ourPath = resolve(
    new URL(".", import.meta.url).pathname,
    "../data/exercises.json",
  );
  const ours: OurEntry[] = JSON.parse(readFileSync(ourPath, "utf-8"));

  let mismatches = 0;

  for (const entry of ours) {
    const officialExercises = categoryMap.get(entry.garminCategory);

    if (!officialExercises) {
      console.error(
        `[BAD CATEGORY] "${entry.name}" → category "${entry.garminCategory}" does not exist in Garmin`,
      );
      mismatches++;
      continue;
    }

    if (!officialExercises.has(entry.garminExerciseName)) {
      console.error(
        `[BAD EXERCISE] "${entry.name}" → "${entry.garminCategory}/${entry.garminExerciseName}" not found. ` +
          `Valid names in this category: ${[...officialExercises].join(", ")}`,
      );
      mismatches++;
    }
  }

  console.log(`\n${ours.length} entries checked. ${mismatches} mismatch(es).`);

  if (mismatches > 0) {
    process.exit(1);
  } else {
    console.log("All entries valid!");
  }
}

main();
