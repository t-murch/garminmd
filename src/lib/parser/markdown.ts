import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Root, Table, TableRow, Heading, Text } from "mdast";
import { ParsedWorkout, ParsedExercise } from "../core/types";
import { detectRepsFromHeader, detectRestFromHeader } from "./rest-detector";

/**
 * Parse a markdown string into structured workout sessions.
 * Splits on ## headings, extracts tables within each section.
 */
export function parseMarkdown(
  md: string,
  opts: { week?: number } = {},
): ParsedWorkout[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(md) as Root;
  const sections = splitIntoSections(tree);
  const workouts: ParsedWorkout[] = [];

  for (const section of sections) {
    const table = findFirstTable(section.children);
    if (!table) continue;

    // Skip non-exercise tables (weekly structure, phase progression, etc.)
    const headers = extractHeaders(table);
    if (!hasExerciseColumn(headers)) continue;

    const headerText = section.headingText;
    // Collect all text from non-table nodes for detecting reps/rest info
    const sectionText = section.children
      .filter((n) => n.type !== "table")
      .map((n) => extractTextFromNode(n))
      .join(" ");
    const workout: ParsedWorkout = {
      name: cleanWorkoutName(headerText),
      dayOfWeek: detectDayOfWeek(headerText),
      sportTypeHint: detectSportType(headerText),
      defaultReps: detectRepsFromHeader(sectionText),
      defaultRestSeconds: detectRestFromHeader(sectionText),
      progressionRule: findProgressionRule(section.children),
      exercises: parseExerciseTable(table, headers, opts.week ?? null),
    };

    if (workout.exercises.length > 0) {
      workouts.push(workout);
    }
  }

  return workouts;
}

// ─── Section Splitting ──────────────────────────────────────────

interface Section {
  headingText: string;
  headingDepth: number;
  children: Root["children"];
}

/**
 * Split AST into sections by ## or ### headings.
 * Each section contains the heading + all nodes until the next heading of same/higher level.
 */
function splitIntoSections(tree: Root): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const node of tree.children) {
    if (node.type === "heading" && (node as Heading).depth <= 3) {
      const h = node as Heading;
      current = {
        headingText: extractTextFromNode(h),
        headingDepth: h.depth,
        children: [node],
      };
      sections.push(current);
    } else if (current) {
      current.children.push(node);
    }
  }

  return sections;
}

// ─── Table Parsing ──────────────────────────────────────────────

interface ColumnMap {
  exercise: number;
  sets: number;
  reps: number | null;
  weight: number | null;
  startWeight: number | null;
  rest: number | null;
  order: number | null;
  notes: number | null;
  weekColumns: Map<number, number>; // week number → column index
}

function findFirstTable(children: Root["children"]): Table | null {
  for (const node of children) {
    if (node.type === "table") return node as Table;
  }
  return null;
}

function extractHeaders(table: Table): string[] {
  const headerRow = table.children[0];
  if (!headerRow) return [];
  return headerRow.children.map((cell) => extractTextFromNode(cell).trim());
}

function hasExerciseColumn(headers: string[]): boolean {
  const lower = headers.map((h) => h.toLowerCase());
  return lower.some(
    (h) =>
      h === "exercise" || h === "exercises" || h === "movement" || h === "lift",
  );
}

