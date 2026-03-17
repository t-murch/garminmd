import { describe, expect, it } from "vitest";
import { normalizeName, loadDictionary } from "@/lib/resolver/dictionary";
import { exactMatch } from "@/lib/resolver/exact-match";
import { resolveWorkout } from "@/lib/resolver/index";
import { lbsToKg, kgToLbs } from "@/lib/utils/units";
import type { ParsedWorkout } from "@/lib/core/types";

// ─── normalizeName ────────────────────────────────────────────

describe("normalizeName", () => {
  it("expands DB to dumbbell and lowercases", () => {
    expect(normalizeName("DB Bench Press")).toBe("dumbbell bench press");
  });

  it("expands BB to barbell", () => {
    expect(normalizeName("BB Row")).toBe("barbell row");
  });

  it("strips parenthetical annotations", () => {
    expect(normalizeName("Single Arm Cable Row (each side)")).toBe(
      "single arm cable row",
    );
  });

  it("strips warm-up annotations", () => {
    expect(normalizeName("DB Bench Press (warm-up)")).toBe(
      "dumbbell bench press",
    );
  });

  it("normalizes flies to fly", () => {
    expect(normalizeName("Incline DB Flies")).toBe("incline dumbbell fly");
  });

  it("normalizes flyes to fly", () => {
    expect(normalizeName("Cable Pec Flyes")).toBe("cable pec fly");
  });

  it("expands EZ to ez bar", () => {
    expect(normalizeName("EZ Curl")).toBe("ez bar curl");
  });

  it("normalizes 'EZ Bar Curl' without doubling bar", () => {
    expect(normalizeName("EZ Bar Curl")).toBe("ez bar curl");
  });

  it("collapses whitespace", () => {
    expect(normalizeName("  DB   Bench   Press  ")).toBe(
      "dumbbell bench press",
    );
  });
});

// ─── loadDictionary ───────────────────────────────────────────

describe("loadDictionary", () => {
  it("loads exercises into a Map", () => {
    const dict = loadDictionary();
    expect(dict.size).toBeGreaterThan(50);
  });

  it("contains known exercises", () => {
    const dict = loadDictionary();
    expect(dict.has("dumbbell bench press")).toBe(true);
    expect(dict.has("lat pulldown")).toBe(true);
    expect(dict.has("barbell squat")).toBe(true);
  });
});

// ─── exactMatch ───────────────────────────────────────────────

describe("exactMatch", () => {
  it("resolves DB Bench Press to DUMBBELL_BENCH_PRESS", () => {
    const result = exactMatch("DB Bench Press");
    expect(result).not.toBeNull();
    expect(result!.exerciseName).toBe("DUMBBELL_BENCH_PRESS");
    expect(result!.category).toBe("BENCH_PRESS");
    expect(result!.categoryId).toBe(10);
  });

  it("resolves Lat Pulldown", () => {
    const result = exactMatch("Lat Pulldown");
    expect(result).not.toBeNull();
    expect(result!.exerciseName).toBe("LAT_PULLDOWN");
    expect(result!.category).toBe("PULL_UP");
  });

  it("resolves exercise with parenthetical stripped", () => {
    const result = exactMatch("Single Arm Cable Row (each side)");
    expect(result).not.toBeNull();
    expect(result!.exerciseName).toBe("SINGLE_ARM_CABLE_ROW");
    expect(result!.category).toBe("ROW");
  });

  it("resolves Incline DB Bench Press", () => {
    const result = exactMatch("Incline DB Bench Press");
    expect(result).not.toBeNull();
    expect(result!.exerciseName).toBe("INCLINE_DUMBBELL_BENCH_PRESS");
  });

  it("resolves Cable Pec Flies with spelling normalization", () => {
    const result = exactMatch("Cable Pec Flies");
    expect(result).not.toBeNull();
    expect(result!.category).toBe("FLYE");
  });

  it("resolves Cable Tricep Pressdown", () => {
    const result = exactMatch("Cable Tricep Pressdown");
    expect(result).not.toBeNull();
    expect(result!.category).toBe("TRICEPS_EXTENSION");
  });

  it("resolves Cable Overhead Tricep Pull", () => {
    const result = exactMatch("Cable Overhead Tricep Pull");
    expect(result).not.toBeNull();
    expect(result!.exerciseName).toBe("CABLE_OVERHEAD_TRICEPS_EXTENSION");
  });

  it("resolves EZ Bar Skull Crusher", () => {
    const result = exactMatch("EZ Bar Skull Crusher");
    expect(result).not.toBeNull();
    expect(result!.category).toBe("TRICEPS_EXTENSION");
  });

  it("returns null for unknown exercises", () => {
    const result = exactMatch("Underwater Basket Weaving");
    expect(result).toBeNull();
  });
});

// ─── lbsToKg / kgToLbs ───────────────────────────────────────

