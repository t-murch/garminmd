import { describe, expect, it } from "vitest";
import { StrengthAdapter } from "@/lib/adapters/strength";
import type {
  ResolvedWorkout,
  ResolvedExercise,
  GarminRepeatGroup,
  GarminWorkoutStep,
} from "@/lib/core/types";

// ─── Helpers ──────────────────────────────────────────────────

function makeExercise(overrides: Partial<ResolvedExercise> = {}): ResolvedExercise {
  return {
    order: 0,
    rawName: "DB Bench Press",
    sets: 3,
    reps: 12,
    weight: 35,
    weightUnit: "lbs",
    isWarmup: false,
    restSeconds: null,
    notes: null,
    weeklyData: {},
    garminType: {
      category: "BENCH_PRESS",
      exerciseName: "DUMBBELL_BENCH_PRESS",
      categoryId: 10,
      exerciseNameId: 1,
    },
    resolutionMethod: "exact",
    confidence: 1,
    weightKg: 15.88,
    effectiveRestSeconds: 90,
    effectiveReps: 12,
    ...overrides,
  };
}

function makeWorkout(exercises: ResolvedExercise[]): ResolvedWorkout {
  return {
    name: "Test Workout",
    dayOfWeek: null,
    sportTypeHint: "strength",
    defaultReps: 12,
    defaultRestSeconds: 90,
    progressionRule: null,
    exercises,
    unresolved: [],
  };
}

const adapter = new StrengthAdapter();

// ─── Step Type IDs ────────────────────────────────────────────

describe("step type IDs", () => {
  it("warmup exercises use stepTypeId 1", () => {
    const workout = makeWorkout([makeExercise({ isWarmup: true, sets: 2 })]);
    const payload = adapter.build(workout);
    const group = payload.workoutSegments[0].workoutSteps[0] as GarminRepeatGroup;
    const exerciseStep = group.workoutSteps[0];
    expect(exerciseStep.stepType.stepTypeId).toBe(1);
    expect(exerciseStep.stepType.stepTypeKey).toBe("warmup");
  });

  it("main exercises use stepTypeId 3 (interval)", () => {
    const workout = makeWorkout([makeExercise()]);
    const payload = adapter.build(workout);
    const group = payload.workoutSegments[0].workoutSteps[0] as GarminRepeatGroup;
    const exerciseStep = group.workoutSteps[0];
    expect(exerciseStep.stepType.stepTypeId).toBe(3);
    expect(exerciseStep.stepType.stepTypeKey).toBe("interval");
  });

  it("rest steps use stepTypeId 5", () => {
    const workout = makeWorkout([makeExercise()]);
    const payload = adapter.build(workout);
    const group = payload.workoutSegments[0].workoutSteps[0] as GarminRepeatGroup;
    const restStep = group.workoutSteps[1];
    expect(restStep.stepType.stepTypeId).toBe(5);
    expect(restStep.stepType.stepTypeKey).toBe("rest");
  });

  it("repeat groups use stepTypeId 6", () => {
    const workout = makeWorkout([makeExercise()]);
    const payload = adapter.build(workout);
    const group = payload.workoutSegments[0].workoutSteps[0] as GarminRepeatGroup;
    expect(group.stepType.stepTypeId).toBe(6);
    expect(group.stepType.stepTypeKey).toBe("repeat");
  });
});

// ─── Repeat Group Structure ───────────────────────────────────

describe("repeat group structure", () => {
  it("wraps each exercise in a RepeatGroupDTO", () => {
    const workout = makeWorkout([makeExercise()]);
    const payload = adapter.build(workout);
    const step = payload.workoutSegments[0].workoutSteps[0];
    expect(step.type).toBe("RepeatGroupDTO");
  });

  it("sets numberOfIterations to exercise sets count", () => {
    const workout = makeWorkout([makeExercise({ sets: 4 })]);
    const payload = adapter.build(workout);
    const group = payload.workoutSegments[0].workoutSteps[0] as GarminRepeatGroup;
    expect(group.numberOfIterations).toBe(4);
  });

  it("each group has exactly 2 child steps: exercise + rest", () => {
    const workout = makeWorkout([makeExercise()]);
    const payload = adapter.build(workout);
    const group = payload.workoutSegments[0].workoutSteps[0] as GarminRepeatGroup;
    expect(group.workoutSteps).toHaveLength(2);
    expect(group.workoutSteps[0].stepType.stepTypeKey).toBe("interval");
    expect(group.workoutSteps[1].stepType.stepTypeKey).toBe("rest");
  });

  it("rest step uses effectiveRestSeconds", () => {
    const workout = makeWorkout([makeExercise({ effectiveRestSeconds: 60 })]);
    const payload = adapter.build(workout);
    const group = payload.workoutSegments[0].workoutSteps[0] as GarminRepeatGroup;
    const restStep = group.workoutSteps[1];
    expect(restStep.endConditionValue).toBe(60);
    expect(restStep.endCondition.conditionTypeKey).toBe("time");
  });
});

// ─── No Standalone Rest Between Exercises ─────────────────────

describe("no standalone rest between exercises", () => {
  it("only produces repeat groups at the top level", () => {
    const workout = makeWorkout([
      makeExercise({ rawName: "Ex 1" }),
      makeExercise({ rawName: "Ex 2" }),
      makeExercise({ rawName: "Ex 3" }),
    ]);
    const payload = adapter.build(workout);
    const steps = payload.workoutSegments[0].workoutSteps;
    expect(steps).toHaveLength(3);
    for (const step of steps) {
      expect(step.type).toBe("RepeatGroupDTO");
    }
  });
});

// ─── End Conditions ───────────────────────────────────────────

