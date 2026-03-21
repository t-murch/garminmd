# GarminMD — Product Spec v2

**Tagline:** Plan in Notion. Train with Garmin. Get coached by AI.
**Type:** Self-hostable open-source web app
**License:** MIT

---

## Product

A web app where users connect their Notion training log and their Garmin Connect account. They plan workouts in Notion (where they already live), the app pushes those plans to Garmin Connect, and after they train, the app pulls actual Garmin activity data and uses an LLM to deliver coaching feedback — patterns, streaks, progression analysis, and encouragement.

### The Loop

```
  ┌─────────────┐     push plan      ┌──────────────────┐
  │   Notion     │ ──────────────────→│  Garmin Connect   │
  │  (user plans │                    │  (syncs to watch) │
  │   workouts)  │                    └────────┬─────────┘
  └──────┬───────┘                             │
         │                                     │ user trains
         │  reads plan                         │ watch records
         │                                     ▼
  ┌──────▼────────────────────────────────────────────────┐
  │                    GarminMD Web App                    │
  │                                                        │
  │  Dashboard:                                            │
  │  • Upcoming workouts (from Notion)                     │
  │  • Recent performance (from Garmin activities)         │
  │  • LLM coaching insights (plan vs actual)              │
  │                                                        │
  │  Auto-notify after each Garmin activity sync           │
  │  Deeper analysis on demand                             │
  └────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions (Locked In)

1. **No CLI** — web app only (Next.js 16 + ShadCN + Tailwind)
2. **Notion is primary** — users authenticate via Notion OAuth, select their training page, and the app reads it. No file uploads.
3. **Garmin upload stays** — the app pushes workout plans from Notion → Garmin Connect, triggered from the UI
4. **Garmin pull is new** — after training, the app pulls completed activity data (actual sets, reps, weight, duration) from Garmin
5. **LLM analyzes both sources** — compares the plan (Notion) against the result (Garmin activity) to generate coaching insights
6. **LLM triggers** — auto-notify after each Garmin activity sync + deeper analysis on demand via UI
7. **Dashboard is the main UI** — upcoming workouts, recent performance, LLM insights
8. **Self-hostable** — open-source, users deploy themselves
9. **Weekly progression** → upload current week's weights only
10. **Rest periods** → detect-then-fallback chain: Rest column → header → config → 90s default
11. **Sport types** → Strength MVP. SportAdapter pattern for future running/cycling.
12. **Re-upload** → idempotent. Match by workout name → update, don't duplicate.

---

## Tech Stack

| Component | Choice | Rationale |
|---|---|---|
| **Framework** | Next.js 15 (App Router) | SSR, API routes, matches user's existing stack |
| **UI** | ShadCN + Tailwind CSS | Consistent, accessible, fast to build |
| **Auth** | Notion OAuth2 (primary), Garmin SSO via @flow-js/garmin-connect | Notion has clean public OAuth. Garmin uses SSO (username/password) — no public OAuth2 for consumer apps. |
| **Garmin Client** | `@flow-js/garmin-connect` | TS library with WorkoutBuilder, createWorkout(), getActivities(), getActivityDetails() |
| **Notion Client** | `@notionhq/client` | Official Notion SDK |
| **LLM** | `@anthropic-ai/sdk` (Claude Sonnet) | Structured extraction for exercise resolution + coaching insights |
| **Markdown Parsing** | `unified` + `remark-parse` + `remark-gfm` | AST-level table parsing from Notion page content |
| **Validation** | `zod` | Runtime validation across the pipeline |
| **Database** | SQLite (via better-sqlite3 or Drizzle) | Self-hostable, no external DB required. Stores user connections, sync state, cached analysis. |
| **Background Jobs** | Cron or polling (Next.js API route) | Checks for new Garmin activities, triggers LLM analysis |
| **Build/Test** | `vitest`, TypeScript 5.x | Same as before |

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Next.js 16 App                                             │
│                                                          │
│  /app                                                    │
│  ├── (auth)/                                             │
│  │   ├── login/           # Notion OAuth flow            │
│  │   └── garmin/          # Garmin credential entry      │
│  │                                                       │
│  ├── (dashboard)/                                        │
│  │   ├── page.tsx         # Main dashboard               │
│  │   ├── workouts/        # Upcoming + past workouts     │
│  │   ├── insights/        # LLM coaching feed            │
│  │   └── settings/        # Manage connections           │
│  │                                                       │
│  ├── api/                                                │
│  │   ├── notion/                                         │
│  │   │   ├── callback/    # OAuth callback               │
│  │   │   └── sync/        # Fetch + parse Notion page    │
│  │   ├── garmin/                                         │
│  │   │   ├── auth/        # Store Garmin credentials     │
│  │   │   ├── push/        # Push workout plans           │
│  │   │   └── pull/        # Pull completed activities    │
│  │   ├── analyze/         # LLM analysis endpoint        │
│  │   └── cron/            # Periodic Garmin poll         │
│  │                                                       │
│  └── components/                                         │
│      ├── dashboard/       # Dashboard widgets            │
│      ├── workout-card/    # Workout display component    │
│      ├── insight-card/    # LLM insight display          │
│      └── onboarding/      # Connection setup flow        │
│                                                          │
├── lib/                    # Shared logic (from CLI era)  │
│   ├── core/types.ts       # Pipeline data model          │
│   ├── parser/             # Markdown → ParsedWorkout[]   │
│   ├── resolver/           # Exercise name → Garmin type  │
│   ├── adapters/           # SportAdapter (strength.ts)   │
│   ├── garmin/             # Garmin client wrapper        │
│   ├── notion/             # Notion page reader           │
│   ├── analysis/           # LLM coaching engine          │
│   └── db/                 # SQLite schema + queries      │
│                                                          │
├── data/                                                  │
│   └── exercises.json      # Garmin exercise dictionary   │
│                                                          │
└── test/                                                  │
    ├── fixtures/           # Real Notion workout data     │
    ├── parser.test.ts                                     │
    ├── resolver.test.ts                                   │
    └── analysis.test.ts                                   │
```

