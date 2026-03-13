import { parseMarkdown } from "@/lib/parser/markdown";
import {
  detectRepsFromHeader,
  detectRestFromHeader,
} from "@/lib/parser/rest-detector";
import { selectWeek } from "@/lib/parser/week-selector";
import { describe, expect, it } from "vitest";

// ─── Fixture: Your Actual Monday Push Day from "Health is Wealth" ───

const PUSH_DAY_MD = `
## Push — Chest + Triceps
**Target:** 10–12 reps · Rest 60–90s

| # | Exercise | Sets | Start Weight | Wk 1 | Wk 2 | Wk 3 | Wk 4 |
|---|---|---|---|---|---|---|---|
| WU | DB Bench Press (warm-up) | 2 | 25 lbs | 20 - 12, 25 - 10 | | | |
| 1 | DB Bench Press | 3 | 35 lbs | 10 x 12 x 12 | | | |
| 2 | Incline DB Bench Press | 3 | 25 lbs | 30 - 10, 12, 12 | | | |
| 3 | Incline DB Flies | 3 | 20 lbs | 12 x 10 x 10 | | | |
| 4 | Cable Pec Flies | 3 | 20 lbs | 12 x 10 x 10 | | | |
| 5 | Cable Tricep Pressdown | 3 | 70 lbs | 10 x 12 x 12 | | | |
| 6 | Cable Overhead Tricep Pull | 3 | 30 lbs | 12 x 10 x 10 | | | |
| 7 | EZ Bar Skull Crusher | 3 | 30 lbs | | | | |

**Progression Rule:** 12 clean reps on all 3 sets → add 5 lbs next session.
`;

// ─── Fixture: Your Tuesday Pull Day ─────────────────────────────

const PULL_DAY_MD = `
## Tuesday — Pull (Back + Biceps)
**Target:** 10–12 reps · Rest 60–90s

| # | Exercise | Sets | Start Weight | Wk 1 | Wk 2 | Wk 3 | Wk 4 |
|---|---|---|---|---|---|---|---|
| WU | Single Arm Cable Row (each side) | 2 | 20 lbs | L:10 / R:10 · L:12 / R:12 | | | |
| 1 | Single Arm Cable Row | 4 | 30 lbs | 12 · 12 · 12 · 12 | | | |
| 2 | Lat Pulldown | 3 | 90 lbs | 90×10 · 85×10 · 85×10 | | | |
| 3 | Seated Cable Rows | 3 | 80 lbs | 75×9 · 70×10 · 70×12 | | | |
| 4 | Straight-Arm Cable Pulldown | 3 | 65 lbs | 60×12 · 70×8 · 60×12 | | | |
| 5 | BB Bicep Curl | 3 | 20 lbs | 20×12 · 20×10 · 20×10 | | | |
| 6 | Alt DB Incline Bicep Curl | 3 | 15 lbs | 15×10 · 15×8 · 15×8 | | | |

**Progression Rule:** 12 clean reps across all sets → add 5 lbs.
`;

// ─── Fixture: Minimal table (bare minimum columns) ──────────────

const MINIMAL_MD = `
## Quick Chest

| Exercise | Sets |
|---|---|
| Push-ups | 3 |
| Dips | 3 |
`;

// ─── Fixture: Full week with non-exercise tables ────────────────

const FULL_WEEK_MD = `
# Training Program — Strength + 5k

## Weekly Structure

| Day | Session | Focus |
|---|---|---|
| Monday | Run + Push | Easy Run → Push (Chest + Triceps) |
| Tuesday | Pull | Back + Biceps |

${PUSH_DAY_MD}

${PULL_DAY_MD}

## Phase Progression

| Phase | Weeks | Rep Target | Notes |
|---|---|---|---|
| Phase 1 – Foundation | 1–4 | 10–12 | Re-establish movement patterns |

## Weekly Check-In

| Week | Gym Days Done | Runs Done | Biggest Win | What to Improve |
|---|---|---|---|---|
| 1 | /4 | /4 | | |
`;

// ─── Tests ──────────────────────────────────────────────────────

