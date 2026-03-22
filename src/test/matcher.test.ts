import { describe, expect, it } from "vitest";
import {
  matchActivityToWorkout,
  matchActivitiesToWorkouts,
  fuzzyScore,
} from "@/lib/analysis/matcher";

// ─── matchActivityToWorkout ─────────────────────────────────────

describe("matchActivityToWorkout", () => {
  const workouts = [
    { id: "w1", workoutName: "Push Day", lastPushedAt: 1700000000000 },
    { id: "w2", workoutName: "Pull Day", lastPushedAt: 1700086400000 },
    { id: "w3", workoutName: "Legs", lastPushedAt: 1700172800000 },
  ];

  it("matches exact name (same case)", () => {
    const activity = { id: "a1", activityName: "Push Day", startTime: null };
    const result = matchActivityToWorkout(activity, workouts);
    expect(result).not.toBeNull();
    expect(result!.workoutId).toBe("w1");
    expect(result!.confidence).toBe(1.0);
    expect(result!.matchMethod).toBe("exact-name");
  });

  it("matches exact name case-insensitively", () => {
    const activity = { id: "a1", activityName: "push day", startTime: null };
    const result = matchActivityToWorkout(activity, workouts);
    expect(result).not.toBeNull();
    expect(result!.workoutId).toBe("w1");
    expect(result!.confidence).toBe(1.0);
    expect(result!.matchMethod).toBe("exact-name");
  });

  it("matches exact name with extra whitespace trimmed", () => {
    const activity = {
      id: "a1",
      activityName: "  Push Day  ",
      startTime: null,
    };
    const result = matchActivityToWorkout(activity, workouts);
    expect(result).not.toBeNull();
    expect(result!.workoutId).toBe("w1");
    expect(result!.matchMethod).toBe("exact-name");
  });

  it("returns null when activity name is null", () => {
    const activity = { id: "a1", activityName: null, startTime: null };
    const result = matchActivityToWorkout(activity, workouts);
    expect(result).toBeNull();
  });

  it("returns null when no match found", () => {
    const activity = {
      id: "a1",
      activityName: "Yoga Session",
      startTime: null,
    };
    const result = matchActivityToWorkout(activity, workouts);
    expect(result).toBeNull();
  });

  it("matches by date proximity when name does not match", () => {
    const activity = {
      id: "a1",
      activityName: "Strength Training",
      startTime: 1700000060000, // 1 minute after w1 push
    };
    const result = matchActivityToWorkout(activity, workouts);
    expect(result).not.toBeNull();
    expect(result!.workoutId).toBe("w1");
    expect(result!.confidence).toBe(0.5);
    expect(result!.matchMethod).toBe("date-proximity");
  });

  it("does not match by date proximity beyond 24 hours", () => {
    const activity = {
      id: "a1",
      activityName: "Strength Training",
      startTime: 1700000000000 + 86400000 + 1, // just over 1 day after w1
    };
    // Should not match w1 (>24h), but may match w2 if within range
    const result = matchActivityToWorkout(activity, [workouts[0]]);
    expect(result).toBeNull();
  });

  it("returns null when workouts list is empty", () => {
    const activity = {
      id: "a1",
      activityName: "Push Day",
      startTime: null,
    };
    const result = matchActivityToWorkout(activity, []);
    expect(result).toBeNull();
  });
});

// ─── fuzzy matching ─────────────────────────────────────────────

describe("matchActivityToWorkout (fuzzy)", () => {
  it("matches via substring containment when score > 0.6", () => {
    const workouts = [
      { id: "w1", workoutName: "Push", lastPushedAt: null },
    ];
    // "push" (4 chars) contained in "pushy" (5 chars) → 4/5 = 0.8
    const activity = { id: "a1", activityName: "Pushy", startTime: null };
    const result = matchActivityToWorkout(activity, workouts);
    expect(result).not.toBeNull();
    expect(result!.matchMethod).toBe("fuzzy-name");
    expect(result!.confidence).toBeGreaterThan(0.6);
  });

  it("does not match via fuzzy when score is too low", () => {
    const workouts = [
      {
        id: "w1",
        workoutName: "Push Day Chest and Triceps",
        lastPushedAt: null,
      },
    ];
    // "ab" contained in long name → very low ratio
    const activity = { id: "a1", activityName: "AB", startTime: null };
    const result = matchActivityToWorkout(activity, workouts);
    // Score = 2/26 = ~0.077, below 0.6 threshold
    expect(result).toBeNull();
  });
});

