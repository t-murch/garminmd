import type {
  GarminRepeatGroup,
  GarminWorkoutPayload,
  GarminWorkoutStep,
  GarminWorkoutStepOrGroup,
} from "@/lib/core/types";
import type {
  IGarminTokens,
  IWorkout,
  IWorkoutDetail,
  IWorkoutSegment,
  IWorkoutStep,
} from "@flow-js/garmin-connect";

// ─── Public Types ──────────────────────────────────────────────

export interface GarminActivitySummary {
  activityId: number;
  activityName: string;
  startTimeLocal: string;
  startTimeGMT: string;
  duration: number;
  activityType: { typeKey: string; typeId: number };
  sportTypeId: number;
  calories: number;
  averageHR: number | null;
}

export interface GarminActivityDetail {
  activityId: number;
  exerciseSets: Array<{
    setOrder: number;
    exerciseName: string | null;
    category: string | null;
    reps: number | null;
    weight: number | null;
    duration: number | null;
  }>;
}

export interface GarminClient {
  /** Push a workout to Garmin Connect. Returns the Garmin-assigned workout ID. */
  pushWorkout(payload: GarminWorkoutPayload): Promise<string>;
  /** Replace an existing workout on Garmin Connect (delete + create). Returns the new workout ID. */
  updateWorkout(
    workoutId: string,
    payload: GarminWorkoutPayload,
  ): Promise<string>;
  /** List workouts from Garmin Connect. */
  listWorkouts(start?: number, limit?: number): Promise<IWorkout[]>;
  /** Delete a workout from Garmin Connect by its ID. */
  deleteWorkout(workoutId: string): Promise<void>;
  /** Export the current session tokens for storage. */
  getSessionTokens(): IGarminTokens;
  /** Fetch recent activities from Garmin Connect. */
  getActivities(
    start?: number,
    limit?: number,
  ): Promise<GarminActivitySummary[]>;
  /** Fetch exercise set details for a specific activity. Returns null if unavailable. */
  getActivityDetails(
    activityId: number,
  ): Promise<GarminActivityDetail | null>;
}

export class GarminAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GarminAuthError";
  }
}

export class GarminServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GarminServiceError";
  }
}

// ─── Client Factory ────────────────────────────────────────────

/**
 * Create an authenticated Garmin Connect client.
 *
 * If session tokens from a previous login are provided, they will be
 * loaded instead of performing a fresh login — this avoids unnecessary
 * auth round-trips and Garmin rate limits.
 */
export async function createGarminClient(
  email: string,
  password: string,
  existingTokens?: IGarminTokens,
): Promise<GarminClient> {
  // The package is CJS, so we use dynamic import with esModuleInterop.
  const { GarminConnect } = await import("@flow-js/garmin-connect");
  const gc = new GarminConnect({ username: email, password });

  if (existingTokens) {
    try {
      gc.loadToken(existingTokens.oauth1, existingTokens.oauth2);
      // Verify the loaded tokens still work by making a lightweight call.
      await gc.getUserProfile();
      return wrapClient(gc);
    } catch {
      // Tokens expired or invalid — fall through to fresh login.
    }
  }

  // If no real password is available, we can't attempt a fresh login.
  // This happens when the push route uses stored tokens that have expired.
  if (!password) {
    throw new GarminAuthError(
      "Garmin session expired. Please reconnect your Garmin account in Settings.",
    );
  }

  try {
    await gc.login(email, password);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes("401") ||
      message.includes("credentials") ||
      message.includes("Unauthorized")
    ) {
      throw new GarminAuthError(
        "Invalid Garmin credentials. Check your email and password.",
      );
    }
    throw new GarminServiceError(`Garmin Connect is unavailable: ${message}`);
  }

  return wrapClient(gc);
}

// ─── Internal Wrapper ──────────────────────────────────────────

/**
 * Wraps the raw GarminConnect instance in the narrow GarminClient
 * interface and handles payload mapping.
 */