---

## Auth Flows

### Notion OAuth (Primary Login)

```
User clicks "Connect Notion"
  → Redirects to Notion OAuth consent screen
  → User selects which pages to share (e.g. "Health is Wealth")
  → Notion redirects back with auth code
  → App exchanges code for access token
  → App reads selected pages via Notion API
  → Stores token in DB (encrypted)
```

Notion OAuth is the primary identity. The user "logs in" by connecting Notion.

### Garmin Connection (Secondary)

```
User enters Garmin email + password in settings
  → App authenticates via @flow-js/garmin-connect (Garmin SSO)
  → Session tokens stored in DB (encrypted)
  → App can now push workouts + pull activities
  → Tokens refresh automatically via library
```

No public OAuth2 for Garmin consumer accounts. The community standard is SSO via username/password (same auth as the mobile app). The app must be transparent about this in the UI.

---

## Data Flow: Plan → Train → Review

### 1. Plan (Notion → Garmin)

```
User updates their Notion training page
  → App detects changes (manual sync button or periodic poll)
  → Parses markdown tables from Notion page content
  → Resolves exercise names → Garmin types (3-tier: exact → LLM → cache)
  → Builds Garmin workout JSON via StrengthAdapter
  → Pushes to Garmin Connect (idempotent — updates existing by name)
  → User syncs Garmin watch → workouts available on wrist
```

Triggered by: user clicks "Sync to Garmin" button in UI.

### 2. Train (Garmin Watch)

GarminMD is not involved. User follows the workout on their Garmin watch. Watch records actual sets, reps, weight, duration, heart rate.

### 3. Review (Garmin → LLM → Dashboard)

```
After workout, watch syncs to Garmin Connect
  → App polls for new activities (cron or manual refresh)
  → Pulls activity details: actual reps, weight, sets, duration
  → Matches activity to the original Notion plan (by name + date)
  → LLM compares plan vs actual:
      Plan:   "3×12 DB Bench Press @ 35 lbs"
      Actual: "Sets of 10, 12, 12 @ 35 lbs"
      Insight: "You hit 34 of 36 target reps on DB Bench — stay
                at 35 lbs next week, you're almost there."
  → Insight saved to DB + displayed on dashboard
  → Auto-notification in UI (or future: push notification)
```

---

## LLM Coaching Engine

### Auto-Insights (After Each Activity)

Triggered automatically when a new Garmin activity is detected. Quick, focused analysis:

- **Rep completion rate**: "You hit 94% of target reps today — strongest Push session yet."
- **Weight progression signals**: "You've hit 12 clean reps on Cable Pressdown for 2 weeks straight. Time to move up to 75 lbs."
- **Fatigue detection**: "Your Saturday Legs → Sunday Long Run showed a 15% pace drop from last week. Consider dialing back leg volume."
- **Streak tracking**: "4 consecutive Pull days completed. Longest streak this phase."
- **Missed session awareness**: "No Shoulders session detected this week. Want to reschedule?"

### Deep Analysis (On Demand)

User clicks "Analyze" for a richer review. More tokens, more context:

