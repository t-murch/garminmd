# CLAUDE.md — GarminMD v2

## What This Is

GarminMD is a self-hostable open-source web app. Users connect their Notion training log and their Garmin Connect account. They plan workouts in Notion, the app pushes those plans to Garmin Connect, and after training, the app pulls actual Garmin activity data and uses an LLM to deliver coaching feedback — patterns, streaks, progression analysis, and encouragement.

**Tagline:** Plan in Notion. Train with Garmin. Get coached by AI.
**License:** MIT
**Framework:** Next.js 16 (App Router) + ShadCN + Tailwind
**Language:** TypeScript (Node.js 20+, ESM)
**Package Manager:** pnpm

## The Loop

```
Notion (user plans workouts)
  → GarminMD reads plan, pushes to Garmin Connect
  → Garmin watch guides user through workout
  → Watch records actual performance
  → GarminMD pulls activity data from Garmin
  → LLM compares plan vs actual
  → Dashboard shows coaching insights
```

The app creates **workout plans** (not activity records). The watch handles recording. Re-syncing is idempotent — matches by workout name and updates.

## Key Design Decisions (Locked In)

1. **No CLI** — web app only. Next.js 16 + ShadCN + Tailwind.
2. **Notion is primary** — users auth via Notion OAuth, select their training page. No file uploads.
3. **Garmin upload stays** — app pushes workout plans from Notion → Garmin Connect, triggered from UI.
4. **Garmin pull is new** — after training, app pulls completed activity data (actual sets, reps, weight, duration).
5. **LLM analyzes both sources** — compares plan (Notion) vs result (Garmin activity) for coaching insights.
6. **LLM triggers** — auto-notify after each Garmin activity sync + deeper analysis on demand via UI.
7. **Dashboard is main UI** — upcoming workouts, recent performance, LLM insights.
8. **Self-hostable** — open-source, users deploy themselves (Docker, Vercel, Railway).
9. **Weekly progression** → upload current week's weights only.
10. **Rest periods** → detect-then-fallback: Rest column → header → config → 90s default.
11. **Sport types** → Strength MVP. SportAdapter pattern for future running/cycling.
12. **Re-upload** → idempotent. Match by workout name → update, don't duplicate.

## Tech Stack

| Component          | Package                                                           | Why                                                                                              |
| ------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Framework          | Next.js 16 (App Router)                                           | SSR, API routes, Turbopack default, React Compiler stable                                        |
| UI                 | ShadCN + Tailwind CSS                                             | Consistent, accessible, fast                                                                     |
| Auth               | Notion OAuth2 (primary), Garmin SSO via @flow-js/garmin-connect   | Notion has clean OAuth. Garmin uses SSO (username/password).                                     |
| Garmin Client      | `@flow-js/garmin-connect`                                         | TS: WorkoutBuilder, createWorkout(), getActivities(), getActivityDetails()                       |
| Notion Client      | `@notionhq/client`                                                | Official Notion SDK                                                                              |
| LLM                | `@anthropic-ai/sdk` (Claude Sonnet)                               | Exercise resolution + coaching insights                                                          |
| Markdown Parsing   | `unified` + `remark-parse` + `remark-gfm`                         | AST-level table parsing from Notion page content                                                 |
| Validation         | `zod`                                                             | Runtime validation across the pipeline                                                           |
| Database           | SQLite via Drizzle ORM                                            | Self-hostable, no external DB required                                                           |
| Activity Detection | Manual sync button (primary) + light poll every 2–4hrs (fallback) | No Garmin webhooks without enterprise approval. Manual sync gives instant post-workout feedback. |

## Project Structure