function buildColumnMap(headers: string[]): ColumnMap | null {
  const lower = headers.map((h) => h.toLowerCase());
  const exerciseIdx = lower.findIndex(
    (h) =>
      h === "exercise" || h === "exercises" || h === "movement" || h === "lift",
  );
  if (exerciseIdx === -1) return null;

  const setsIdx = lower.findIndex((h) => h === "sets" || h === "set");
  if (setsIdx === -1) return null;

  const weekColumns = new Map<number, number>();
  for (let i = 0; i < headers.length; i++) {
    const wkMatch = headers[i].match(/^wk\s*(\d+)$/i);
    if (wkMatch) weekColumns.set(parseInt(wkMatch[1]), i);
  }

  return {
    exercise: exerciseIdx,
    sets: setsIdx,
    reps: lower.findIndex((h) => h === "reps" || h === "rep"),
    weight: lower.findIndex((h) => h === "weight"),
    startWeight: lower.findIndex(
      (h) =>
        h === "start weight" || h === "start wt" || h === "starting weight",
    ),
    rest: lower.findIndex((h) => h === "rest"),
    order: lower.findIndex((h) => h === "#" || h === "order" || h === "no"),
    notes: lower.findIndex((h) => h === "notes" || h === "note"),
    weekColumns,
  };
}

function parseExerciseTable(
  table: Table,
  headers: string[],
  targetWeek: number | null,
): ParsedExercise[] {
  const colMap = buildColumnMap(headers);
  if (!colMap) return [];

  const exercises: ParsedExercise[] = [];
  // Skip header row (index 0)
  const dataRows = table.children.slice(1);

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const cells = row.children.map((cell) => extractTextFromNode(cell).trim());

    const rawName = cells[colMap.exercise] ?? "";
    if (!rawName) continue;

    const orderCell =
      colMap.order !== null && colMap.order !== -1
        ? (cells[colMap.order] ?? "")
        : "";
    const isWarmup = detectWarmup(orderCell, rawName);
    const { cleanName, notes } = extractNotes(rawName);

    // Determine weight: weekly column → Start Weight column → Weight column
    const weeklyData = extractWeeklyData(cells, colMap.weekColumns);
    const weight = resolveWeight(cells, colMap, targetWeek, weeklyData);

    exercises.push({
      order: i,
      rawName: cleanName,
      sets: parseIntSafe(cells[colMap.sets]) ?? 3,
      reps:
        colMap.reps !== null && colMap.reps !== -1
          ? parseIntSafe(cells[colMap.reps])
          : null,
      weight: weight?.value ?? null,
      weightUnit: weight?.unit ?? null,
      isWarmup,
      restSeconds:
        colMap.rest !== null && colMap.rest !== -1
          ? parseRestValue(cells[colMap.rest])
          : null,
      notes,
      weeklyData,
    });
  }

  return exercises;
}

// ─── Weight Resolution ──────────────────────────────────────────

interface WeightValue {
  value: number;
  unit: "lbs" | "kg";
}

/**
 * Resolve the weight for this exercise.
 * Priority: target week column → Start Weight column → Weight column
 */
function resolveWeight(
  cells: string[],
  colMap: ColumnMap,
  targetWeek: number | null,
  weeklyData: Record<number, string | null>,
): WeightValue | null {
  // 1. If a target week is specified and that column has data, parse weight from it
  if (targetWeek !== null && weeklyData[targetWeek]) {
    const parsed = parseWeightFromWeekCell(weeklyData[targetWeek]!);
    if (parsed) return parsed;
  }

  // 2. Start Weight column
  if (colMap.startWeight !== null && colMap.startWeight !== -1) {
    const sw = cells[colMap.startWeight];
    if (sw) {
      const parsed = parseWeightString(sw);
      if (parsed) return parsed;
    }
  }

  // 3. Weight column
  if (colMap.weight !== null && colMap.weight !== -1) {
    const w = cells[colMap.weight];
    if (w) {
      const parsed = parseWeightString(w);
      if (parsed) return parsed;
    }
  }

  return null;
}

/**
 * Parse weight from a weekly data cell like "30-10, 12, 12" or "10 x 12 x 12"
 * The first number might be a weight if it deviates from the Start Weight.
 * For now, we don't extract weight from week cells — use Start Weight.
 */
function parseWeightFromWeekCell(cell: string): WeightValue | null {
  // Week cells like "10 x 12 x 12" are rep logs, not weights.
  // Cells like "30-10, 12, 12" mean "30 lbs, 10 reps, 12 reps, 12 reps"
  // This is complex and user-specific notation — defer to Start Weight.
  // Future: LLM could parse these with context.
  return null;
}

