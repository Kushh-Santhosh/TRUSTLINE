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

# ── Stage 3: lean production image ─────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Only production dependencies in the final image
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Compiled output from builder
COPY --from=builder /app/dist ./dist

# Copy migrations so migrate:up can be run inside the container
COPY migrations ./migrations

EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "dist/index.js"]