// ─── matchActivitiesToWorkouts (batch) ──────────────────────────

describe("matchActivitiesToWorkouts", () => {
  it("matches multiple activities to different workouts", () => {
    const activities = [
      { id: "a1", activityName: "Push Day", startTime: null },
      { id: "a2", activityName: "Pull Day", startTime: null },
    ];
    const workouts = [
      { id: "w1", workoutName: "Push Day", lastPushedAt: null },
      { id: "w2", workoutName: "Pull Day", lastPushedAt: null },
    ];

    const results = matchActivitiesToWorkouts(activities, workouts);
    expect(results.size).toBe(2);
    expect(results.get("a1")!.workoutId).toBe("w1");
    expect(results.get("a2")!.workoutId).toBe("w2");
  });

  it("prevents double-matching the same workout", () => {
    const activities = [
      { id: "a1", activityName: "Push Day", startTime: null },
      { id: "a2", activityName: "Push Day", startTime: null },
    ];
    const workouts = [
      { id: "w1", workoutName: "Push Day", lastPushedAt: null },
    ];

    const results = matchActivitiesToWorkouts(activities, workouts);
    // Only the first activity should match
    expect(results.size).toBe(1);
    expect(results.get("a1")!.workoutId).toBe("w1");
    expect(results.has("a2")).toBe(false);
  });

  it("returns empty map when no matches", () => {
    const activities = [
      { id: "a1", activityName: "Yoga", startTime: null },
    ];
    const workouts = [
      { id: "w1", workoutName: "Push Day", lastPushedAt: null },
    ];

    const results = matchActivitiesToWorkouts(activities, workouts);
    expect(results.size).toBe(0);
  });

  it("handles empty activities list", () => {
    const workouts = [
      { id: "w1", workoutName: "Push Day", lastPushedAt: null },
    ];
    const results = matchActivitiesToWorkouts([], workouts);
    expect(results.size).toBe(0);
  });

  it("handles empty workouts list", () => {
    const activities = [
      { id: "a1", activityName: "Push Day", startTime: null },
    ];
    const results = matchActivitiesToWorkouts(activities, []);
    expect(results.size).toBe(0);
  });
});

// ─── fuzzyScore ─────────────────────────────────────────────────

describe("fuzzyScore", () => {
  it("returns 1.0 for identical strings", () => {
    expect(fuzzyScore("push day", "push day")).toBe(1);
  });

  it("returns ratio for substring containment", () => {
    // "push" (4) in "push day" (8) → 4/8 = 0.5
    const score = fuzzyScore("push", "push day");
    expect(score).toBeCloseTo(0.5);
  });

  it("returns word overlap for non-substring strings", () => {
    // "monday push" vs "push friday" → intersection {"push"} = 1, union {"monday","push","friday"} = 3
    const score = fuzzyScore("monday push", "push friday");
    expect(score).toBeCloseTo(1 / 3);
  });

  it("returns 0 for completely different strings", () => {
    expect(fuzzyScore("yoga", "swimming")).toBe(0);
  });

  it("handles single-word strings", () => {
    // "legs" vs "legs" → substring containment → 4/4 = 1.0
    expect(fuzzyScore("legs", "legs")).toBe(1);
  });

  it("handles empty strings", () => {
    expect(fuzzyScore("", "")).toBe(0);
    expect(fuzzyScore("push", "")).toBe(0);
    expect(fuzzyScore("", "push")).toBe(0);
  });
});
