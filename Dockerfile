# ─── Stage 1: Dependencies ─────────────────────────────────────
FROM node:20-slim AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ─── Stage 2: Build ───────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build Next.js with standalone output (see next.config.ts: output: "standalone")
RUN pnpm build

# ─── Stage 3: Production ──────────────────────────────────────
# Uses standalone output — no pnpm or node_modules needed at runtime.
# Drizzle migrations still need drizzle-kit, so we copy it from deps.
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 garminmd

# Copy standalone server (includes bundled node_modules)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Drizzle migration files and config
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

# Copy exercise dictionary (needed at runtime)
COPY --from=builder /app/data ./data

# Copy drizzle-kit for running migrations at startup
COPY --from=deps /app/node_modules/drizzle-kit ./node_modules/drizzle-kit
COPY --from=deps /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=deps /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=deps /app/node_modules/esbuild ./node_modules/esbuild

# Copy startup script
COPY scripts/start.sh ./scripts/start.sh
RUN chmod +x scripts/start.sh

# Create directory for SQLite database (volume mount target)
RUN mkdir -p /app/data/db && chown -R garminmd:nodejs /app/data/db

USER garminmd

EXPOSE 3000

CMD ["sh", "scripts/start.sh"]
