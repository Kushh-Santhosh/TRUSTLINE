# ── Stage 1: build the Vite app ────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# VITE_API_URL is injected at build time so it's baked into the JS bundle.
# Pass it via docker-compose `args:` or `--build-arg`.
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ── Stage 2: serve with nginx ──────────────────────────────────────────────
FROM nginx:alpine AS runner

# SPA routing config (falls back to index.html for client-side routes)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled Vite output
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