function wrapClient(
  gc: InstanceType<typeof import("@flow-js/garmin-connect").GarminConnect>,
): GarminClient {
  return {
    async pushWorkout(payload: GarminWorkoutPayload): Promise<string> {
      const detail = toGarminWorkoutDetail(payload);
      const created = await gc.createWorkout(detail);
      return String(created.workoutId);
    },

    async updateWorkout(
      workoutId: string,
      payload: GarminWorkoutPayload,
    ): Promise<string> {
      // Garmin's workout API doesn't support PUT — delete and recreate instead.
      // Swallow 404 — the workout may already be gone (stale DB reference).
      try {
        await gc.deleteWorkout({ workoutId });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("404") && !msg.includes("NotFound")) {
          throw err;
        }
      }
      const detail = toGarminWorkoutDetail(payload);
      const created = await gc.createWorkout(detail);
      return String(created.workoutId);
    },

    async listWorkouts(
      start: number = 0,
      limit: number = 100,
    ): Promise<IWorkout[]> {
      return gc.getWorkouts(start, limit);
    },

    async deleteWorkout(workoutId: string): Promise<void> {
      await gc.deleteWorkout({ workoutId });
    },

    getSessionTokens(): IGarminTokens {
      return gc.exportToken();
    },

    async getActivities(
      start: number = 0,
      limit: number = 20,
    ): Promise<GarminActivitySummary[]> {
      const raw = await gc.getActivities(start, limit);
      return raw.map((a) => ({
        activityId: a.activityId,
        activityName: a.activityName ?? "Untitled",
        startTimeLocal: a.startTimeLocal ?? "",
        startTimeGMT: a.startTimeGMT ?? "",
        duration: a.duration ?? 0,
        activityType: {
          typeKey: a.activityType?.typeKey ?? "unknown",
          typeId: a.activityType?.typeId ?? 0,
        },
        sportTypeId: a.sportTypeId ?? 0,
        calories: a.calories ?? 0,
        averageHR: a.averageHR ?? null,
      }));
    },

    async getActivityDetails(
      activityId: number,
    ): Promise<GarminActivityDetail | null> {
      // The Garmin Connect API exposes exercise set data at this endpoint.
      // The @flow-js/garmin-connect library doesn't have a dedicated method,
      // but it provides a generic get() for arbitrary Garmin API calls.
      try {
        const url = `https://connect.garmin.com/activity-service/activity/${activityId}/exerciseSets`;
        const data = await gc.get<{
          exerciseSets?: Array<{
            setOrder?: number;
            exercises?: Array<{
              exerciseName?: string;
              category?: string;
            }>;
            repetitionCount?: number;
            weight?: number;
            duration?: number;
          }>;
        }>(url);

        if (!data?.exerciseSets) {
          return null;
        }

        return {
          activityId,
          exerciseSets: data.exerciseSets.map((s, i) => ({
            setOrder: s.setOrder ?? i + 1,
            exerciseName: s.exercises?.[0]?.exerciseName ?? null,
            category: s.exercises?.[0]?.category ?? null,
            reps: s.repetitionCount ?? null,
            weight: s.weight ?? null,
            duration: s.duration ?? null,
          })),
        };
      } catch {
        // Exercise set endpoint may not exist for non-strength activities
        // or may require specific Garmin API permissions — return null gracefully
        return null;
      }
    },
  };
}

// ─── Payload Mapping ───────────────────────────────────────────

/**
 * Maps our GarminWorkoutPayload to the library's IWorkoutDetail format.
 *
 * Our payload is a clean subset; the library's type includes many nullable
 * fields that Garmin Connect doesn't require for creation.
 */
function toGarminWorkoutDetail(
  payload: GarminWorkoutPayload,
  existingWorkoutId?: string,
): IWorkoutDetail {
  const segments: IWorkoutSegment[] = payload.workoutSegments.map((seg) => ({
    segmentOrder: seg.segmentOrder,
    sportType: {
      sportTypeId: seg.sportType.sportTypeId,
      sportTypeKey: seg.sportType.sportTypeKey,
      displayOrder: seg.segmentOrder,
    },
    workoutSteps: seg.workoutSteps.map(mapStepOrGroup),
  }));

  // The library's IWorkoutDetail type is overly strict with null-only fields.
  // We use a type assertion since the Garmin API actually accepts these values.
  const detail = {
    workoutName: payload.workoutName,
    description: payload.description ?? null,
    sportType: {
      sportTypeId: payload.sportType.sportTypeId,
      sportTypeKey: payload.sportType.sportTypeKey,
      displayOrder: 1,
    },
    workoutSegments: segments,
    // Fields required by IWorkoutDetail but not meaningful for creation
    updateDate: new Date(),
    createdDate: new Date(),
    trainingPlanId: null,
    author: {
      userProfilePk: null,
      displayName: null,
      fullName: null,
      profileImgNameLarge: null,
      profileImgNameMedium: null,
      profileImgNameSmall: null,
      userPro: false,
      vivokidUser: false,
    },
    estimatedDurationInSecs: 0,
    estimatedDistanceInMeters: null,
    estimateType: null,
    estimatedDistanceUnit: { unitId: null, unitKey: null, factor: null },
    poolLength: 0,
    poolLengthUnit: { unitId: null, unitKey: null, factor: null },
    workoutProvider: "",
    workoutSourceId: "",
    consumer: null,
    atpPlanId: null,
    workoutNameI18nKey: null,
    descriptionI18nKey: null,
    shared: false,
    estimated: false,
  } as IWorkoutDetail;

  if (existingWorkoutId) {
    (detail as IWorkoutDetail & { workoutId?: number }).workoutId =
      Number(existingWorkoutId);
  }

  return detail;
}

