# GarminMD

Plan in Notion. Train with Garmin. Get coached by AI.

GarminMD is a self-hostable web app that:
- Authenticates users via **Notion OAuth**
- Reads a Notion training plan page and parses workouts from markdown tables
- Connects to **Garmin Connect** (via `@flow-js/garmin-connect`) to push workouts
- Stores tokens **encrypted** in SQLite

## Requirements

- Node.js **20+**
- `pnpm`

## Quickstart (local)

1) Install dependencies

```bash
pnpm install
```

2) Configure environment

```bash
cp .env.example .env.local
```

Fill in `.env.local`:
- `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`
- `NOTION_REDIRECT_URI` (must match your Notion integration settings)
- `NEXTAUTH_SECRET` (used by `iron-session`; **must be at least 32 characters**)
- `ENCRYPTION_KEY` (**64 hex chars**, 32 bytes) used to encrypt stored tokens
- `DATABASE_URL` (defaults to `file:./garminmd.db`)
- Optional: `ANTHROPIC_API_KEY` (only needed for LLM-backed resolution/analysis paths)

Generate an `ENCRYPTION_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

3) Run migrations

```bash
pnpm db:migrate
```

4) Start the dev server

```bash
pnpm dev
```

Open `http://localhost:3000`.

## Scripts

- `pnpm dev` – run locally
- `pnpm build` / `pnpm start` – production build + start
- `pnpm test` – run unit tests (Vitest)
- `pnpm lint` – Biome checks (format + lint + import organization)
- `pnpm db:generate` – generate Drizzle migrations
- `pnpm db:migrate` – apply Drizzle migrations to `DATABASE_URL`

## Notes / security

- Notion access tokens and Garmin session tokens are stored encrypted (AES-256-GCM) using `ENCRYPTION_KEY`.
- Garmin Connect does not provide a public consumer OAuth flow; GarminMD uses the same login flow as the mobile app to obtain session tokens. Passwords are not stored.

## Project docs

- `garmin-md-spec.md` – product/architecture spec
- `CLAUDE.md` – engineering notes and conventions