```
app/
├── (auth)/
│   ├── login/              # Notion OAuth flow
│   └── garmin/             # Garmin credential entry
├── (dashboard)/
│   ├── page.tsx            # Main dashboard
│   ├── workouts/           # Upcoming + past workouts
│   ├── insights/           # LLM coaching feed
│   └── settings/           # Manage connections
├── api/
│   ├── notion/
│   │   ├── callback/       # OAuth callback
│   │   └── sync/           # Fetch + parse Notion page
│   ├── garmin/
│   │   ├── auth/           # Store Garmin credentials
│   │   ├── push/           # Push workout plans
│   │   └── pull/           # Pull completed activities
│   ├── analyze/            # LLM analysis endpoint
│   └── cron/               # Periodic Garmin poll
└── components/
    ├── dashboard/          # Dashboard widgets
    ├── workout-card/       # Workout display
    ├── insight-card/       # LLM insight display
    └── onboarding/         # Connection setup flow

lib/
├── core/types.ts           # Pipeline data model (DONE)
├── parser/
│   ├── markdown.ts         # Markdown → ParsedWorkout[] (DONE)
│   ├── rest-detector.ts    # 4-tier rest detection (DONE)
│   └── week-selector.ts    # Weekly progression logic (DONE)
├── resolver/
│   ├── index.ts            # 3-tier orchestrator
│   ├── dictionary.ts       # Load + normalize exercises.json
│   ├── exact-match.ts      # Tier 1: normalized string matching
│   ├── llm-match.ts        # Tier 2: Anthropic API
│   └── cache.ts            # DB-backed exercise cache
├── adapters/
│   ├── base.ts             # SportAdapter interface
│   ├── strength.ts         # Builds strength workout JSON (DONE)
│   └── running.ts          # Phase 3 placeholder
├── garmin/
│   ├── client.ts           # Wrapper around @flow-js/garmin-connect
│   ├── workout-builder.ts  # Builds IWorkoutDetail from adapter output
│   ├── sync.ts             # Push: upload, schedule, dedup by name
│   └── activities.ts       # Pull: getActivities, getActivityDetails
├── notion/
│   ├── oauth.ts            # Notion OAuth helpers
│   └── reader.ts           # Read + parse Notion pages via API
├── analysis/
│   ├── engine.ts           # LLM coaching: plan vs actual comparison
│   ├── prompts.ts          # System prompts for auto + deep analysis
│   └── matcher.ts          # Match Garmin activity to Notion plan
├── db/
│   ├── schema.ts           # Drizzle schema definition
│   ├── migrations/         # SQLite migrations
│   └── queries.ts          # Data access layer
└── utils/
    └── units.ts            # lbs ↔ kg conversion

data/
└── exercises.json          # Garmin exercise dictionary (from mrnabilnoh)

test/
├── fixtures/               # Real Notion workout markdown
├── parser.test.ts
├── resolver.test.ts
├── strength-adapter.test.ts
└── analysis.test.ts
```

## Auth Flows

### Notion OAuth (Primary Login)

User clicks "Connect Notion" → Notion consent screen → user selects pages to share (e.g. "Health is Wealth") → redirect back with auth code → app exchanges for access token → reads pages → stores token encrypted in DB.

Notion OAuth is the primary identity. The user "logs in" by connecting Notion.

### Garmin Connection (Secondary)

User enters Garmin email + password in settings → app authenticates via @flow-js/garmin-connect (Garmin SSO) → session tokens stored encrypted in DB → app can push workouts + pull activities.

No public OAuth2 for Garmin consumer accounts. Community standard is SSO (same as mobile app). App must be transparent about this in UI.

## Data Flow: Plan → Train → Review

### 1. Plan (Notion → Garmin)

User updates Notion → clicks "Sync to Garmin" in UI → app fetches page → parses markdown tables → resolves exercise names (3-tier: exact → LLM → cache) → builds Garmin workout JSON → pushes to Garmin Connect (idempotent) → user syncs watch.

### 2. Train (Garmin Watch)

GarminMD not involved. User follows workout on watch. Watch records actual sets, reps, weight, duration, heart rate.

### 3. Review (Garmin → LLM → Dashboard)

Watch syncs to Garmin Connect → user opens GarminMD → taps "Sync from Garmin" button → app calls getActivities() → pulls activity details → matches to Notion plan (by name + date) → LLM compares plan vs actual → insight saved to DB → displayed on dashboard.

A light background poll (every 2–4 hours) catches activities the user forgot to manually sync, powering missed session detection and streak tracking.

Example:

- Plan: "3×12 DB Bench Press @ 35 lbs"
- Actual: "Sets of 10, 12, 12 @ 35 lbs"
- Insight: "34 of 36 target reps — stay at 35 lbs next week, you're almost there."

## Pipeline Data Model (lib/core/types.ts — DONE)

Data flows as: `ParsedWorkout[]` → `ResolvedWorkout[]` → `GarminWorkoutPayload[]`

**ParsedExercise**: raw from markdown — `rawName`, `sets`, `reps`, `weight`, `weightUnit`, `isWarmup`, `restSeconds`, `notes`, `weeklyData`

**ResolvedExercise**: extends ParsedExercise with — `garminType` (category + exerciseName + IDs), `resolutionMethod` (exact|llm|user|cached), `confidence`, `weightKg`, `effectiveRestSeconds`, `effectiveReps`

**GarminWorkoutPayload**: matches Garmin's JSON format — `workoutName`, `sportType` (id: 4, key: "strength_training"), `workoutSegments[].workoutSteps[]` with stepType (warmup|interval|rest), exerciseCategory, weightValue (kg), endCondition (repetitions|time)

## Exercise Resolution Strategy

