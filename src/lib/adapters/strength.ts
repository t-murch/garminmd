import type {
  GarminWorkoutPayload,
  GarminWorkoutStep,
  ResolvedExercise,
  ResolvedWorkout,
  SportAdapter,
  ValidationResult,
} from "../core/types";

/** Garmin's sport type IDs (reverse-engineered) */
const STRENGTH_SPORT_TYPE = {
  sportTypeId: 4,
  sportTypeKey: "strength_training",
} as const;

/** Garmin's step type IDs */
const STEP_TYPES = {
  warmup: { stepTypeId: 3, stepTypeKey: "warmup" as const },
  interval: { stepTypeId: 1, stepTypeKey: "interval" as const },
  rest: { stepTypeId: 4, stepTypeKey: "rest" as const },
  cooldown: { stepTypeId: 2, stepTypeKey: "cooldown" as const },
};

/** Garmin enforces a max of 50 steps per workout */
const GARMIN_MAX_STEPS = 50;

export class StrengthAdapter implements SportAdapter {
  sportType = "strength";

  validate(workout: ResolvedWorkout): ValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (workout.exercises.length === 0) {
      errors.push("Workout has no exercises.");
    }

    // Estimate step count: each exercise = 1 step, each rest = 1 step
    const exerciseCount = workout.exercises.length;
    const restCount = exerciseCount - 1; // rest between exercises, not after last
    const estimatedSteps = exerciseCount + restCount;

    if (estimatedSteps > GARMIN_MAX_STEPS) {
      errors.push(
        `Estimated ${estimatedSteps} steps exceeds Garmin's ${GARMIN_MAX_STEPS}-step limit. ` +
          `Consider splitting into multiple workouts.`,
      );
    }

    if (estimatedSteps > GARMIN_MAX_STEPS * 0.8) {
      warnings.push(
        `${estimatedSteps} steps is close to Garmin's ${GARMIN_MAX_STEPS}-step limit.`,
      );
    }

    for (const ex of workout.exercises) {
      if (!ex.garminType) {
        warnings.push(
          `"${ex.rawName}" could not be mapped to a Garmin exercise. ` +
            `It will be uploaded as a generic step with a text description.`,
        );
      }
    }

    const unresolvedCount = workout.unresolved.length;
    if (unresolvedCount > 0) {
      warnings.push(
        `${unresolvedCount} exercise(s) could not be resolved: ` +
          workout.unresolved.map((u) => u.rawName).join(", "),
      );
    }

    return {
      valid: errors.length === 0,
      warnings,
      errors,
    };
  }

  build(workout: ResolvedWorkout): GarminWorkoutPayload {
    const steps: GarminWorkoutStep[] = [];
    let stepOrder = 1;

    const mainExercises = workout.exercises.filter((e) => !e.isWarmup);
    const warmupExercises = workout.exercises.filter((e) => e.isWarmup);

    // ─── Warm-up Steps ────────────────────────────────────
    for (const ex of warmupExercises) {
      steps.push(this.buildExerciseStep(ex, stepOrder++, "warmup"));
    }

    // Insert rest after warm-up block if there are warm-up exercises
    if (warmupExercises.length > 0 && mainExercises.length > 0) {
      const restSec =
        warmupExercises[warmupExercises.length - 1].effectiveRestSeconds;
      steps.push(this.buildRestStep(stepOrder++, restSec));
    }

    // ─── Main Exercise Steps ──────────────────────────────
    for (let i = 0; i < mainExercises.length; i++) {
      const ex = mainExercises[i];
      steps.push(this.buildExerciseStep(ex, stepOrder++, "interval"));

      // Insert rest between exercises (not after the last one)
      if (i < mainExercises.length - 1) {
        steps.push(this.buildRestStep(stepOrder++, ex.effectiveRestSeconds));
      }
    }

    return {
      workoutName: workout.name,
      description: this.buildDescription(workout),
      sportType: { ...STRENGTH_SPORT_TYPE },
      workoutSegments: [
        {
          segmentOrder: 1,
          sportType: { ...STRENGTH_SPORT_TYPE },
          workoutSteps: steps,
        },
      ],
    };
  }

  private buildExerciseStep(
    ex: ResolvedExercise,
    order: number,
    type: "warmup" | "interval",
  ): GarminWorkoutStep {
    const step: GarminWorkoutStep = {
      stepOrder: order,
      stepType: STEP_TYPES[type],
      endCondition: { conditionTypeKey: "repetitions" },
      endConditionValue: ex.effectiveReps,
    };

    // Add Garmin exercise mapping if resolved
    if (ex.garminType) {
      step.exerciseCategory = {
        category: ex.garminType.category,
        exerciseName: ex.garminType.exerciseName,
      };
    }

    // Add weight if available
    if (ex.weightKg !== null && ex.weightKg > 0) {
      step.weightValue = { value: ex.weightKg };
    }

    // Build description: "3 sets × 12 reps @ 35 lbs" or "Warm-up: 2 sets @ 25 lbs"
    step.description = this.buildStepDescription(ex, type);

    return step;
  }

  private buildRestStep(order: number, seconds: number): GarminWorkoutStep {
    return {
      stepOrder: order,
      stepType: STEP_TYPES.rest,
      endCondition: { conditionTypeKey: "time" },
      endConditionValue: seconds,
    };
  }

  private buildStepDescription(
    ex: ResolvedExercise,
    type: "warmup" | "interval",
  ): string {
    const parts: string[] = [];

    if (type === "warmup") parts.push("Warm-up:");

    parts.push(`${ex.sets} sets × ${ex.effectiveReps} reps`);

    if (ex.weight !== null) {
      parts.push(`@ ${ex.weight} ${ex.weightUnit ?? "lbs"}`);
    }

    if (ex.notes) parts.push(`(${ex.notes})`);

    return parts.join(" ");
  }

  private buildDescription(workout: ResolvedWorkout): string {
    const parts: string[] = [];
    const exerciseCount = workout.exercises.length;
    const warmupCount = workout.exercises.filter((e) => e.isWarmup).length;

    parts.push(`${exerciseCount - warmupCount} exercises`);
    if (warmupCount > 0) parts.push(`+ ${warmupCount} warm-up`);
    if (workout.progressionRule) parts.push(`| ${workout.progressionRule}`);

    return parts.join(" ");
  }
}
