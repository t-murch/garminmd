/**
 * GarminMD — Core Types
 *
 * Data flows through the pipeline as:
 *   Markdown string
 *     → ParsedWorkout[]        (parser/)
 *     → ResolvedWorkout[]      (resolver/)
 *     → GarminWorkoutPayload[] (adapters/ + garmin/)
 *     → Garmin Connect API     (garmin/sync.ts)
 */

// ─── Parser Output ──────────────────────────────────────────────

/** A single exercise row extracted from a markdown table */
export interface ParsedExercise {
  /** Row order in the table (0-indexed) */
  order: number;
  /** Raw exercise name as written by the user, e.g. "Cable Overhead Tricep Pull" */
  rawName: string;
  /** Number of sets */
  sets: number;
  /** Target reps (from row, section header, or config default) */
  reps: number | null;
  /** Target weight in user's preferred unit */
  weight: number | null;
  /** Original unit from the markdown ("lbs" | "kg" | null) */
  weightUnit: "lbs" | "kg" | null;
  /** Is this a warm-up set? Detected from "WU" row marker or "(warm-up)" annotation */
  isWarmup: boolean;
  /** Rest period in seconds (from Rest column, if present) */
  restSeconds: number | null;
  /** Any notes / annotations stripped from the exercise name, e.g. "(each side)" */
  notes: string | null;
  /** Raw weekly data if progression columns exist, e.g. { 1: "10 x 12 x 12", 2: null } */
  weeklyData: Record<number, string | null>;
}

/** A complete workout session parsed from one markdown section */
export interface ParsedWorkout {
  /** Workout name derived from ## heading, e.g. "Push — Chest + Triceps" */
  name: string;
  /** Day of week if detectable from heading, e.g. "Monday" */
  dayOfWeek: string | null;
  /** Sport type hint from heading/context (defaults to "strength") */
  sportTypeHint: "strength" | "running" | "cycling" | "other";
  /** Default rep target from section header, e.g. 12 from "10–12 reps" */
  defaultReps: number | null;
  /** Default rest from section header in seconds, e.g. 90 from "Rest 60–90s" */
  defaultRestSeconds: number | null;
  /** Progression rule text if found, e.g. "12 clean reps on all 3 sets → add 5 lbs" */
  progressionRule: string | null;
  /** Parsed exercises in table order */
  exercises: ParsedExercise[];
}

// ─── Resolver Output ────────────────────────────────────────────

/** How the exercise was resolved to a Garmin type */
export type ResolutionMethod = "exact" | "llm" | "user" | "cached";

/** A Garmin exercise identity */
export interface GarminExerciseType {
  /** e.g. "BENCH_PRESS", "TRICEPS_EXTENSION" */
  category: string;
  /** e.g. "DUMBBELL_BENCH_PRESS", "CABLE_OVERHEAD_EXTENSION" */
  exerciseName: string;
  /** Garmin's numeric category ID */
  categoryId: number;
  /** Garmin's numeric exercise name ID */
  exerciseNameId: number;
}

/** An exercise after Garmin type resolution */
export interface ResolvedExercise extends ParsedExercise {
  /** Garmin exercise mapping (null if unresolvable) */
  garminType: GarminExerciseType | null;
  /** How we resolved it */
  resolutionMethod: ResolutionMethod | null;
  /** LLM confidence score (0–1) if resolved via LLM */
  confidence: number | null;
  /** Weight converted to kg for Garmin API */
  weightKg: number | null;
  /** Effective rest for this exercise (resolved via detection chain) */
  effectiveRestSeconds: number;
  /** Effective reps (resolved: row → section default → config) */
  effectiveReps: number;
}

/** A workout with all exercises resolved */
export interface ResolvedWorkout extends Omit<ParsedWorkout, "exercises"> {
  exercises: ResolvedExercise[];
  /** Exercises that couldn't be resolved */
  unresolved: Array<{ rawName: string; reason: string }>;
}

// ─── Garmin Payload ─────────────────────────────────────────────

/** Matches Garmin's internal workout step JSON structure */
export interface GarminWorkoutStep {
  stepOrder: number;
  stepType: {
    stepTypeId: number;
    stepTypeKey: "warmup" | "interval" | "rest" | "cooldown" | "recover";
  };
  exerciseCategory?: {
    category: string;
    exerciseName: string;
  };
  weightValue?: { value: number }; // kg
  endCondition: {
    conditionTypeKey: "repetitions" | "time" | "lap.button";
  };
  endConditionValue?: number;
  description?: string;
}

/** The full payload sent to Garmin Connect createWorkout() */
export interface GarminWorkoutPayload {
  workoutName: string;
  description?: string;
  sportType: {
    sportTypeId: number;
    sportTypeKey: string;
  };
  workoutSegments: Array<{
    segmentOrder: number;
    sportType: {
      sportTypeId: number;
      sportTypeKey: string;
    };
    workoutSteps: GarminWorkoutStep[];
  }>;
}

// ─── Sport Adapter Interface ────────────────────────────────────

/** Each sport type implements this to build Garmin workout JSON */
export interface SportAdapter {
  sportType: string;
  /** Validate that the parsed workout is compatible with this sport */
  validate(workout: ResolvedWorkout): ValidationResult;
  /** Build the Garmin workout payload */
  build(workout: ResolvedWorkout): GarminWorkoutPayload;
}

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

// ─── Config ─────────────────────────────────────────────────────

export interface GarminMdConfig {
  defaults: {
    restSeconds: number;
    weightUnit: "lbs" | "kg";
    repTarget: number;
  };
  garmin: {
    email?: string;
    /** Never stored in config — use env var or keychain */
    password?: string;
  };
  llm: {
    provider: "anthropic" | "ollama";
    model: string;
    /** Max cost per session in USD (safety net) */
    maxCostUsd: number;
  };
  notion?: {
    token?: string;
    defaultPageName?: string;
  };
}

// ─── Exercise Dictionary ────────────────────────────────────────

/** Shape of entries in data/exercises.json (from mrnabilnoh) */
export interface ExerciseDictionaryEntry {
  name: string;
  primaryMuscle: string;
  equipment: string;
  garminCategory: string;
  garminExerciseName: string;
  garminCategoryId: number;
  garminExerciseNameId: number;
}

// ─── Cache ──────────────────────────────────────────────────────

/** A cached exercise resolution */
export interface CachedResolution {
  rawName: string;
  normalizedName: string;
  garminType: GarminExerciseType;
  method: ResolutionMethod;
  resolvedAt: string; // ISO date
}

// ─── Sync State ─────────────────────────────────────────────────

/** Tracks uploaded workouts for idempotent re-upload */
export interface SyncState {
  workouts: Array<{
    name: string;
    garminWorkoutId: string;
    lastUploadedAt: string;
    contentHash: string; // hash of the workout payload for change detection
  }>;
}