describe("end conditions", () => {
  it("exercise steps use conditionTypeKey 'reps'", () => {
    const workout = makeWorkout([makeExercise()]);
    const payload = adapter.build(workout);
    const group = payload.workoutSegments[0].workoutSteps[0] as GarminRepeatGroup;
    expect(group.workoutSteps[0].endCondition.conditionTypeKey).toBe("reps");
  });

  it("repeat groups use conditionTypeKey 'iterations'", () => {
    const workout = makeWorkout([makeExercise()]);
    const payload = adapter.build(workout);
    const group = payload.workoutSegments[0].workoutSteps[0] as GarminRepeatGroup;
    expect(group.endCondition.conditionTypeKey).toBe("iterations");
  });
});

// ─── Warmup + Main Exercise Ordering ──────────────────────────

describe("warmup + main exercise ordering", () => {
  it("preserves exercise order: warmup first, then main", () => {
    const workout = makeWorkout([
      makeExercise({ order: 0, rawName: "Warm-up Row", isWarmup: true, sets: 2 }),
      makeExercise({ order: 1, rawName: "Cable Row", sets: 4 }),
      makeExercise({ order: 2, rawName: "Lat Pulldown", sets: 3 }),
    ]);
    const payload = adapter.build(workout);
    const steps = payload.workoutSegments[0].workoutSteps;
    expect(steps).toHaveLength(3);

    const g0 = steps[0] as GarminRepeatGroup;
    const g1 = steps[1] as GarminRepeatGroup;
    const g2 = steps[2] as GarminRepeatGroup;

    // Warmup group
    expect(g0.numberOfIterations).toBe(2);
    expect(g0.workoutSteps[0].stepType.stepTypeKey).toBe("warmup");

    // Main exercise groups
    expect(g1.numberOfIterations).toBe(4);
    expect(g1.workoutSteps[0].stepType.stepTypeKey).toBe("interval");

    expect(g2.numberOfIterations).toBe(3);
    expect(g2.workoutSteps[0].stepType.stepTypeKey).toBe("interval");
  });
});

// ─── Exercise Category & Weight ───────────────────────────────

describe("exercise category and weight", () => {
  it("includes exercise category when garminType is resolved", () => {
    const workout = makeWorkout([makeExercise()]);
    const payload = adapter.build(workout);
    const group = payload.workoutSegments[0].workoutSteps[0] as GarminRepeatGroup;
    const ex = group.workoutSteps[0];
    expect(ex.exerciseCategory).toEqual({
      category: "BENCH_PRESS",
      exerciseName: "DUMBBELL_BENCH_PRESS",
    });
  });

  it("omits exercise category when garminType is null", () => {
    const workout = makeWorkout([makeExercise({ garminType: null })]);
    const payload = adapter.build(workout);
    const group = payload.workoutSegments[0].workoutSteps[0] as GarminRepeatGroup;
    expect(group.workoutSteps[0].exerciseCategory).toBeUndefined();
  });

  it("includes weight in kg", () => {
    const workout = makeWorkout([makeExercise({ weightKg: 15.88 })]);
    const payload = adapter.build(workout);
    const group = payload.workoutSegments[0].workoutSteps[0] as GarminRepeatGroup;
    expect(group.workoutSteps[0].weightValue).toEqual({ value: 15.88 });
  });
});

// ─── Step Ordering ────────────────────────────────────────────

describe("step ordering", () => {
  it("repeat groups have sequential stepOrder", () => {
    const workout = makeWorkout([
      makeExercise({ rawName: "Ex 1" }),
      makeExercise({ rawName: "Ex 2" }),
      makeExercise({ rawName: "Ex 3" }),
    ]);
    const payload = adapter.build(workout);
    const steps = payload.workoutSegments[0].workoutSteps;
    expect((steps[0] as GarminRepeatGroup).stepOrder).toBe(1);
    expect((steps[1] as GarminRepeatGroup).stepOrder).toBe(2);
    expect((steps[2] as GarminRepeatGroup).stepOrder).toBe(3);
  });

  it("child steps within a group have sequential order", () => {
    const workout = makeWorkout([makeExercise()]);
    const payload = adapter.build(workout);
    const group = payload.workoutSegments[0].workoutSteps[0] as GarminRepeatGroup;
    expect(group.workoutSteps[0].stepOrder).toBe(1);
    expect(group.workoutSteps[1].stepOrder).toBe(2);
  });
});

// ─── Validation ───────────────────────────────────────────────

describe("validation", () => {
  it("estimates step count as number of exercises", () => {
    const exercises = Array.from({ length: 8 }, (_, i) =>
      makeExercise({ order: i, rawName: `Ex ${i}` }),
    );
    const workout = makeWorkout(exercises);
    const result = adapter.validate(workout);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("errors when exercises exceed 50-step limit", () => {
    const exercises = Array.from({ length: 51 }, (_, i) =>
      makeExercise({ order: i, rawName: `Ex ${i}` }),
    );
    const workout = makeWorkout(exercises);
    const result = adapter.validate(workout);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("50-step limit");
  });
});

// ─── Description ──────────────────────────────────────────────

describe("step description", () => {
  it("does not include sets count (sets are in repeat group)", () => {
    const workout = makeWorkout([makeExercise({ sets: 3, effectiveReps: 12, weight: 35 })]);
    const payload = adapter.build(workout);
    const group = payload.workoutSegments[0].workoutSteps[0] as GarminRepeatGroup;
    const desc = group.workoutSteps[0].description!;
    expect(desc).not.toContain("sets");
    expect(desc).toContain("12 reps");
    expect(desc).toContain("@ 35 lbs");
  });
});