- **Phase-level progression**: "Across Phase 1 (4 weeks), your bench press moved from 35→40 lbs. That's on track for the 50 lb target by Phase 3."
- **Muscle group balance**: "Your push volume is 21 sets/week but pull is only 16. Consider adding a set of rows."
- **Recovery patterns**: "Your best sessions follow rest days. Your worst follow back-to-back gym days."
- **Program suggestions**: "Based on your progression rate, you could move to Phase 2 rep targets (8–10) a week early."

### LLM Context Window (Per Analysis Call)

```
System: You are a strength training coach analyzing workout data.

Context provided:
- The user's Notion training plan (parsed exercises, targets, progression rules)
- The Garmin activity data (actual reps, weights, duration, heart rate)
- Historical data: last 4 weeks of plan vs actual comparisons
- Phase information (current phase, rep targets, goals)

Task: Compare plan vs actual. Identify patterns. Give specific,
      encouraging, actionable coaching feedback.
```

---

## Dashboard UI

### Main View

```
┌─────────────────────────────────────────────────────────┐
│  GarminMD                          [Sync] [Settings] ⚙  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  📊 THIS WEEK                          Phase 1 · Week 3  │
│  ┌──────────┬──────────┬──────────┬──────────┐          │
│  │ Mon ✅   │ Tue ✅   │ Thu ⏳   │ Sat ⏳   │          │
│  │ Push     │ Pull     │Shoulders │ Legs     │          │
│  │ 7/7 ex   │ 6/7 ex   │ today   │          │          │
│  └──────────┴──────────┴──────────┴──────────┘          │
│                                                          │
│  💡 LATEST INSIGHT                           2 hours ago │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Strong Pull session. You hit 12 clean reps on    │   │
│  │ Lat Pulldown at 90 lbs for the first time —      │   │
│  │ bump to 95 lbs next week. Bicep curls are        │   │
│  │ lagging (8 reps on set 3). Stay at 15 lbs.      │   │
│  │                                    [Full Analysis]│   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  📈 RECENT PERFORMANCE                                   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ DB Bench Press     35 lbs → 40 lbs    ↑ 14%     │   │
│  │ Lat Pulldown       85 lbs → 90 lbs    ↑ 6%      │   │
│  │ Cable Pressdown    70 lbs → 70 lbs    → stalled  │   │
│  │ Squat              135 lbs → 145 lbs  ↑ 7%      │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  🔥 STREAKS                                              │
│  Pull days: 4 consecutive ·  Runs: 3 of 4 this week    │
│  Total sessions this phase: 11 of 12 planned            │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Onboarding Flow

```
Step 1: "Connect Notion"
  → Notion OAuth → select training page(s)
  → App previews detected workouts: "Found 4 sessions in 'Health is Wealth'"

Step 2: "Connect Garmin"
  → Enter Garmin email + password
  → App verifies connection: "Connected as yourname@email.com"
  → App lists compatible devices

Step 3: "Push to Garmin"
  → Preview workouts that will be synced
  → One-click push all → "4 workouts uploaded to Garmin Connect"
  → "Sync your watch to see them."

Step 4: "You're set."
  → Dashboard loads with upcoming workouts
  → "We'll notify you with insights after each workout."
```

---

## Database Schema (SQLite)

```sql
-- User identity (from Notion OAuth)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  notion_user_id TEXT UNIQUE NOT NULL,
  notion_access_token TEXT NOT NULL, -- encrypted
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Garmin connection (per user)
CREATE TABLE garmin_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  garmin_email TEXT NOT NULL, -- encrypted
  garmin_session TEXT, -- encrypted session tokens from @flow-js/garmin-connect
  last_sync_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Connected Notion pages
CREATE TABLE notion_pages (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  notion_page_id TEXT NOT NULL,
  page_title TEXT,
  last_parsed_at TEXT,
  content_hash TEXT -- for change detection
);

-- Uploaded Garmin workouts (for idempotent re-upload)
CREATE TABLE garmin_workouts (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  notion_page_id TEXT REFERENCES notion_pages(id),
  workout_name TEXT NOT NULL,
  garmin_workout_id TEXT, -- from Garmin Connect
  payload_hash TEXT, -- for change detection
  last_pushed_at TEXT
);

