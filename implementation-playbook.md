# Trustline — Implementation Playbook
### Micro-milestones for a solo developer + Antigravity IDE agent

**How to use this:** work top to bottom, one milestone at a time. Never hand Antigravity more than one milestone's prompt at once. After each milestone, run its verification step before moving on — if it fails, fix it before starting the next milestone (don't let broken foundations compound). Every "ready-to-paste prompt" is written to explicitly tell Antigravity what already exists, so it extends rather than regenerates.

Legend: **Dep** = depends on milestone #. **Time** = expected agent completion time (all ≤10 min by design).

---

## Phase 0 — Project Setup

**M0.1 — Monorepo skeleton**
- Goal: create the top-level folder structure, nothing functional yet.
- Output: empty `backend/` and `frontend/` folders, root `README.md` stub, root `.gitignore`.
- Files: `/README.md`, `/.gitignore`, `/backend/.gitkeep`, `/frontend/.gitkeep`
- Dep: none · Time: 3 min
- Verify: folders exist, `git status` shows them tracked.
- Prompt: *"Create a monorepo skeleton for a project called Trustline. Create `backend/` and `frontend/` directories (each with a `.gitkeep` placeholder), a root `README.md` with just the project title and a one-line description, and a root `.gitignore` for Node projects (node_modules, .env, dist, build). Do not add any other files or initialize any frameworks yet — this is only the folder skeleton."*

**M0.2 — Backend project init**
- Goal: initialize a Node/TypeScript project in `backend/`, no server code yet.
- Output: `package.json`, `tsconfig.json`, empty `src/` folder.
- Files: `/backend/package.json`, `/backend/tsconfig.json`, `/backend/src/.gitkeep`
- Dep: M0.1 · Time: 4 min
- Verify: `cd backend && npm install` runs clean; `npx tsc --noEmit` runs without errors on the empty src.
- Prompt: *"Inside the existing `backend/` folder (do not touch `frontend/`), initialize a Node.js + TypeScript project: `package.json` with name `trustline-backend`, TypeScript, ts-node-dev, and @types/node as devDependencies, a strict `tsconfig.json` targeting ES2022/CommonJS with `src` as rootDir and `dist` as outDir, and an empty `src/` folder. Do not add Express or any server code yet — this milestone is project init only."*

**M0.3 — Frontend project init**
- Goal: initialize a React + TypeScript + Vite project in `frontend/`.
- Output: standard Vite React-TS scaffold.
- Files: `/frontend/package.json`, `/frontend/vite.config.ts`, `/frontend/src/main.tsx`, `/frontend/src/App.tsx`, `/frontend/index.html`
- Dep: M0.1 · Time: 4 min
- Verify: `cd frontend && npm install && npm run dev` shows the default Vite React page.
- Prompt: *"Inside the existing `frontend/` folder (do not touch `backend/`), scaffold a React + TypeScript project using Vite's `react-ts` template. Keep the default starter page as-is — do not add routing, styling, or app logic yet. This milestone is scaffold only."*

**M0.4 — Env config files**
- Goal: define environment variable contracts before any code depends on them.
- Output: `.env.example` files for both apps.
- Files: `/backend/.env.example`, `/frontend/.env.example`
- Dep: M0.2, M0.3 · Time: 3 min
- Verify: files list `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `PORT` (backend) and `VITE_API_URL` (frontend), with placeholder values.
- Prompt: *"Create `backend/.env.example` with placeholder values for `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `PORT=4000`. Create `frontend/.env.example` with `VITE_API_URL=http://localhost:4000`. Do not create actual `.env` files, and do not wire any code to read these yet — this is contract definition only."*