/** Parse "35 lbs", "15.9 kg", "135", etc. */
function parseWeightString(s: string): WeightValue | null {
  const match = s.match(/^([\d.]+)\s*(lbs?|kg)?/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  if (isNaN(value)) return null;
  const unit = match[2]?.toLowerCase().startsWith("k") ? "kg" : "lbs";
  return { value, unit: unit as "lbs" | "kg" };
}

// ─── Helpers ────────────────────────────────────────────────────

function detectWarmup(orderCell: string, name: string): boolean {
  const o = orderCell.toLowerCase().trim();
  return (
    o === "wu" ||
    o === "w" ||
    o === "warmup" ||
    o === "warm-up" ||
    name.toLowerCase().includes("(warm-up)") ||
    name.toLowerCase().includes("(warmup)") ||
    name.toLowerCase().includes("warm up")
  );
}

function extractNotes(name: string): {
  cleanName: string;
  notes: string | null;
} {
  // Extract parenthetical notes: "Single Arm Cable Row (each side)" → notes = "each side"
  const match = name.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (match) {
    const inner = match[2].toLowerCase();
    // Don't strip if it's a warm-up annotation (already handled)
    if (inner === "warm-up" || inner === "warmup") {
      return { cleanName: match[1].trim(), notes: null };
    }
    return { cleanName: match[1].trim(), notes: match[2].trim() };
  }
  return { cleanName: name, notes: null };
}

function extractWeeklyData(
  cells: string[],
  weekColumns: Map<number, number>,
): Record<number, string | null> {
  const data: Record<number, string | null> = {};
  for (const [wk, colIdx] of weekColumns) {
    const val = cells[colIdx]?.trim();
    data[wk] = val || null;
  }
  return data;
}

function parseRestValue(s: string | undefined): number | null {
  if (!s) return null;
  const match = s.match(/(\d+)\s*s?/i);
  return match ? parseInt(match[1]) : null;
}

function parseIntSafe(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseInt(s);
  return isNaN(n) ? null : n;
}

function cleanWorkoutName(heading: string): string {
  // Remove emoji, day prefixes, "Runna" references
  return heading
    .replace(
      /[\u{1F3CB}\u{1F3C3}\u{1F4C5}\u{1F4DD}\u{1F4C8}\u{2699}\u{26A0}\u{2705}\u{274C}\u{1F4A1}]/gu,
      "",
    )
    .replace(
      /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*[—–-]\s*/i,
      "",
    )
    .replace(/\s*\(Runna\)\s*/i, "")
    .replace(/\s*[—–-]\s*Gym Rest\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function detectDayOfWeek(heading: string): string | null {
  const days = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  const lower = heading.toLowerCase();
  return days.find((d) => lower.includes(d.toLowerCase())) ?? null;
}

function detectSportType(heading: string): ParsedWorkout["sportTypeHint"] {
  const lower = heading.toLowerCase();
  if (/\b(running|run)\b/.test(lower) || /\btempo\b/.test(lower))
    return "running";
  if (/\b(cycling|bike|ride)\b/.test(lower))
    return "cycling";
  return "strength";
}

/** Walk an mdast node tree and extract all text content */
function extractTextFromNode(node: any): string {
  if (node.type === "text") return (node as Text).value;
  if (node.children) return node.children.map(extractTextFromNode).join("");
  return "";
}

function findProgressionRule(children: Root["children"]): string | null {
  for (const node of children) {
    const text = extractTextFromNode(node);
    if (text.toLowerCase().includes("progression rule")) {
      // Extract text after "Progression Rule:"
      const match = text.match(/progression rule[:\s]*(.+)/i);
      return match ? match[1].trim() : text.trim();
    }
  }
  return null;
}