function mapStepOrGroup(step: GarminWorkoutStepOrGroup): IWorkoutStep {
  if (step.type === "RepeatGroupDTO") {
    return mapRepeatGroup(step as GarminRepeatGroup);
  }
  return mapExecutableStep(step as GarminWorkoutStep);
}

function mapRepeatGroup(group: GarminRepeatGroup): IWorkoutStep {
  // The library's IWorkoutStep type doesn't model RepeatGroupDTO, but
  // the Garmin API accepts this shape. We cast through unknown.
  return ({
    type: "RepeatGroupDTO",
    stepId: 0,
    stepOrder: group.stepOrder,
    stepType: {
      stepTypeId: 6,
      stepTypeKey: "repeat",
      displayOrder: 6,
    },
    numberOfIterations: group.numberOfIterations,
    smartRepeat: false,
    childStepId: null,
    endCondition: {
      conditionTypeId: 7,
      conditionTypeKey: "iterations",
      displayOrder: 7,
      displayable: false,
    },
    endConditionValue: null,
    workoutSteps: group.workoutSteps.map(mapExecutableStep),
  }) as unknown as IWorkoutStep;
}

function mapExecutableStep(step: GarminWorkoutStep): IWorkoutStep {
  // The library's IWorkoutStep type uses literal `null` for fields like
  // category, exerciseName, weightValue, weightUnit. The Garmin API
  // actually accepts string/number values there, so we assert the type.
  return {
    type: "ExecutableStepDTO",
    stepId: 0,
    stepOrder: step.stepOrder,
    stepType: {
      stepTypeId: step.stepType.stepTypeId,
      stepTypeKey: step.stepType.stepTypeKey,
      displayOrder: step.stepOrder,
    },
    childStepId: null,
    description: step.description ?? null,
    endCondition: {
      conditionTypeId: endConditionTypeId(step.endCondition.conditionTypeKey),
      conditionTypeKey: step.endCondition.conditionTypeKey,
      displayOrder: 1,
      displayable: true,
    },
    endConditionValue: step.endConditionValue ?? null,
    preferredEndConditionUnit: null,
    endConditionCompare: null,
    targetType: {
      workoutTargetTypeId: 1,
      workoutTargetTypeKey: "no.target",
      displayOrder: 1,
    },
    targetValueOne: null,
    targetValueTwo: null,
    targetValueUnit: null,
    zoneNumber: null,
    secondaryTargetType: null,
    secondaryTargetValueOne: null,
    secondaryTargetValueTwo: null,
    secondaryTargetValueUnit: null,
    secondaryZoneNumber: null,
    endConditionZone: null,
    strokeType: {
      strokeTypeId: 0,
      strokeTypeKey: null,
      displayOrder: 0,
    },
    equipmentType: {
      equipmentTypeId: 0,
      equipmentTypeKey: null,
      displayOrder: 0,
    },
    category: step.exerciseCategory?.category ?? null,
    exerciseName: step.exerciseCategory?.exerciseName ?? null,
    workoutProvider: null,
    providerExerciseSourceId: null,
    weightValue: step.weightValue?.value ?? null,
    weightUnit: step.weightValue
      ? { unitId: 4, unitKey: "kg", factor: null }
      : null,
  } as IWorkoutStep;
}

function endConditionTypeId(key: string): number {
  switch (key) {
    case "reps":
      return 10;
    case "repetitions":
      return 7;
    case "iterations":
      return 7;
    case "time":
      return 2;
    case "lap.button":
      return 1;
    default:
      return 1;
  }
}