**M0.5 — Lint/format config**
- Goal: add ESLint + Prettier to both projects so future milestones stay consistent.
- Output: shared-style config files, no code changes.
- Files: `/backend/.eslintrc.cjs`, `/backend/.prettierrc`, `/frontend/.eslintrc.cjs`, `/frontend/.prettierrc`
- Dep: M0.2, M0.3 · Time: 4 min
- Verify: `npx eslint src --ext .ts,.tsx` runs (may warn, shouldn't crash) in both projects.
- Prompt: *"Add ESLint and Prettier config to both `backend/` and `frontend/` (they already have package.json and tsconfig from prior milestones). Use a standard TypeScript ESLint config with Prettier integration. Add the necessary devDependencies to each package.json. Do not modify any existing source files, only add config."*

**M0.6 — Docker Compose skeleton**
- Goal: define the service list without real config yet.
- Output: `docker-compose.yml` with postgres + redis services, no app services yet.
- Files: `/docker-compose.yml`
- Dep: M0.1 · Time: 4 min
- Verify: `docker compose config` validates without error.
- Prompt: *"Create a root `docker-compose.yml` with two services: `postgres` (postgres:16, exposing 5432, with POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB env vars and a named volume) and `redis` (redis:7, exposing 6379). Do not add backend/frontend services yet — those come in a later milestone once the apps are runnable."*

---

## Phase 1 — Backend Foundation

**M1.1 — Express server bootstrap**
- Goal: a running HTTP server with a health check.
- Output: `GET /health` returns `{status: "ok"}`.
- Files: `/backend/src/index.ts`, `/backend/src/app.ts`
- Dep: M0.2 · Time: 5 min
- Verify: `npm run dev` in backend, `curl localhost:4000/health` returns 200 + JSON.
- Prompt: *"In the existing `backend/` project (package.json and tsconfig already exist from a prior milestone — do not recreate them), add Express as a dependency and create `src/app.ts` exporting an Express app with a single `GET /health` route returning `{status:'ok'}`, and `src/index.ts` that imports the app and listens on `process.env.PORT || 4000`. Add a `dev` script to package.json using ts-node-dev."*

**M1.2 — Core middleware**
- Goal: JSON body parsing, CORS, centralized error handler.
- Output: middleware wired into `app.ts`.
- Files: `/backend/src/app.ts` (modified), `/backend/src/middleware/errorHandler.ts`
- Dep: M1.1 · Time: 5 min
- Verify: posting malformed JSON to any route returns a clean 400, not a stack trace.
- Prompt: *"In the existing `backend/src/app.ts` (already has Express app + /health route — do not remove it), add `express.json()` body parsing and a CORS middleware allowing the frontend origin from env. Create `src/middleware/errorHandler.ts` exporting an Express error-handling middleware that returns `{error: message}` as JSON with an appropriate status code, and wire it in as the last middleware in app.ts."*

**M1.3 — Structured logging**
- Goal: replace console.log with a real logger.
- Output: `src/lib/logger.ts` using pino (or similar), request logging middleware.
- Files: `/backend/src/lib/logger.ts`, `/backend/src/app.ts` (modified)
- Dep: M1.1 · Time: 4 min
- Verify: server startup and each request print structured JSON log lines.
- Prompt: *"In the existing backend project, add `pino` and `pino-http` as dependencies. Create `src/lib/logger.ts` exporting a configured pino logger. In the existing `src/app.ts` (do not remove existing routes/middleware), add `pino-http` request logging using this logger."*

**M1.4 — Env validation module**
- Goal: fail fast on missing required env vars.
- Output: `src/lib/config.ts` that validates and exports typed config.
- Files: `/backend/src/lib/config.ts`
- Dep: M0.4, M1.1 · Time: 4 min
- Verify: deleting a required var from `.env` causes the server to exit with a clear error on boot.
- Prompt: *"In the existing backend project, create `src/lib/config.ts` that reads `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `PORT` from `process.env` using `dotenv`, validates each is present (throw a clear error and exit if not), and exports a typed `config` object. Update `src/index.ts` (already exists) to import and use `config.PORT` instead of reading `process.env` directly."*

**M1.5 — Route folder scaffolding**
- Goal: create empty route modules so later phases have a place to land.
- Output: placeholder routers mounted but returning 501 "not implemented".
- Files: `/backend/src/routes/auth.routes.ts`, `/backend/src/routes/approval.routes.ts`, `/backend/src/routes/ledger.routes.ts`, `/backend/src/routes/risk.routes.ts`, `/backend/src/app.ts` (modified)
- Dep: M1.2 · Time: 5 min
- Verify: `GET /api/auth/ping` (or similar) returns 501 with a clear body, doesn't crash the server.
- Prompt: *"In the existing backend project (app.ts already has /health, JSON parsing, CORS, error handler — do not remove any of it), create four empty Express routers: `src/routes/auth.routes.ts`, `src/routes/approval.routes.ts`, `src/routes/ledger.routes.ts`, `src/routes/risk.routes.ts`. Each should export a router with a single placeholder GET route at its root returning 501 with `{error:'not implemented'}`. Mount them in app.ts under `/api/auth`, `/api/approval`, `/api/ledger`, `/api/risk` respectively."*

---

## Phase 2 — Frontend Foundation

**M2.1 — App shell + routing**
- Goal: React Router set up with empty page placeholders.
- Output: routes for `/login`, `/register`, `/dashboard`, `/demo/dispute`, `/demo/attack`.
- Files: `/frontend/src/App.tsx` (modified), `/frontend/src/pages/*.tsx` (5 placeholder files), `/frontend/src/main.tsx` (modified if needed)
- Dep: M0.3 · Time: 6 min
- Verify: navigating to each route in the browser renders a distinct placeholder heading.
- Prompt: *"In the existing frontend project (Vite React-TS scaffold already exists — do not recreate main.tsx or index.html), add `react-router-dom` as a dependency. Create five placeholder page components under `src/pages/`: `LoginPage.tsx`, `RegisterPage.tsx`, `DashboardPage.tsx`, `DisputeDemoPage.tsx`, `AttackDemoPage.tsx` — each just renders an `<h1>` with its own name. Update `App.tsx` to set up routes for `/login`, `/register`, `/dashboard`, `/demo/dispute`, `/demo/attack` pointing to these pages."*

**M2.2 — API client wrapper**
- Goal: a single place all API calls go through.
- Output: `src/lib/apiClient.ts` with a typed `fetch` wrapper reading base URL from env.
- Files: `/frontend/src/lib/apiClient.ts`
- Dep: M0.4, M2.1 · Time: 4 min
- Verify: calling `apiClient.get('/health')` from browser devtools console (temporarily wired to a button) returns the backend's health response.
- Prompt: *"In the existing frontend project, create `src/lib/apiClient.ts` exporting `get`, `post`, `put`, `del` functions that wrap `fetch`, prefix requests with `import.meta.env.VITE_API_URL`, set `Content-Type: application/json`, parse JSON responses, and throw an error with the response body on non-2xx status. Do not wire it into any page yet."*

**M2.3 — Design tokens / theme**
- Goal: consistent visual language before building real UI (per the frontend-design skill's guidance — read that skill before this milestone).
- Output: Tailwind config (or CSS variables) with a defined palette/typography, not default template look.
- Files: `/frontend/tailwind.config.js`, `/frontend/src/index.css` (modified)
- Dep: M2.1 · Time: 6 min
- Verify: placeholder pages visibly use the custom palette/typography, not default Vite styling.
- Prompt: *"In the existing frontend project, add Tailwind CSS (install + init, wire into index.css and vite config). Define a small deliberate color palette and typography scale in `tailwind.config.js` (not default Tailwind slate/blue — pick something distinctive for a security product, e.g. deep navy + a single accent color). Apply the base font and background color globally in `index.css`. Do not restyle individual pages yet — this is just the design-token layer."*

**M2.4 — Auth pages skeleton**
- Goal: real (but non-functional) forms for login/register.
- Output: styled forms with fields, no API wiring yet.
- Files: `/frontend/src/pages/LoginPage.tsx` (modified), `/frontend/src/pages/RegisterPage.tsx` (modified)
- Dep: M2.3 · Time: 5 min
- Verify: forms render with the new design tokens, fields are controlled React state, submit button logs form state to console.
- Prompt: *"In the existing frontend project, update the existing placeholder `LoginPage.tsx` and `RegisterPage.tsx` (do not recreate them from scratch, extend them) to show a styled form using the Tailwind tokens already configured. Login: email field + 'Sign in with passkey' button. Register: email + display name fields + 'Register passkey' button. Use React state for fields. On submit, just `console.log` the values — no API calls yet, those come in Phase 4."*

**M2.5 — Dashboard skeleton**
- Goal: layout for the post-login experience.
- Output: dashboard with placeholder sections for sessions, pending approvals, recent activity.
- Files: `/frontend/src/pages/DashboardPage.tsx` (modified)
- Dep: M2.3 · Time: 5 min
- Verify: dashboard renders three distinct empty-state sections with the design tokens applied.
- Prompt: *"In the existing frontend project, update the existing placeholder `DashboardPage.tsx` to show a three-section layout using the Tailwind tokens already configured: 'Active Sessions', 'Pending Approvals', 'Recent Activity' — each section just an empty-state placeholder card for now (no real data, no API calls). This is layout only."*

---

## Phase 3 — Database

**M3.1 — Postgres connection module**
- Goal: a single reusable DB client in the backend.
- Output: `src/db/pool.ts` exporting a `pg` Pool.
- Files: `/backend/src/db/pool.ts`
- Dep: M1.4, M0.6 · Time: 4 min
- Verify: a temporary script running `SELECT 1` against the pool succeeds against the dockerized Postgres.
- Prompt: *"In the existing backend project (config.ts already validates DATABASE_URL — reuse it), add `pg` as a dependency and create `src/db/pool.ts` exporting a configured `Pool` instance using `config.DATABASE_URL`. Do not add any queries yet — this is connection setup only."*

**M3.2 — Migration tooling init**
- Goal: pick and initialize a migration tool.
- Output: `node-pg-migrate` (or similar) configured, empty migrations folder.
- Files: `/backend/migrations/.gitkeep`, `/backend/package.json` (modified — add migrate scripts)
- Dep: M3.1 · Time: 4 min
- Verify: `npm run migrate:up` runs cleanly with zero migrations present.
- Prompt: *"In the existing backend project, add `node-pg-migrate` as a dependency, create an empty `migrations/` folder, and add `migrate:up` / `migrate:down` / `migrate:create` scripts to package.json wired to use `DATABASE_URL` from the existing `.env`. Do not create any migration files yet."*

**M3.3 — Users + credentials tables**
- Goal: core identity tables.
- Output: migration creating `users` and `webauthn_credentials` tables.
- Files: `/backend/migrations/00001_users_and_credentials.js` (or `.sql`, matching chosen tool)
- Dep: M3.2 · Time: 5 min
- Verify: `npm run migrate:up` creates both tables; `\d users` and `\d webauthn_credentials` in psql show expected columns.
- Prompt: *"Using the existing node-pg-migrate setup in `backend/migrations/`, create a new migration that adds a `users` table (id uuid pk, email unique, display_name, created_at) and a `webauthn_credentials` table (id uuid pk, user_id fk to users, credential_id, public_key, counter, created_at). Do not touch any existing migrations."*

**M3.4 — Sessions + refresh tokens table**
- Goal: session/token persistence.
- Output: migration for `sessions` and `refresh_tokens` tables.
- Files: `/backend/migrations/00002_sessions.js`
- Dep: M3.3 · Time: 4 min
- Verify: migration applies cleanly on top of 00001.
- Prompt: *"Add a new migration in `backend/migrations/` (do not modify 00001) creating a `refresh_tokens` table: id uuid pk, user_id fk, token_hash, family_id, revoked boolean default false, created_at, expires_at. This supports refresh-token rotation with reuse detection via family_id."*

**M3.5 — Approval policy tables**
- Goal: quorum/policy data model.
- Output: migration for `approval_policies` table.
- Files: `/backend/migrations/00003_approval_policies.js`
- Dep: M3.4 · Time: 5 min
- Verify: migration applies cleanly; columns match the ApprovalPolicy model from the design doc.
- Prompt: *"Add a new migration in `backend/migrations/` creating an `approval_policies` table: id uuid pk, name, quorum_type (text: 'n_of_m' | 'role_weighted' | 'single_senior'), quorum_n int, quorum_m int, eligible_roles jsonb, escalation_timeout_seconds int, escalation_to jsonb, geo_fence jsonb nullable, created_at, version int default 1. Do not modify prior migrations."*

**M3.6 — Approval requests + votes tables**
- Goal: the actual approval-instance data.
- Output: migration for `approval_requests` and `approval_votes`.
- Files: `/backend/migrations/00004_approval_requests.js`
- Dep: M3.5 · Time: 5 min
- Verify: migration applies cleanly; foreign keys to policies and users resolve.
- Prompt: *"Add a new migration creating `approval_requests` (id uuid pk, policy_id fk, policy_version_snapshot int, requester_id fk to users, action_payload jsonb, status text default 'pending', created_at, resolved_at nullable) and `approval_votes` (id uuid pk, request_id fk, approver_id fk to users, decision text — 'approve'|'deny', signature text, created_at). Do not modify prior migrations."*

**M3.7 — Audit log table (hash-chained)**
- Goal: the non-repudiation ledger's storage.
- Output: migration for append-only `audit_log` table.
- Files: `/backend/migrations/00005_audit_log.js`
- Dep: M3.6 · Time: 4 min
- Verify: migration applies cleanly; columns support hash-chaining (prev_hash, this_hash).
- Prompt: *"Add a new migration creating an `audit_log` table: id bigserial pk, entry_type text, payload jsonb, prev_hash text, this_hash text, created_at. Add an index on created_at. Do not modify prior migrations — this table is append-only by convention, enforced at the application layer, not the DB layer, in a later milestone."*

**M3.8 — Seed script**
- Goal: repeatable demo data for local dev.
- Output: a script that inserts a couple of demo users/policies.
- Files: `/backend/src/scripts/seed.ts`
- Dep: M3.7 · Time: 5 min
- Verify: `npm run seed` populates users + one approval policy, idempotent on re-run (upsert or truncate-first).
- Prompt: *"In the existing backend project, create `src/scripts/seed.ts` that connects via the existing `db/pool.ts` and inserts two demo users (e.g. 'alice@demo.com', 'bob@demo.com') and one demo `approval_policies` row (2-of-3 quorum) if they don't already exist. Add a `seed` script to package.json running this via ts-node."*

---

## Phase 4 — Authentication

**M4.1 — WebAuthn registration options endpoint**
- Goal: server generates registration challenge.
- Output: `POST /api/auth/register/options` returns WebAuthn creation options.
- Files: `/backend/src/routes/auth.routes.ts` (modified), `/backend/src/services/webauthn.service.ts`
- Dep: M3.3, M1.5 · Time: 6 min
- Verify: `curl -X POST localhost:4000/api/auth/register/options -d '{"email":"a@b.com"}'` returns a valid PublicKeyCredentialCreationOptions JSON.
- Prompt: *"In the existing backend project, add `@simplewebauthn/server` as a dependency. Create `src/services/webauthn.service.ts` with a `generateRegistrationOptionsForUser(email)` function using `@simplewebauthn/server`'s `generateRegistrationOptions`, creating the user in the `users` table if not present. Replace the placeholder route in the existing `src/routes/auth.routes.ts` with `POST /register/options` that calls this and returns the options, storing the challenge temporarily (in-memory map is fine for now)."*

**M4.2 — WebAuthn registration verify endpoint**
- Goal: verify the credential and persist it.
- Output: `POST /api/auth/register/verify` stores the credential.
- Files: `/backend/src/routes/auth.routes.ts` (modified), `/backend/src/services/webauthn.service.ts` (modified)
- Dep: M4.1 · Time: 6 min
- Verify: after a real browser registration ceremony, a row appears in `webauthn_credentials`.
- Prompt: *"In the existing `src/services/webauthn.service.ts` (already has generateRegistrationOptionsForUser — do not remove it), add a `verifyRegistration(email, response)` function using `@simplewebauthn/server`'s `verifyRegistrationResponse`, checking against the stored challenge, and on success inserting a row into `webauthn_credentials`. Add `POST /register/verify` to the existing `auth.routes.ts` calling this."*

**M4.3 — Frontend passkey registration wiring**
- Goal: connect the register form to the two new endpoints.
- Output: clicking "Register passkey" performs the full WebAuthn ceremony.
- Files: `/frontend/src/pages/RegisterPage.tsx` (modified), `/frontend/src/lib/apiClient.ts` (used, not modified)
- Dep: M4.2, M2.2, M2.4 · Time: 6 min
- Verify: registering in the browser completes without error and the credential appears in the DB.
- Prompt: *"Add `@simplewebauthn/browser` to the existing frontend project. In the existing `RegisterPage.tsx` (already has a form and a console.log submit — replace only the submit handler), wire the 'Register passkey' button to: call `apiClient.post('/api/auth/register/options', {email})`, pass the result to `@simplewebauthn/browser`'s `startRegistration`, then post the result to `/api/auth/register/verify`. Show a success or error message in the UI."*

**M4.4 — WebAuthn login options endpoint**
- Goal: server generates login challenge.
- Output: `POST /api/auth/login/options` returns assertion options.
- Files: `/backend/src/routes/auth.routes.ts` (modified), `/backend/src/services/webauthn.service.ts` (modified)
- Dep: M4.2 · Time: 5 min
- Verify: endpoint returns valid PublicKeyCredentialRequestOptions for a registered email.
- Prompt: *"In the existing `webauthn.service.ts`, add `generateLoginOptionsForUser(email)` using `generateAuthenticationOptions`, looking up the user's stored credentials. Add `POST /login/options` to the existing `auth.routes.ts`."*

**M4.5 — WebAuthn login verify + session issuance**
- Goal: verify assertion, issue JWT + refresh token.
- Output: `POST /api/auth/login/verify` returns access + refresh tokens on success.
- Files: `/backend/src/routes/auth.routes.ts` (modified), `/backend/src/services/webauthn.service.ts` (modified), `/backend/src/services/session.service.ts`
- Dep: M4.4, M3.4 · Time: 7 min
- Verify: full login ceremony from browser returns a valid JWT; decoding it shows the correct user id.
- Prompt: *"Create `src/services/session.service.ts` with `issueSession(userId)` that signs a short-lived JWT access token (using `config.JWT_SECRET`) and a longer-lived refresh token (stored hashed in `refresh_tokens` with a new family_id). In the existing `webauthn.service.ts`, add `verifyLogin(email, response)` using `verifyAuthenticationResponse`. Add `POST /login/verify` to `auth.routes.ts` that verifies and, on success, calls `issueSession` and returns both tokens."*

**M4.6 — Frontend passkey login wiring**
- Goal: connect login form to the endpoints, store tokens.
- Output: successful login redirects to `/dashboard` with tokens stored.
- Files: `/frontend/src/pages/LoginPage.tsx` (modified), `/frontend/src/lib/auth.ts`
- Dep: M4.5, M2.2 · Time: 6 min
- Verify: logging in via browser redirects to dashboard; tokens present in memory/state.
- Prompt: *"Create `src/lib/auth.ts` in the existing frontend project exporting simple in-memory getters/setters for access/refresh tokens (no localStorage — keep in a module-level variable or React context). In the existing `LoginPage.tsx`, wire the 'Sign in with passkey' button to call `/api/auth/login/options`, `startAuthentication` from `@simplewebauthn/browser`, then `/api/auth/login/verify`, store the returned tokens via `auth.ts`, and redirect to `/dashboard` using react-router's navigate."*

**M4.7 — TOTP registration + verify**
- Goal: fallback/step-up factor.
- Output: `POST /api/auth/totp/setup` and `POST /api/auth/totp/verify`.
- Files: `/backend/src/routes/auth.routes.ts` (modified), `/backend/src/services/totp.service.ts`
- Dep: M4.2 · Time: 6 min
- Verify: setup returns a QR-encodable secret; verifying a real authenticator-app code succeeds.
- Prompt: *"Add `otplib` as a dependency to the existing backend project. Create `src/services/totp.service.ts` with `generateSecretForUser(userId)` (stores secret on the user record — add a `totp_secret` column via a new migration first if it doesn't exist) and `verifyCode(userId, code)`. Add `POST /totp/setup` and `POST /totp/verify` to the existing `auth.routes.ts`."*

**M4.8 — Refresh token rotation endpoint**
- Goal: rotate refresh tokens, detect reuse.
- Output: `POST /api/auth/refresh` issues a new pair, revokes the whole family on reuse.
- Files: `/backend/src/routes/auth.routes.ts` (modified), `/backend/src/services/session.service.ts` (modified)
- Dep: M4.5 · Time: 6 min
- Verify: calling refresh twice with the same old token revokes the session family (second call and any further access with old tokens fails).
- Prompt: *"In the existing `session.service.ts` (already has issueSession — do not remove it), add `rotateRefreshToken(oldToken)` that looks up the token by hash, checks `revoked`, and if already revoked, revokes the entire `family_id` (reuse detected) and throws. Otherwise marks the old token revoked and issues a new pair in the same family. Add `POST /refresh` to `auth.routes.ts` using this."*

**M4.9 — Auth middleware**
- Goal: protect routes with a JWT check.
- Output: `requireAuth` middleware usable by other routers.
- Files: `/backend/src/middleware/requireAuth.ts`
- Dep: M4.5 · Time: 4 min
- Verify: a protected test route returns 401 without a token and 200 with a valid one.
- Prompt: *"Create `src/middleware/requireAuth.ts` in the existing backend project: an Express middleware that reads `Authorization: Bearer <token>`, verifies it with `config.JWT_SECRET`, attaches `req.userId`, and returns 401 on missing/invalid token. Do not apply it to any routes yet — that happens as each protected route is built."*

---

## Phase 5 — Approval Engine

**M5.1 — Approval policy create/read endpoints**
- Goal: CRUD for policies (minimal — create + list + get by id).
- Output: `POST /api/approval/policies`, `GET /api/approval/policies`, `GET /api/approval/policies/:id`.
- Files: `/backend/src/routes/approval.routes.ts` (modified), `/backend/src/services/policy.service.ts`
- Dep: M3.5, M4.9 · Time: 6 min
- Verify: creating a policy via curl, then fetching it by id, returns matching data.
- Prompt: *"In the existing backend project, create `src/services/policy.service.ts` with `createPolicy(data)`, `listPolicies()`, `getPolicy(id)` querying the existing `approval_policies` table. Replace the placeholder route in the existing `src/routes/approval.routes.ts` with these three endpoints, protected by the existing `requireAuth` middleware."*

**M5.2 — Approval request creation endpoint**
- Goal: submit an action for approval.
- Output: `POST /api/approval/requests` creates a pending request snapshotting the policy version.
- Files: `/backend/src/routes/approval.routes.ts` (modified), `/backend/src/services/request.service.ts`
- Dep: M5.1, M3.6 · Time: 5 min
- Verify: creating a request stores `policy_version_snapshot` matching the policy's current version at creation time.
- Prompt: *"Create `src/services/request.service.ts` with `createRequest(policyId, requesterId, actionPayload)` that fetches the current policy, inserts into `approval_requests` with status 'pending' and `policy_version_snapshot` set to the policy's current version. Add `POST /requests` to the existing `approval.routes.ts`, protected by `requireAuth`."*

**M5.3 — Quorum evaluation logic**
- Goal: determine if a request has enough votes to resolve.
- Output: pure function `evaluateQuorum(policy, votes)` returning 'approved' | 'denied' | 'pending'.
- Files: `/backend/src/services/quorum.service.ts`
- Dep: M5.2 · Time: 6 min
- Verify: a unit test (write inline, formal tests come in Phase 9) with 2-of-3 policy and 2 approve votes returns 'approved'.
- Prompt: *"Create `src/services/quorum.service.ts` in the existing backend project exporting a pure function `evaluateQuorum(policy: {quorum_type, quorum_n, quorum_m}, votes: {decision:'approve'|'deny'}[])` returning `'approved' | 'denied' | 'pending'`. For `n_of_m`, approved once `quorum_n` approve-votes exist, denied once enough denies make quorum mathematically impossible, otherwise pending. Do not wire it into any route yet — that's the next milestone."*

**M5.4 — Vote submission endpoint**
- Goal: cast a vote, evaluate quorum, update request status.
- Output: `POST /api/approval/requests/:id/votes`.
- Files: `/backend/src/routes/approval.routes.ts` (modified), `/backend/src/services/request.service.ts` (modified)
- Dep: M5.3 · Time: 6 min
- Verify: submitting enough approve-votes flips the request's status to 'approved' and sets `resolved_at`.
- Prompt: *"In the existing `request.service.ts` (already has createRequest — do not remove it), add `submitVote(requestId, approverId, decision)` that inserts into `approval_votes`, fetches all votes for the request plus its policy, calls the existing `evaluateQuorum`, and if the result is 'approved' or 'denied', updates the request's status and `resolved_at`. Add `POST /requests/:id/votes` to `approval.routes.ts`."*

**M5.5 — Delegation logic**
- Goal: temporary approver assignment with hard expiry.
- Output: `POST /api/approval/delegations` and expiry check integrated into vote eligibility.
- Files: `/backend/src/routes/approval.routes.ts` (modified), `/backend/src/services/delegation.service.ts`, new migration for `delegations` table
- Dep: M5.4 · Time: 7 min
- Verify: a delegated approver can vote before expiry; voting attempt after expiry is rejected.
- Prompt: *"Add a new migration for a `delegations` table (id uuid pk, delegator_id fk, delegate_id fk, expires_at, created_at) in the existing `backend/migrations/` folder. Create `src/services/delegation.service.ts` with `createDelegation(delegatorId, delegateId, expiresAt)` and `isActiveDelegate(userId)`. Add `POST /delegations` to the existing `approval.routes.ts`. Update the existing `submitVote` in `request.service.ts` to also accept votes from an active delegate of an eligible approver."*

**M5.6 — Escalation timer**
- Goal: auto-escalate a stalled pending request.
- Output: a background check (interval or queued job) that escalates requests past their policy's timeout.
- Files: `/backend/src/jobs/escalation.job.ts`, `/backend/src/index.ts` (modified to start the job)
- Dep: M5.4 · Time: 6 min
- Verify: a request older than its policy's `escalation_timeout_seconds` gets its `status` or an `escalated` flag set within one check cycle in a local test.
- Prompt: *"Create `src/jobs/escalation.job.ts` in the existing backend project exporting a `runEscalationCheck()` function that queries pending `approval_requests` older than their policy's `escalation_timeout_seconds`, and updates a new `escalated boolean default false` column (add via a new migration if it doesn't exist) to true, logging via the existing logger. In `src/index.ts` (already starts the server — do not remove that), call `setInterval(runEscalationCheck, 30000)` after server start."*

**M5.7 — Break-glass emergency access**
- Goal: bypass quorum with mandatory flagging.
- Output: `POST /api/approval/requests/:id/break-glass`.
- Files: `/backend/src/routes/approval.routes.ts` (modified), `/backend/src/services/request.service.ts` (modified)
- Dep: M5.4 · Time: 5 min
- Verify: calling break-glass immediately sets status to 'approved' with a `break_glass boolean` and `needs_review boolean` both true (add columns via migration if needed).
- Prompt: *"Add a migration adding `break_glass boolean default false` and `needs_review boolean default false` columns to `approval_requests` if they don't exist. In the existing `request.service.ts`, add `breakGlass(requestId, actorId)` that sets status to 'approved', `break_glass=true`, `needs_review=true`. Add `POST /requests/:id/break-glass` to `approval.routes.ts`, protected by `requireAuth`."*

---

## Phase 6 — Ledger & Cryptographic Receipts

**M6.1 — Approver keypair generation**
- Goal: every user gets a signing keypair at registration.
- Output: keypair generated and private key stored (encrypted) alongside the user.
- Files: new migration for `signing_keys` table, `/backend/src/services/keys.service.ts`, `/backend/src/services/webauthn.service.ts` (modified)
- Dep: M4.2 · Time: 6 min
- Verify: after registering, a row exists in `signing_keys` for that user with a public key.
- Prompt: *"Add a migration creating a `signing_keys` table (user_id fk pk, public_key text, encrypted_private_key text, created_at). Create `src/services/keys.service.ts` with `generateKeypairForUser(userId)` using Node's `crypto` (Ed25519), storing the public key in plain text and the private key encrypted with a key derived from `config.JWT_SECRET` (simple symmetric encryption is fine for hackathon scope). Call this from the existing `verifyRegistration` in `webauthn.service.ts` after a successful registration."*

**M6.2 — Signing service**
- Goal: sign an approval-vote payload with the approver's key.
- Output: `signPayload(userId, payload)` returning a signature.
- Files: `/backend/src/services/signing.service.ts`
- Dep: M6.1 · Time: 5 min
- Verify: signing then verifying the same payload with the stored public key succeeds; tampering with the payload fails verification.
- Prompt: *"Create `src/services/signing.service.ts` in the existing backend project with `sign(userId, payload: object)` — decrypts the user's private key via the existing `keys.service.ts`, signs a canonical JSON serialization of the payload, and returns the signature — and `verify(publicKey, payload, signature)`. Do not wire into any route yet."*

**M6.3 — Wire signing into vote submission**
- Goal: every vote produces a signed receipt.
- Output: `approval_votes.signature` populated on every vote.
- Files: `/backend/src/services/request.service.ts` (modified)
- Dep: M6.2, M5.4 · Time: 5 min
- Verify: a new vote's `signature` column is non-null and independently verifiable against the approver's stored public key.
- Prompt: *"In the existing `submitVote` function in `request.service.ts`, before inserting the vote, call the existing `signing.service.ts`'s `sign(approverId, {requestId, decision, timestamp})` and store the result in the vote's `signature` column (already exists in the `approval_votes` table)."*

**M6.4 — Hash-chained audit log writer**
- Goal: append-only tamper-evident logging for every ledger-worthy event.
- Output: `appendAuditEntry(entryType, payload)` chaining to the previous hash.
- Files: `/backend/src/services/audit.service.ts`
- Dep: M3.7 · Time: 6 min
- Verify: three sequential calls produce three rows where each `prev_hash` matches the prior row's `this_hash`.
- Prompt: *"Create `src/services/audit.service.ts` in the existing backend project with `appendAuditEntry(entryType: string, payload: object)`: fetch the most recent `audit_log` row's `this_hash` (or a fixed genesis string if none exists), compute `this_hash = sha256(prev_hash + JSON.stringify(payload))`, and insert a new row with entryType, payload, prev_hash, this_hash. Do not wire it into any other service yet."*

**M6.5 — Wire audit logging into approval + auth events**
- Goal: every login, vote, and resolution writes an audit entry.
- Output: audit entries appear for these three event types.
- Files: `/backend/src/services/session.service.ts` (modified), `/backend/src/services/request.service.ts` (modified)
- Dep: M6.4, M6.3 · Time: 6 min
- Verify: logging in, voting, and a request resolving each produce a new `audit_log` row with the correct `entry_type`.
- Prompt: *"In the existing `issueSession` (session.service.ts) call the existing `appendAuditEntry('login', {userId})`. In the existing `submitVote` (request.service.ts) call `appendAuditEntry('vote', {requestId, approverId, decision, signature})` after the vote is recorded, and if the vote causes resolution, also call `appendAuditEntry('request_resolved', {requestId, status})`."*

**M6.6 — Independent chain verifier**
- Goal: a standalone tool (no trust in the running server) to verify the whole chain.
- Output: a script printing "chain valid" or the first broken link.
- Files: `/backend/src/scripts/verifyChain.ts`
- Dep: M6.4 · Time: 6 min
- Verify: running it against a healthy chain prints valid; manually corrupting one row's payload in the DB makes it correctly report the break point.
- Prompt: *"Create `src/scripts/verifyChain.ts` in the existing backend project: fetch all `audit_log` rows ordered by id, recompute each `this_hash` from its `payload` and the previous row's `this_hash`, and compare to the stored value. Print 'Chain valid up to row N' or 'BROKEN at row N: expected X got Y'. Add a `verify-chain` script to package.json."*

**M6.7 — Receipt lookup endpoint**
- Goal: fetch a specific approval's signed receipt for the dispute demo.
- Output: `GET /api/ledger/receipt/:requestId`.
- Files: `/backend/src/routes/ledger.routes.ts` (modified), `/backend/src/services/audit.service.ts` (modified)
- Dep: M6.5 · Time: 5 min
- Verify: calling this for a resolved request returns the vote signatures, approver identities, and the audit-log entries tied to that request id.
- Prompt: *"In the existing `audit.service.ts`, add `getReceiptForRequest(requestId)` that queries `approval_votes` (with signatures) and `audit_log` rows whose payload contains that requestId, joined with `signing_keys` public keys for each approver. Replace the placeholder in the existing `ledger.routes.ts` with `GET /receipt/:requestId` returning this, protected by `requireAuth`."*

---

## Phase 7 — Risk Engine

**M7.1 — Device/session fingerprint capture**
- Goal: record enough context per login to score risk later.
- Output: login stores IP, user-agent, and a rough geo lookup (can stub geo initially).
- Files: `/backend/src/services/session.service.ts` (modified), new migration adding columns to `refresh_tokens` or a new `login_events` table
- Dep: M4.5 · Time: 6 min
- Verify: after logging in, a row records the IP and user-agent used.
- Prompt: *"Add a migration creating a `login_events` table (id uuid pk, user_id fk, ip text, user_agent text, created_at). In the existing `issueSession` in `session.service.ts`, accept `ip` and `userAgent` params (passed from the route handler using Express's `req.ip` and `req.headers['user-agent']`) and insert a row into `login_events`."*

**M7.2 — Risk scoring heuristic**
- Goal: score a login attempt as low/medium/high risk.
- Output: `scoreLoginRisk(userId, ip, userAgent)` pure-ish function.
- Files: `/backend/src/services/risk.service.ts`
- Dep: M7.1 · Time: 6 min
- Verify: a first-ever login for a user scores 'medium' or 'high' (no history); a login matching recent history scores 'low'.
- Prompt: *"Create `src/services/risk.service.ts` in the existing backend project with `scoreLoginRisk(userId, ip, userAgent)`: query the user's last 5 `login_events`, return `'high'` if this IP/user-agent combination has never been seen and there's no login history at all beyond registration, `'medium'` if the IP is new but user-agent matches history, otherwise `'low'`. Do not wire into the login route yet."*

**M7.3 — Step-up wiring**
- Goal: force TOTP when risk is medium/high.
- Output: login-verify endpoint returns a 'step_up_required' response instead of tokens when risk warrants it.
- Files: `/backend/src/routes/auth.routes.ts` (modified)
- Dep: M7.2, M4.7 · Time: 6 min
- Verify: logging in from a genuinely new context returns a step-up challenge; completing TOTP then issues normal tokens.
- Prompt: *"In the existing `POST /login/verify` in `auth.routes.ts`, after WebAuthn verification succeeds, call the existing `scoreLoginRisk`. If 'medium' or 'high', return `{stepUpRequired: true, method: 'totp'}` instead of issuing tokens. Add `POST /login/step-up` that accepts a TOTP code, verifies it via the existing `totp.service.ts`, and on success calls the existing `issueSession`."*

**M7.4 — Explainability log**
- Goal: record *why* a step-up was triggered.
- Output: each risk decision writes an audit entry with reasoning.
- Files: `/backend/src/services/risk.service.ts` (modified)
- Dep: M7.3, M6.4 · Time: 4 min
- Verify: a `risk_decision` audit entry exists with fields like `{reason: 'new_ip', score: 'medium'}`.
- Prompt: *"In the existing `scoreLoginRisk` in `risk.service.ts`, before returning the score, call the existing `appendAuditEntry('risk_decision', {userId, ip, score, reason})` where `reason` is a short string describing which condition triggered the score (e.g. 'new_ip_and_device', 'no_history')."*

---

## Phase 8 — Demo Features

**M8.1 — Number-matching push simulation**
- Goal: replace tap-to-approve with a number the user must select.
- Output: step-up UI shows a 2-digit code the user must pick from 3 options matching a "phone" simulation panel.
- Files: `/frontend/src/pages/LoginPage.tsx` (modified), `/frontend/src/components/PushSimulator.tsx`
- Dep: M7.3, M2.5 · Time: 7 min
- Verify: selecting the wrong number fails the step-up; selecting the right one proceeds to the dashboard.
- Prompt: *"Create `src/components/PushSimulator.tsx` in the existing frontend project: displays a 2-digit target code and 3 buttons (one correct, two decoys), simulating a second-device approval prompt. In the existing `LoginPage.tsx`, when step-up is required (already returns `stepUpRequired` from a prior milestone), show this component instead of/alongside the TOTP input, and only proceed if the correct number is picked."*

**M8.2 — Attack-mode: MFA fatigue simulation**
- Goal: demo showing repeated push spam being auto-throttled.
- Output: a "Simulate Attack" button on `AttackDemoPage` that fires repeated step-up prompts and shows the system auto-freezing after N attempts.
- Files: `/frontend/src/pages/AttackDemoPage.tsx` (modified), `/backend/src/routes/auth.routes.ts` (modified), `/backend/src/services/risk.service.ts` (modified)
- Dep: M7.3 · Time: 8 min
- Verify: clicking the demo button visibly shows several rapid prompts, then a "further attempts blocked" state.
- Prompt: *"In the existing `risk.service.ts`, add a simple in-memory (Map keyed by userId) rate counter: if more than 3 step-up requests occur for a user within 60 seconds, return a `blocked` flag. Wire this check into the existing `POST /login/step-up` in `auth.routes.ts`, returning 429 with `{blocked:true}` once triggered. In the existing `AttackDemoPage.tsx`, add a 'Simulate MFA Fatigue Attack' button that calls the step-up endpoint 5 times in quick succession against a demo user and displays each response, ending on the blocked state."*

**M8.3 — Attack-mode: replay attack simulation**
- Goal: demo a stolen/replayed token being rejected.
- Output: button that reuses an already-rotated refresh token and shows the family-revocation kicking in.
- Files: `/frontend/src/pages/AttackDemoPage.tsx` (modified)
- Dep: M4.8 · Time: 6 min
- Verify: demo visibly shows the first refresh succeeding, then a captured/older token being replayed and rejected with the session family shown as revoked.
- Prompt: *"In the existing `AttackDemoPage.tsx`, add a 'Simulate Replay Attack' button that: calls `/api/auth/refresh` once with a valid stored refresh token (success), stores the now-old token, calls `/api/auth/refresh` again using that same old token, and displays both responses side by side, highlighting that the second call is rejected and the session family was revoked (per the existing reuse-detection logic in `session.service.ts`)."*

**M8.4 — Dispute-resolution demo screen**
- Goal: the centerpiece — deny a claim, pull the signed receipt, verify it live.
- Output: `DisputeDemoPage` lets you pick a resolved approval request, shows an approver "claiming" they never approved it, then reveals the signed receipt and runs client-visible verification.
- Files: `/frontend/src/pages/DisputeDemoPage.tsx` (modified)
- Dep: M6.7 · Time: 8 min
- Verify: selecting a real resolved request and clicking 'Resolve Dispute' displays the approver's signature, public key, and a green 'signature valid' confirmation.
- Prompt: *"In the existing `DisputeDemoPage.tsx`, add a dropdown listing resolved approval requests (fetch from `GET /api/approval/policies` and `GET /api/approval/requests` — add a simple `GET /requests` list endpoint to the existing `approval.routes.ts` if it doesn't exist yet). On selecting one and clicking 'Resolve Dispute', call the existing `GET /api/ledger/receipt/:requestId`, display each approver's decision, signature, and public key, and show a clear 'Signature Verified ✓' indicator (verification can happen server-side already via the existing signing service — just display the result)."*

**M8.5 — Phishing-clone demo page**
- Goal: show a cloned login page failing to get a valid WebAuthn assertion.
- Output: a second, differently-hosted (or differently-origin-simulated) login page that visibly fails passkey login.
- Files: `/frontend/src/pages/PhishingCloneDemoPage.tsx`, `/frontend/src/App.tsx` (modified — add route)
- Dep: M4.6 · Time: 5 min
- Verify: attempting passkey login on this page produces a browser-level WebAuthn error, displayed clearly in the UI as "this origin is not recognized by your passkey."
- Prompt: *"Create `src/pages/PhishingCloneDemoPage.tsx` in the existing frontend project, visually styled to look like a slightly-off clone of the real login page (different subtle branding, labeled clearly on-screen as 'DEMO: Simulated Phishing Clone' so it's obviously not real deception). Wire its login button to attempt the same WebAuthn login flow as `LoginPage.tsx`, and catch/display the resulting browser error clearly, explaining that passkeys are origin-bound. Add a route for it at `/demo/phishing-clone` in the existing `App.tsx`."*

---

## Phase 9 — Testing

**M9.1 — Unit tests: quorum evaluation**
- Goal: lock in correctness of the core decision logic.
- Output: test file covering approved/denied/pending cases.
- Files: `/backend/src/services/quorum.service.test.ts`
- Dep: M5.3 · Time: 5 min
- Verify: `npm test` passes with at least 4 cases (n-of-m approved, denied, pending, edge case of n=m).
- Prompt: *"Add `vitest` (or `jest`, whichever is already configured) as a dependency in the existing backend project if not present. Create `src/services/quorum.service.test.ts` testing the existing `evaluateQuorum` function: a 2-of-3 policy with 2 approves returns 'approved', with 2 denies returns 'denied', with 1 approve returns 'pending', and a 3-of-3 policy with 1 deny returns 'denied' (can't reach quorum)."*

**M9.2 — Unit tests: signing/verification**
- Goal: lock in the crypto correctness.
- Output: test covering sign→verify success and tamper→verify failure.
- Files: `/backend/src/services/signing.service.test.ts`
- Dep: M6.2 · Time: 5 min
- Verify: tests pass, including a tampered-payload case that must fail verification.
- Prompt: *"Create `src/services/signing.service.test.ts` in the existing backend project testing the existing `signing.service.ts`: generate a test keypair, sign a payload, verify it succeeds, then mutate one field of the payload and verify it now fails."*

**M9.3 — Integration test: full login flow**
- Goal: catch regressions across the auth stack.
- Output: a test hitting the real routes against a test DB.
- Files: `/backend/src/tests/auth.integration.test.ts`
- Dep: M4.6, M7.3 · Time: 8 min
- Verify: test passes against a disposable test database (docker or in-memory pg).
- Prompt: *"Create `src/tests/auth.integration.test.ts` in the existing backend project using supertest against the existing Express app: register a user (mock the WebAuthn ceremony library calls, since real browser crypto can't run in a test), log in, and assert a valid JWT is returned. Use a separate test database configured via an env var so it doesn't touch dev data."*

**M9.4 — Integration test: approval + dispute flow**
- Goal: validate the centerpiece feature end-to-end.
- Output: a test that creates a policy, request, votes, and fetches the receipt.
- Files: `/backend/src/tests/approval.integration.test.ts`
- Dep: M6.7, M9.3 · Time: 7 min
- Verify: test passes, asserting the receipt contains valid signatures matching stored public keys.
- Prompt: *"Create `src/tests/approval.integration.test.ts` in the existing backend project: create a 2-of-3 policy, create a request, submit 2 approve votes, assert the request status becomes 'approved', then call the existing receipt endpoint and assert the returned signatures verify against the stored public keys using the existing `signing.service.ts`'s verify function."*

**M9.5 — Load/rate-limit smoke test**
- Goal: confirm the MFA-fatigue throttle actually holds under a burst.
- Output: a small script firing N rapid requests and asserting the block kicks in.
- Files: `/backend/src/scripts/loadTest.ts`
- Dep: M8.2 · Time: 5 min
- Verify: running the script shows the first 3 requests succeed and the 4th+ return 429.
- Prompt: *"Create `src/scripts/loadTest.ts` in the existing backend project that fires 6 rapid `POST /api/auth/login/step-up` requests for the same demo user and prints each response status, to confirm the existing rate-limit logic in `risk.service.ts` blocks after the 3rd attempt within the window."*

---

## Phase 10 — Deployment

**M10.1 — Full Docker Compose**
- Goal: one command runs the whole stack.
- Output: `docker-compose.yml` extended with backend + frontend services.
- Files: `/docker-compose.yml` (modified), `/backend/Dockerfile`, `/frontend/Dockerfile`
- Dep: M0.6, all Phase 1–7 milestones · Time: 8 min
- Verify: `docker compose up` brings up postgres, redis, backend (health check passes), and frontend, all networked together.
- Prompt: *"In the existing `docker-compose.yml` (already has postgres and redis — do not remove them), add a `backend` service built from a new `backend/Dockerfile` (multi-stage Node build) depending on postgres and redis, and a `frontend` service built from a new `frontend/Dockerfile` (Vite build served via a lightweight static server). Wire environment variables so backend can reach postgres/redis by service name, and frontend's `VITE_API_URL` points to the backend service."*

**M10.2 — Secrets finalization**
- Goal: make sure nothing sensitive is hardcoded or committed.
- Output: audit pass over env usage, confirm `.env` is gitignored, secrets generated fresh for demo.
- Files: `.env` (local only, not committed), possibly `/backend/src/lib/config.ts` (checked, not modified if already correct)
- Dep: M10.1 · Time: 4 min
- Verify: `git status` shows no `.env` tracked; grep for hardcoded secrets in source returns nothing.
- Prompt: *"Audit the existing backend and frontend source for any hardcoded secrets, API keys, or credentials outside of `.env`/`.env.example` files. Confirm `.gitignore` (already exists) covers `.env` in both `backend/` and `frontend/`. Report any findings — do not auto-fix without showing me first."*

**M10.3 — One-command startup script**
- Goal: reduce demo-day friction to a single command.
- Output: a `start-demo.sh` (or npm script) that brings up Docker Compose and runs migrations + seed.
- Files: `/start-demo.sh`
- Dep: M10.1, M3.8 · Time: 4 min
- Verify: running the script from a clean clone results in a fully seeded, browsable app.
- Prompt: *"Create a root `start-demo.sh` script that runs `docker compose up -d`, waits for postgres to be healthy, then runs the existing backend's `migrate:up` and `seed` scripts inside the backend container, and prints the frontend URL. Make it executable."*

**M10.4 — Post-deploy smoke test**
- Goal: catch a broken deploy before you're on stage.
- Output: a script hitting health/login/approval endpoints against the running stack.
- Files: `/backend/src/scripts/smokeTest.ts`
- Dep: M10.3 · Time: 5 min
- Verify: running it against a freshly started stack prints all green.
- Prompt: *"Create `src/scripts/smokeTest.ts` in the existing backend project that hits `GET /health`, and confirms the demo-seeded users and policy from the existing seed script are queryable via the existing list endpoints. Print a pass/fail summary."*

---

## Phase 11 — Presentation Assets

**M11.1 — README finalization**
- Goal: a judge-readable overview.
- Output: full README with setup instructions and the architecture diagram from the design doc.
- Files: `/README.md` (modified)
- Dep: M10.3 · Time: 6 min
- Verify: a fresh reader can run `start-demo.sh` from the README alone.
- Prompt: *"Update the existing root `README.md` (currently just a title/description) with: project overview, the architecture diagram (ASCII or a linked image), setup instructions referencing `start-demo.sh`, and a short list of the demo scenarios available (dispute resolution, attack-mode, phishing-clone) with their routes."*

**M11.2 — Demo script document**
- Goal: a timed run-of-show for stage.
- Output: a markdown doc with exact click-by-click steps and timing.
- Files: `/docs/demo-script.md`
- Dep: M8.4, M8.5 · Time: 5 min
- Verify: a teammate unfamiliar with the code can follow it and complete the demo in under 4 minutes.
- Prompt: *"Create `docs/demo-script.md` in the existing project: a step-by-step script for a live demo covering passkey login, a risk-triggered step-up, the dispute-resolution demo, the attack-mode demo, and the phishing-clone demo, each step with the exact page/button to click and a target time budget, totaling under 4 minutes."*

**M11.3 — Slide deck outline**
- Goal: a lightweight outline to hand to the pptx skill/tool later.
- Output: a markdown outline of slide titles + one-liner content, not the actual deck.
- Files: `/docs/slide-outline.md`
- Dep: M11.1 · Time: 4 min
- Verify: outline covers problem framing, the winning concept, architecture, live-demo cue points, and what was deliberately not built.
- Prompt: *"Create `docs/slide-outline.md`: a bullet outline (not a full deck) of slide titles and one-line content each, covering: the problem statement's real question, why our approach (non-repudiation ledger) answers it directly, a simple architecture slide, a cue slide for switching into the live demo, and a closing slide on what we deliberately didn't build and why."*

**M11.4 — Judge Q&A prep doc**
- Goal: be ready for the "what if X fails" questions the brief hints at.
- Output: an anticipated-questions doc with concise answers.
- Files: `/docs/qa-prep.md`
- Dep: M11.1 · Time: 5 min
- Verify: doc covers at least: network failure mid-login, an approver going missing, a disputed approval, and why blockchain/heavier ML weren't used.
- Prompt: *"Create `docs/qa-prep.md` listing anticipated judge questions with 2–3 sentence answers: What happens if the network fails mid-login? What if all approvers are unavailable? How do you prove a disputed approval? Why didn't you use a real blockchain or ML fraud model? Base answers on the design decisions already made in the project's architecture."*

---

## Master Checklist

**Phase 0 — Project Setup**
- [ ] M0.1 Monorepo skeleton
- [ ] M0.2 Backend project init
- [ ] M0.3 Frontend project init
- [ ] M0.4 Env config files
- [ ] M0.5 Lint/format config
- [ ] M0.6 Docker Compose skeleton

**Phase 1 — Backend Foundation**
- [ ] M1.1 Express server bootstrap
- [ ] M1.2 Core middleware
- [ ] M1.3 Structured logging
- [ ] M1.4 Env validation module
- [ ] M1.5 Route folder scaffolding

**Phase 2 — Frontend Foundation**
- [ ] M2.1 App shell + routing
- [ ] M2.2 API client wrapper
- [ ] M2.3 Design tokens / theme
- [ ] M2.4 Auth pages skeleton
- [ ] M2.5 Dashboard skeleton

**Phase 3 — Database**
- [ ] M3.1 Postgres connection module
- [ ] M3.2 Migration tooling init
- [ ] M3.3 Users + credentials tables
- [ ] M3.4 Sessions + refresh tokens table
- [ ] M3.5 Approval policy tables
- [ ] M3.6 Approval requests + votes tables
- [ ] M3.7 Audit log table
- [ ] M3.8 Seed script

**Phase 4 — Authentication**
- [ ] M4.1 WebAuthn registration options
- [ ] M4.2 WebAuthn registration verify
- [ ] M4.3 Frontend passkey registration wiring
- [ ] M4.4 WebAuthn login options
- [ ] M4.5 WebAuthn login verify + session issuance
- [ ] M4.6 Frontend passkey login wiring
- [ ] M4.7 TOTP registration + verify
- [ ] M4.8 Refresh token rotation
- [ ] M4.9 Auth middleware

**Phase 5 — Approval Engine**
- [ ] M5.1 Approval policy CRUD
- [ ] M5.2 Approval request creation
- [ ] M5.3 Quorum evaluation logic
- [ ] M5.4 Vote submission endpoint
- [ ] M5.5 Delegation logic
- [ ] M5.6 Escalation timer
- [ ] M5.7 Break-glass emergency access

**Phase 6 — Ledger & Cryptographic Receipts**
- [ ] M6.1 Approver keypair generation
- [ ] M6.2 Signing service
- [ ] M6.3 Wire signing into vote submission
- [ ] M6.4 Hash-chained audit log writer
- [ ] M6.5 Wire audit logging into auth + approval events
- [ ] M6.6 Independent chain verifier
- [ ] M6.7 Receipt lookup endpoint

**Phase 7 — Risk Engine**
- [ ] M7.1 Device/session fingerprint capture
- [ ] M7.2 Risk scoring heuristic
- [ ] M7.3 Step-up wiring
- [ ] M7.4 Explainability log

**Phase 8 — Demo Features**
- [ ] M8.1 Number-matching push simulation
- [ ] M8.2 Attack-mode: MFA fatigue simulation
- [ ] M8.3 Attack-mode: replay attack simulation
- [ ] M8.4 Dispute-resolution demo screen
- [ ] M8.5 Phishing-clone demo page

**Phase 9 — Testing**
- [ ] M9.1 Unit tests: quorum evaluation
- [ ] M9.2 Unit tests: signing/verification
- [ ] M9.3 Integration test: full login flow
- [ ] M9.4 Integration test: approval + dispute flow
- [ ] M9.5 Load/rate-limit smoke test

**Phase 10 — Deployment**
- [ ] M10.1 Full Docker Compose
- [ ] M10.2 Secrets finalization
- [ ] M10.3 One-command startup script
- [ ] M10.4 Post-deploy smoke test

**Phase 11 — Presentation Assets**
- [ ] M11.1 README finalization
- [ ] M11.2 Demo script document
- [ ] M11.3 Slide deck outline
- [ ] M11.4 Judge Q&A prep doc

**Total: 58 milestones, each independently completable in ≤10 minutes by an IDE agent.**