```
Tier 1: Exact/normalized match against data/exercises.json (400+ exercises)
        "DB Bench Press" → normalize → "dumbbell bench press" → match
        Cost: $0

Tier 2: LLM call with exercise dictionary as context
        "Cable Overhead Tricep Pull" → Claude picks best match
        Cost: ~$0.001 per exercise
        Cache result to exercise_cache table in SQLite

Tier 3: UI confirmation if LLM confidence < threshold
        Shows user the best match with accept/reject/search options
```

## LLM Coaching Engine

### Auto-Insights (After Each Activity)

Triggered when a new Garmin activity is detected — either via the manual "Sync from Garmin" button (primary) or the light background poll (fallback). Quick, focused:

- **Rep completion**: "94% of target reps — strongest Push session yet."
- **Weight progression**: "12 clean reps on Cable Pressdown for 2 weeks. Time to move to 75 lbs."
- **Fatigue detection**: "Sat Legs → Sun Long Run showed 15% pace drop. Consider less leg volume."
- **Streak tracking**: "4 consecutive Pull days. Longest streak this phase."
- **Missed sessions**: "No Shoulders this week. Want to reschedule?"

### Deep Analysis (On Demand)

User clicks "Analyze" for richer review:

- **Phase progression**: "Across Phase 1, bench moved 35→40 lbs. On track for 50 by Phase 3."
- **Muscle balance**: "Push is 21 sets/week, pull only 16. Add rows."
- **Recovery patterns**: "Best sessions follow rest days. Worst follow back-to-back gym days."
- **Program suggestions**: "Based on progression rate, start Phase 2 rep targets a week early."

### LLM Context Per Call

```
System: You are a strength training coach analyzing workout data.

Context:
- Notion training plan (exercises, targets, progression rules)
- Garmin activity data (actual reps, weights, duration, HR)
- Last 4 weeks of plan vs actual comparisons
- Phase info (current phase, rep targets, goals)

Task: Compare plan vs actual. Identify patterns. Give specific,
      encouraging, actionable feedback.
```

## Garmin Workout JSON Structure

sportTypeId 4 for strength training. Steps have:

- stepType: warmup (3), interval (1), rest (4), cooldown (2)
- exerciseCategory: { category: "BENCH_PRESS", exerciseName: "DUMBBELL_BENCH_PRESS" }
- weightValue: { value: 15.88 } (always kg)
- endCondition: { conditionTypeKey: "repetitions" }, endConditionValue: 12
- Max 50 steps per workout

Rest steps inserted between exercises (not between sets of the same exercise).

## Markdown Input Format

Parser handles flexible table shapes. Minimum: Exercise + Sets columns. Full:

```markdown
## Push — Chest + Triceps

**Target:** 10–12 reps · Rest 60–90s

| #   | Exercise                 | Sets | Start Weight | Wk 1         | Wk 2 |
| --- | ------------------------ | ---- | ------------ | ------------ | ---- |
| WU  | DB Bench Press (warm-up) | 2    | 25 lbs       | 20-12, 25-10 |      |
| 1   | DB Bench Press           | 3    | 35 lbs       | 10 x 12 x 12 |      |
```

Column detection: "Exercise"/"Movement"/"Lift", "Sets", "Weight"/"Start Weight", "Reps", "Rest", "Wk N". Warm-up from "WU" or "(warm-up)". Sport type from heading keywords.

## Database Schema (SQLite via Drizzle)

```sql
users (id, notion_user_id UNIQUE, notion_access_token [encrypted], created_at)
garmin_connections (id, user_id FK, garmin_email [encrypted], garmin_session [encrypted], last_sync_at)
notion_pages (id, user_id FK, notion_page_id, page_title, last_parsed_at, content_hash)
garmin_workouts (id, user_id FK, notion_page_id FK, workout_name, garmin_workout_id, payload_hash, last_pushed_at)
garmin_activities (id, user_id FK, garmin_activity_id UNIQUE, activity_type, activity_name, start_time, duration_seconds, raw_data JSON, matched_workout_id FK, pulled_at)
insights (id, user_id FK, activity_id FK, insight_type [auto|deep], content, plan_context JSON, actual_context JSON, created_at)
exercise_cache (id, raw_name, normalized_name, garmin_category, garmin_exercise_name, garmin_category_id, garmin_exercise_name_id, resolution_method, created_at, UNIQUE(normalized_name))
```

## Dashboard UI Concept

Main view:

- **This Week**: day-by-day cards (Mon Push ✅, Tue Pull ✅, Thu Shoulders ⏳, Sat Legs ⏳) with completion counts
- **Latest Insight**: most recent LLM coaching feedback with "Full Analysis" link
- **Recent Performance**: per-exercise weight progression with trend arrows (DB Bench 35→40 lbs ↑ 14%)
- **Streaks**: consecutive sessions, plan completion percentage

