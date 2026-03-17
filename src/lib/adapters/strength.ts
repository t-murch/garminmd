import type {
  GarminRepeatGroup,
  GarminWorkoutPayload,
  GarminWorkoutStep,
  GarminWorkoutStepOrGroup,
  ResolvedExercise,
  ResolvedWorkout,
  SportAdapter,
  ValidationResult,
} from "../core/types";

/** Garmin's sport type IDs (reverse-engineered) */
const STRENGTH_SPORT_TYPE = {
  sportTypeId: 5,
  sportTypeKey: "strength_training",
} as const;

/**
 * Garmin's step type IDs — verified against
 * @flow-js/garmin-connect/dist/garmin/workout-builder/step.js
 */
const STEP_TYPES = {
  warmup: { stepTypeId: 1, stepTypeKey: "warmup" as const },
  cooldown: { stepTypeId: 2, stepTypeKey: "cooldown" as const },
  interval: { stepTypeId: 3, stepTypeKey: "interval" as const },
  recovery: { stepTypeId: 4, stepTypeKey: "recovery" as const },
  rest: { stepTypeId: 5, stepTypeKey: "rest" as const },
  repeat: { stepTypeId: 6 as const, stepTypeKey: "repeat" as const },
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

    // Each exercise = 1 repeat group (top-level step)
    const estimatedSteps = workout.exercises.length;

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
    const steps: GarminWorkoutStepOrGroup[] = [];
    let stepOrder = 1;

    // Build a repeat group for each exercise (warmup and main alike).
    // Each group contains: exercise step + rest step, repeated N times.
    // The rest inside the group handles both inter-set rest and the
    // transition to the next exercise.
    for (const ex of workout.exercises) {
      const type = ex.isWarmup ? "warmup" : "interval";
      const group = this.buildRepeatGroup(ex, stepOrder, type);
      steps.push(group);
      stepOrder += 1;
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

  private buildRepeatGroup(
    ex: ResolvedExercise,
    order: number,
    type: "warmup" | "interval",
  ): GarminRepeatGroup {
    const exerciseStep = this.buildExerciseStep(ex, 1, type);
    const restStep = this.buildRestStep(2, ex.effectiveRestSeconds);

    return {
      stepOrder: order,
      stepType: STEP_TYPES.repeat,
      numberOfIterations: ex.sets,
      smartRepeat: false,
      endCondition: { conditionTypeKey: "iterations" },
      type: "RepeatGroupDTO",
      workoutSteps: [exerciseStep, restStep],
    };
  }

  private buildExerciseStep(
    ex: ResolvedExercise,
    order: number,
    type: "warmup" | "interval",
  ): GarminWorkoutStep {
    const step: GarminWorkoutStep = {
      type: "ExecutableStepDTO",
      stepOrder: order,
      stepType: STEP_TYPES[type],
      endCondition: { conditionTypeKey: "reps" },
      endConditionValue: ex.effectiveReps,
    };

    if (ex.garminType) {
      step.exerciseCategory = {
        category: ex.garminType.category,
        exerciseName: ex.garminType.exerciseName,
      };
    }

    if (ex.weightKg !== null && ex.weightKg > 0) {
      step.weightValue = { value: ex.weightKg };
    }

    step.description = this.buildStepDescription(ex, type);

    return step;
  }

  private buildRestStep(order: number, seconds: number): GarminWorkoutStep {
    return {
      type: "ExecutableStepDTO",
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

    // Sets are represented by the repeat group's numberOfIterations,
    // so the description only needs reps and weight.
    parts.push(`${ex.effectiveReps} reps`);

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
