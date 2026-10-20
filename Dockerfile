# ---- deps: install everything once (cached on package*.json) ----------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: typecheck + build the SPA and the server bundles -------------
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build        # tsc --noEmit && vite build  -> dist/
RUN npm run build:server # esbuild                   -> dist-server/

# ---- runner: production deps only, no compiler, no root --------------------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# tsx/typescript/vite live in devDependencies now, so this is the runtime set:
# hono, better-auth, drizzle-orm, @libsql/client, zod, dotenv.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/drizzle ./drizzle

# The app writes SQLite files and backups into these paths; they must be
# writable by the unprivileged `node` user (uid 1000).
RUN mkdir -p /app/data /app/backups && chown -R node:node /app/data /app/backups

USER node

EXPOSE 3000

# Migrations + seed are idempotent, so running them on every start is safe and
# keeps the image the only thing you need to deploy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1 || exit 1

CMD ["sh", "-c", "node dist-server/migrate.js && node dist-server/seed.js && node dist-server/index.js"]