describe("lbsToKg", () => {
  it("converts 35 lbs to approximately 15.88 kg", () => {
    const kg = lbsToKg(35);
    expect(kg).toBeCloseTo(15.88, 1);
  });

  it("converts 0 lbs to 0 kg", () => {
    expect(lbsToKg(0)).toBe(0);
  });

  it("converts 100 lbs to approximately 45.36 kg", () => {
    expect(lbsToKg(100)).toBeCloseTo(45.36, 1);
  });
});

describe("kgToLbs", () => {
  it("converts 20 kg to approximately 44.09 lbs", () => {
    expect(kgToLbs(20)).toBeCloseTo(44.09, 1);
  });

  it("roundtrips correctly", () => {
    const original = 35;
    const kg = lbsToKg(original);
    const backToLbs = kgToLbs(kg);
    expect(backToLbs).toBeCloseTo(original, 0);
  });
});

// ─── resolveWorkout ───────────────────────────────────────────

describe("resolveWorkout", () => {
  const makeParsedWorkout = (
    overrides?: Partial<ParsedWorkout>,
  ): ParsedWorkout => ({
    name: "Push — Chest + Triceps",
    dayOfWeek: "Monday",
    sportTypeHint: "strength",
    defaultReps: 12,
    defaultRestSeconds: 90,
    progressionRule: null,
    exercises: [
      {
        order: 0,
        rawName: "DB Bench Press",
        sets: 3,
        reps: 10,
        weight: 35,
        weightUnit: "lbs",
        isWarmup: false,
        restSeconds: null,
        notes: null,
        weeklyData: {},
      },
      {
        order: 1,
        rawName: "Lat Pulldown",
        sets: 3,
        reps: null,
        weight: 60,
        weightUnit: "kg",
        isWarmup: false,
        restSeconds: 60,
        notes: null,
        weeklyData: {},
      },
    ],
    ...overrides,
  });

  it("resolves known exercises via exact match", async () => {
    const result = await resolveWorkout(makeParsedWorkout());

    expect(result.exercises).toHaveLength(2);
    expect(result.unresolved).toHaveLength(0);

    const bench = result.exercises[0];
    expect(bench.garminType).not.toBeNull();
    expect(bench.garminType!.exerciseName).toBe("DUMBBELL_BENCH_PRESS");
    expect(bench.resolutionMethod).toBe("exact");
    expect(bench.confidence).toBe(1.0);
  });

  it("converts lbs weight to kg", async () => {
    const result = await resolveWorkout(makeParsedWorkout());
    const bench = result.exercises[0];
    expect(bench.weightKg).toBeCloseTo(15.88, 1);
  });

  it("keeps kg weight as-is", async () => {
    const result = await resolveWorkout(makeParsedWorkout());
    const pulldown = result.exercises[1];
    expect(pulldown.weightKg).toBe(60);
  });

  it("uses exercise reps when available, falls back to section default", async () => {
    const result = await resolveWorkout(makeParsedWorkout());
    expect(result.exercises[0].effectiveReps).toBe(10); // from exercise
    expect(result.exercises[1].effectiveReps).toBe(12); // from section default
  });

  it("uses exercise rest when available, falls back to section default", async () => {
    const result = await resolveWorkout(makeParsedWorkout());
    expect(result.exercises[0].effectiveRestSeconds).toBe(90); // from section default
    expect(result.exercises[1].effectiveRestSeconds).toBe(60); // from exercise
  });

  it("falls back to config defaults when section has none", async () => {
    const result = await resolveWorkout(
      makeParsedWorkout({ defaultReps: null, defaultRestSeconds: null }),
      { defaultReps: 8, defaultRestSeconds: 120 },
    );
    // Exercise 0 has reps=10, so effectiveReps=10; rest is null, config=120
    expect(result.exercises[0].effectiveReps).toBe(10);
    expect(result.exercises[0].effectiveRestSeconds).toBe(120);
    // Exercise 1 has reps=null, config=8; rest=60
    expect(result.exercises[1].effectiveReps).toBe(8);
    expect(result.exercises[1].effectiveRestSeconds).toBe(60);
  });

  it("marks unresolvable exercises in the unresolved array", async () => {
    const result = await resolveWorkout(
      makeParsedWorkout({
        exercises: [
          {
            order: 0,
            rawName: "Underwater Basket Weaving",
            sets: 3,
            reps: 10,
            weight: null,
            weightUnit: null,
            isWarmup: false,
            restSeconds: null,
            notes: null,
            weeklyData: {},
          },
        ],
      }),
    );

    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0].rawName).toBe("Underwater Basket Weaving");
    expect(result.exercises[0].garminType).toBeNull();
  });

  it("preserves workout metadata", async () => {
    const result = await resolveWorkout(makeParsedWorkout());
    expect(result.name).toBe("Push — Chest + Triceps");
    expect(result.dayOfWeek).toBe("Monday");
    expect(result.sportTypeHint).toBe("strength");
  });
});
