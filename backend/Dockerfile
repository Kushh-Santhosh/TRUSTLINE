# ── Stage 1: install all dependencies ─────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
# ci installs exact versions (including devDeps needed for tsc)
RUN npm ci

# ── Stage 2: compile TypeScript ────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Compile src/ → dist/
RUN npm run build

# ── Stage 3: runtime image (includes devDeps for ts-node / seed / migrate) ─
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install ALL dependencies so every npm script works inside the container
# (migrate:up needs node-pg-migrate, seed needs ts-node)
COPY package.json package-lock.json ./
RUN npm ci

# Compiled output from builder
COPY --from=builder /app/dist ./dist

# Source files needed by ts-node scripts (seed, loadTest, verifyChain)
COPY src ./src

# Migrations directory
COPY migrations ./migrations

# tsconfig needed for ts-node compilation
COPY tsconfig.json ./

EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "dist/index.js"]