describe("parseMarkdown", () => {
  describe("Push Day (real Notion data)", () => {
    const workouts = parseMarkdown(PUSH_DAY_MD);

    it("parses exactly one workout", () => {
      expect(workouts).toHaveLength(1);
    });

    it("extracts workout name without emoji or day prefix", () => {
      expect(workouts[0].name).toBe("Push — Chest + Triceps");
    });

    it("detects default reps from header", () => {
      expect(workouts[0].defaultReps).toBe(12);
    });

    it("detects default rest from header", () => {
      expect(workouts[0].defaultRestSeconds).toBe(90);
    });

    it("detects sport type as strength", () => {
      expect(workouts[0].sportTypeHint).toBe("strength");
    });

    it("extracts progression rule", () => {
      expect(workouts[0].progressionRule).toContain("12 clean reps");
    });

    it("parses all 8 exercises (including warm-up)", () => {
      expect(workouts[0].exercises).toHaveLength(8);
    });

    it("detects warm-up from WU row marker", () => {
      const wu = workouts[0].exercises[0];
      expect(wu.isWarmup).toBe(true);
      expect(wu.rawName).toBe("DB Bench Press");
    });

    it("strips (warm-up) annotation from name", () => {
      const wu = workouts[0].exercises[0];
      expect(wu.rawName).not.toContain("warm-up");
    });

    it("parses Start Weight with lbs unit", () => {
      const bench = workouts[0].exercises[1]; // DB Bench Press
      expect(bench.weight).toBe(35);
      expect(bench.weightUnit).toBe("lbs");
    });

    it("parses sets correctly", () => {
      const bench = workouts[0].exercises[1];
      expect(bench.sets).toBe(3);
      const wu = workouts[0].exercises[0];
      expect(wu.sets).toBe(2);
    });

    it("captures weekly data", () => {
      const bench = workouts[0].exercises[1];
      expect(bench.weeklyData[1]).toBe("10 x 12 x 12");
      expect(bench.weeklyData[2]).toBeNull();
    });
  });

  describe("Pull Day (real Notion data)", () => {
    const workouts = parseMarkdown(PULL_DAY_MD);

    it("parses workout name and strips day prefix", () => {
      expect(workouts[0].name).toBe("Pull (Back + Biceps)");
    });

    it("detects Tuesday as day of week", () => {
      expect(workouts[0].dayOfWeek).toBe("Tuesday");
    });

    it("extracts notes from parenthetical", () => {
      const wu = workouts[0].exercises[0];
      expect(wu.notes).toBe("each side");
    });

    it("parses 4 sets for Single Arm Cable Row", () => {
      const row = workouts[0].exercises[1];
      expect(row.sets).toBe(4);
    });
  });

  describe("Minimal table", () => {
    const workouts = parseMarkdown(MINIMAL_MD);

    it("parses with only Exercise + Sets columns", () => {
      expect(workouts).toHaveLength(1);
      expect(workouts[0].exercises).toHaveLength(2);
    });

    it("has null weight and reps when columns are absent", () => {
      const ex = workouts[0].exercises[0];
      expect(ex.weight).toBeNull();
      expect(ex.reps).toBeNull();
    });

    it("defaults to no rest info", () => {
      const ex = workouts[0].exercises[0];
      expect(ex.restSeconds).toBeNull();
    });
  });

  describe("Full week with mixed tables", () => {
    const workouts = parseMarkdown(FULL_WEEK_MD);

    it("skips non-exercise tables (Weekly Structure, Phase, Check-In)", () => {
      // Should only find Push and Pull, not the schedule/phase/checkin tables
      expect(workouts).toHaveLength(2);
    });

    it("preserves order: Push first, Pull second", () => {
      expect(workouts[0].name).toContain("Push");
      expect(workouts[1].name).toContain("Pull");
    });
  });
});

describe("detectRestFromHeader", () => {
  it("parses range: 'Rest 60–90s' → 90", () => {
    expect(detectRestFromHeader("Target: 10–12 reps · Rest 60–90s")).toBe(90);
  });

  it("parses single value: 'Rest 120s' → 120", () => {
    expect(detectRestFromHeader("Rest 120s between sets")).toBe(120);
  });

  it("parses 'Rest: 60 seconds' → 60", () => {
    expect(detectRestFromHeader("Rest: 60 seconds")).toBe(60);
  });

  it("returns null when no rest info", () => {
    expect(detectRestFromHeader("Just some heading")).toBeNull();
  });
});

describe("detectRepsFromHeader", () => {
  it("parses range: '10–12 reps' → 12 (upper bound)", () => {
    expect(detectRepsFromHeader("Target: 10–12 reps · Rest 60–90s")).toBe(12);
  });

  it("parses single: '8 reps' → 8", () => {
    expect(detectRepsFromHeader("Target: 8 reps")).toBe(8);
  });
});

describe("selectWeek", () => {
  it("uses explicit --week flag", () => {
    const result = selectWeek([1, 2, 3, 4], { explicitWeek: 2 });
    expect(result.week).toBe(2);
    expect(result.source).toBe("explicit");
  });

  it("auto-calculates from program start date", () => {
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const result = selectWeek([1, 2, 3, 4], {
      programStartDate: twoWeeksAgo.toISOString(),
    });
    expect(result.week).toBe(2);
    expect(result.source).toBe("auto");
  });

  it("falls back to max available week", () => {
    const result = selectWeek([1, 2, 3, 4], {});
    expect(result.week).toBe(4);
    expect(result.source).toBe("fallback");
  });
});