### Onboarding Flow

1. Connect Notion → OAuth → select training page(s) → "Found 4 sessions in 'Health is Wealth'"
2. Connect Garmin → enter credentials → verify connection
3. Push to Garmin → preview workouts → one-click push → "4 workouts uploaded"
4. Dashboard loads → "We'll notify you with insights after each workout."

## Environment Variables

```bash
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=
NOTION_REDIRECT_URI=http://localhost:3000/api/notion/callback
ANTHROPIC_API_KEY=
ENCRYPTION_KEY=        # for stored credentials
DATABASE_URL=file:./garminmd.db
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
```

Garmin credentials entered per-user in UI, stored encrypted in SQLite. Not in env vars.

## Current Build Status

**Done (from planning session):**

- `lib/core/types.ts` — full pipeline data model (ParsedExercise → ResolvedExercise → GarminWorkoutPayload)
- `lib/parser/markdown.ts` — Markdown → ParsedWorkout[] with flexible column detection
- `lib/parser/rest-detector.ts` — 4-tier rest detection chain
- `lib/parser/week-selector.ts` — weekly progression column logic
- `lib/adapters/strength.ts` — builds Garmin workout JSON from resolved exercises
- Parser tests against real Notion "Health is Wealth" data
- `data/exercises.json` source identified (mrnabilnoh/workout-plan-garmin-connect)

**Next to build:**

1. Next.js 16 project scaffold (App Router, ShadCN, Tailwind, Turbopack)
2. SQLite schema + Drizzle ORM setup
3. Notion OAuth flow (login, token storage, page selection)
4. Notion page reader (fetch → parse markdown tables using existing parser)
5. Exercise resolver (exact-match + LLM + DB cache)
6. Garmin auth + workout push (using @flow-js/garmin-connect)
7. Onboarding flow UI
8. Basic dashboard shell
9. Garmin activity pull (getActivities, getActivityDetails)
10. Activity ↔ workout matching (by name + date proximity)
11. LLM auto-insight engine
12. LLM deep analysis on demand
13. Dashboard widgets (insights, performance, streaks)

## Phased Roadmap

### Phase 1 — Core Pipeline (Weeks 1–3)

- Next.js 16 scaffold (App Router, ShadCN, Tailwind, Turbopack)
- Notion OAuth flow
- Notion page reader (fetch + parse markdown tables)
- Exercise resolver (exact + LLM + cache, in SQLite)
- Garmin credential entry + auth
- Garmin workout push (Notion → Garmin Connect)
- Onboarding flow UI
- SQLite schema + Drizzle ORM
- Basic dashboard shell

### Phase 2 — Garmin Pull + LLM Insights (Weeks 4–6)

- Garmin activity pull (getActivities, getActivityDetails)
- Activity ↔ workout matching (by name + date)
- LLM auto-insight after new activity
- LLM deep analysis on demand
- Insight cards on dashboard
- Recent performance widget (weight progression per exercise)
- Streak tracking
- Weekly plan completion view

### Phase 3 — Polish + Running (Weeks 7–9)

- Running adapter
- Periodic Garmin polling (cron)
- Multi-page support
- Settings page
- Export insights to Notion or file

### Phase 4 — Deployment + Community (Weeks 10+)

- Docker compose for self-hosting
- Deploy guide (Vercel, Railway, self-hosted)
- Notion webhook auto-sync (replace polling)
- Mobile-responsive dashboard
- Community exercise cache
- Cycling / swimming adapters

## Key Prior Art

- `@flow-js/garmin-connect` — our Garmin client, has WorkoutBuilder + getActivities
- `github.com/mrnabilnoh/workout-plan-garmin-connect` — exercises.json source (all Garmin exercise names + IDs)
- `github.com/pranciskus/garmin-workouts-mcp` — exercise alias → Garmin enum resolution
- `github.com/wklm/garmin-workouts-mcp` — proved markdown → Garmin pipeline works (running)
- `github.com/mkuthan/garmin-workouts` — YAML → Garmin import, idempotent update pattern

## Test Fixtures

Test against real "Health is Wealth" Notion page data. Fixtures include:

- push-day.md (Monday: DB Bench, Incline, Flies, Tricep work — 8 exercises)
- pull-day.md (Tuesday: Cable Rows, Lat Pulldown, Bicep Curls — 7 exercises)
- full-week.md (entire page with non-exercise tables that should be skipped)
- minimal.md (just Exercise + Sets columns, no weights)