-- Garmin activities pulled after training
CREATE TABLE garmin_activities (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  garmin_activity_id TEXT UNIQUE NOT NULL,
  activity_type TEXT,
  activity_name TEXT,
  start_time TEXT,
  duration_seconds INTEGER,
  raw_data TEXT, -- full JSON from Garmin
  matched_workout_id TEXT REFERENCES garmin_workouts(id),
  pulled_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- LLM coaching insights
CREATE TABLE insights (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  activity_id TEXT REFERENCES garmin_activities(id),
  insight_type TEXT NOT NULL, -- 'auto' | 'deep'
  content TEXT NOT NULL, -- the LLM-generated coaching text
  plan_context TEXT, -- JSON: what the plan said
  actual_context TEXT, -- JSON: what Garmin recorded
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Exercise resolution cache (shared across users)
CREATE TABLE exercise_cache (
  id TEXT PRIMARY KEY,
  raw_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  garmin_category TEXT NOT NULL,
  garmin_exercise_name TEXT NOT NULL,
  garmin_category_id INTEGER,
  garmin_exercise_name_id INTEGER,
  resolution_method TEXT, -- 'exact' | 'llm' | 'user'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(normalized_name)
);
```

---

## Preserved From v1 (lib/ directory)

All core logic carries over from the CLI version:

| Module | Status | Notes |
|---|---|---|
| `lib/core/types.ts` | ✅ Done | Pipeline data model — ParsedExercise → ResolvedExercise → GarminWorkoutPayload |
| `lib/parser/markdown.ts` | ✅ Done | Markdown → ParsedWorkout[]. Works on Notion page content. |
| `lib/parser/rest-detector.ts` | ✅ Done | 4-tier rest detection chain |
| `lib/parser/week-selector.ts` | ✅ Done | Weekly progression column logic |
| `lib/adapters/strength.ts` | ✅ Done | Builds Garmin workout JSON |
| `lib/resolver/` | 🔨 Next | Exercise name → Garmin type (exact, LLM, cache) |
| `lib/garmin/client.ts` | 🔨 Next | Push workouts + NEW: pull activities |
| `lib/garmin/sync.ts` | 🔨 Next | Idempotent upload + dedup |
| `lib/notion/reader.ts` | 🆕 New | Read + parse Notion pages via API |
| `lib/analysis/engine.ts` | 🆕 New | LLM coaching: plan vs actual comparison |
| `lib/analysis/prompts.ts` | 🆕 New | System prompts for auto-insight + deep analysis |
| `lib/db/` | 🆕 New | SQLite schema, queries, migrations |

---

## Phased Roadmap (Revised)

### Phase 1 — Core Pipeline (Weeks 1–3)
- [ ] Next.js 16 project scaffold (App Router, ShadCN, Tailwind, Turbopack)
- [ ] Notion OAuth flow (login, token storage, page selection)
- [ ] Notion page reader (fetch page → parse markdown tables)
- [ ] Exercise resolver (exact match + LLM + cache, now in SQLite)
- [ ] Garmin credential entry + auth via @flow-js/garmin-connect
- [ ] Garmin workout push (Notion plan → Garmin Connect)
- [ ] Onboarding flow UI (connect Notion → connect Garmin → push)
- [ ] SQLite schema + Drizzle ORM setup
- [ ] Basic dashboard shell

### Phase 2 — Garmin Pull + LLM Insights (Weeks 4–6)
- [ ] Garmin activity pull (getActivities, getActivityDetails)
- [ ] Activity ↔ workout matching (by name + date proximity)
- [ ] LLM auto-insight after new activity detected
- [ ] LLM deep analysis on demand
- [ ] Insight cards on dashboard
- [ ] Recent performance widget (weight progression per exercise)
- [ ] Streak tracking
- [ ] Weekly view (plan completion status)

### Phase 3 — Polish + Running (Weeks 7–9)
- [ ] Running adapter (distance, pace, intervals)
- [ ] Periodic Garmin polling (cron job or background API route)
- [ ] Multi-page support (connect multiple Notion training pages)
- [ ] Settings page (manage connections, preferences)
- [ ] Export insights as markdown (back to Notion or file)

### Phase 4 — Deployment + Community (Weeks 10+)
- [ ] Docker compose for self-hosting
- [ ] Deploy guide (Vercel, Railway, self-hosted)
- [ ] Notion webhook auto-sync (replace polling)
- [ ] Mobile-responsive dashboard
- [ ] Community exercise cache (shared DB or GitHub PR workflow)
- [ ] Cycling / swimming adapters

---

## Environment Variables

```bash
# Notion OAuth
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=
NOTION_REDIRECT_URI=http://localhost:3000/api/notion/callback

# Anthropic
ANTHROPIC_API_KEY=

# Encryption (for stored credentials)
ENCRYPTION_KEY=

# App
DATABASE_URL=file:./garminmd.db
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
```

Garmin credentials are entered per-user in the UI and stored encrypted in SQLite. Not in env vars.
