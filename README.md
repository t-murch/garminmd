# GarminMD

Plan workouts in Notion. Push them to your Garmin watch. After training, pull actual performance data back and get AI coaching feedback.

GarminMD connects your Notion training log to Garmin Connect. You write workout plans as markdown tables in Notion, the app converts them into Garmin-native workouts your watch understands, and after you train, it pulls what you actually did and compares plan vs. actual using an LLM.

## How It Works

```
Notion (you plan workouts as markdown tables)
  -> GarminMD parses tables, resolves exercise names to Garmin's format
  -> Pushes workout plans to Garmin Connect
  -> You train with the workout on your watch
  -> GarminMD pulls completed activity data from Garmin
  -> LLM compares plan vs actual
  -> Dashboard shows coaching insights
```

**Example insight:** You planned 3x12 DB Bench Press at 35 lbs. You actually did 10, 12, 12. GarminMD tells you: "34 of 36 target reps. Stay at 35 lbs next week, you're almost there."

## Features

- **Notion as the source of truth.** Write workout plans in Notion using markdown tables. GarminMD parses them automatically.
- **Smart exercise resolution.** Matches your exercise names (like "DB Bench Press") to Garmin's internal exercise dictionary. Falls back to LLM matching for unusual names.
- **Idempotent sync.** Re-syncing doesn't duplicate workouts. Changed plans get updated in place.
- **Activity pull.** After training, pull what actually happened from Garmin Connect (sets, reps, weight, duration).
- **AI coaching.** Auto-insights after each workout. On-demand deep analysis across weeks of training data.
- **Self-hostable.** SQLite database, no external services beyond Notion and Garmin. Deploy with Docker or any Node.js host.

## Tech Stack

| Component | Choice | Why |
|-----------|--------|-----|
| Framework | Next.js 16 (App Router) | SSR, API routes, standalone Docker builds |
| UI | ShadCN + Tailwind | Accessible, fast |
| Database | SQLite via Drizzle ORM | No external DB needed for self-hosting |
| Garmin | @flow-js/garmin-connect | Workout push, activity pull, SSO auth |
| Notion | @notionhq/client | Official SDK, OAuth2 |
| LLM | @anthropic-ai/sdk (Claude) | Exercise resolution + coaching insights |
| Auth | Notion OAuth2 (login) + Garmin SSO (credentials) | |

### Prerequisites

- Node.js 20+
- pnpm
- A Notion **public** integration (see below)
- A Garmin Connect account
- An [Anthropic API key](https://console.anthropic.com/) (for exercise resolution and coaching)

### Create the Notion Integration

GarminMD uses Notion's OAuth2 flow so users can pick which pages to share. This requires a **public** integration (Notion's term for any integration that uses OAuth, as opposed to internal integrations which get a single static token).

"Public" is misleading. It doesn't mean published or listed in a marketplace. It just means OAuth-based. You won't need a Notion security review unless you want to distribute the integration publicly.

1. Go to [notion.so/profile/integrations](https://www.notion.so/profile/integrations)
2. Click **New integration** and select **Public** (not Internal)
3. Fill in the required fields. For personal/self-hosted use, placeholder values are fine for Company, Website, Tagline, Privacy Policy, and Terms of Use
4. Under **OAuth domains & URIs**, add a redirect URI: `http://localhost:3000/api/notion/callback`
5. Under **Capabilities**, enable **Read content** (the others are optional)
6. Submit the integration
7. The settings page will show your **OAuth client ID** and **OAuth client secret**

Those two values go into your `.env` as `NOTION_CLIENT_ID` and `NOTION_CLIENT_SECRET`.

### Setup

```bash
git clone https://github.com/your-username/garminmd.git
cd garminmd
pnpm install
```

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

You need:
- `NOTION_CLIENT_ID` and `NOTION_CLIENT_SECRET` from the Notion integration you created above
- `ANTHROPIC_API_KEY` from Anthropic
- `ENCRYPTION_KEY` (generate one: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- `NEXTAUTH_SECRET` (generate one the same way)

Run database migrations and start the dev server:

```bash
pnpm db:migrate
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The onboarding flow will walk you through connecting Notion and Garmin.

### Running Tests

```bash
pnpm test
```

### Type Checking

```bash
npx tsc --noEmit
```

## Self-Hosting with Docker

The quickest way to run GarminMD in production:

```bash
cp .env.example .env
# Fill in your env vars, then:
docker compose up --build
```

This builds a standalone Next.js image (~150MB), runs database migrations on startup, and serves the app on port 3000. SQLite data persists in a Docker volume.

For the `DATABASE_URL` in Docker, use `file:/app/data/db/garminmd.db` (this is set automatically by `docker-compose.yml`).

## Notion Workout Format

GarminMD parses markdown tables from your Notion pages. The parser is flexible with column names and layout. Minimum requirement: an Exercise column and a Sets column.

```markdown
## Monday Push - Chest + Triceps

**Target:** 10-12 reps, Rest 60-90s

| #   | Exercise                 | Sets | Start Weight | Wk 1          | Wk 2 |
| --- | ------------------------ | ---- | ------------ | ------------- | ---- |
| WU  | DB Bench Press (warm-up) | 2    | 25 lbs       | 20-12, 25-10  |      |
| 1   | DB Bench Press           | 3    | 35 lbs       | 10 x 12 x 12 |      |
| 2   | Incline DB Press         | 3    | 30 lbs       |               |      |
```

The parser detects:
- Warm-up rows from "WU" markers or "(warm-up)" annotations
- Weight units (lbs/kg) with automatic conversion to kg for Garmin
- Rest periods from a Rest column, section headers, or a 90s default
- Weekly progression columns (Wk 1, Wk 2, etc.)

## Project Structure

```
src/
├── app/                    # Next.js App Router pages and API routes
│   ├── api/
│   │   ├── notion/         # OAuth callback, page sync
│   │   ├── garmin/         # Auth, push workouts, pull activities
│   │   └── analyze/        # LLM coaching endpoints
│   ├── dashboard/          # Main dashboard + settings
│   ├── login/              # Notion OAuth login
│   └── onboarding/         # Connection setup wizard
├── components/
│   ├── dashboard/          # This-week grid, workout list, insight feed
│   ├── onboarding/         # Page selector, Garmin form, workout preview
│   └── ui/                 # ShadCN components + shared spinner
├── lib/
│   ├── core/types.ts       # Pipeline types: Parsed -> Resolved -> Garmin payload
│   ├── parser/             # Markdown table parser, rest detection, week selection
│   ├── resolver/           # 3-tier exercise resolution (exact, LLM, cache)
│   ├── adapters/           # Sport adapters (strength implemented)
│   ├── garmin/             # Client wrapper, sync, activity pull
│   ├── notion/             # OAuth helpers, page reader
│   ├── analysis/           # LLM coaching engine, prompts, activity matcher
│   ├── db/                 # Drizzle schema, migrations, queries
│   └── utils/              # Crypto, time formatting
└── test/                   # Vitest tests
```

## License

MIT
