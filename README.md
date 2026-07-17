# TrustLine

**High-assurance authentication and approval platform** — phishing-resistant passkey login, cryptographic quorum approvals, and a tamper-evident hash-chained audit ledger built for a 24-hour hackathon.

[![Tests](https://img.shields.io/badge/tests-75%20passing-brightgreen)](backend/src/tests)
[![Stack](https://img.shields.io/badge/stack-Node%20%7C%20React%20%7C%20Postgres-blue)](docker-compose.yml)

---

## Why TrustLine

Most auth demos stop at "a user logged in." TrustLine answers three harder questions that judges actually care about:

| Scenario | TrustLine's answer |
|---|---|
| **Attacker intercepts credentials** | WebAuthn passkeys — credentials never leave the device, nothing to steal |
| **Infrastructure fails at 3 a.m.** | Quorum policy: approval still resolves via escalation chain even if one approver is unavailable |
| **"He said / she said" dispute** | Every vote is Ed25519-signed over `{requestId, decision, timestamp}` — the signed receipt is the proof |

---

## Architecture

```
┌─ Browser ──────────────────────────────────────────────────────────┐
│  React + Vite SPA (port 5173)                                      │
│                                                                    │
│  /login  /register  /dashboard  /demo/attack                       │
│  /demo/dispute  /demo/phishing-clone                               │
└───────────────────────┬────────────────────────────────────────────┘
                        │ HTTPS / JSON (VITE_API_URL)
┌─ Express API ─────────▼────────────────────────────────────────────┐
│  Node 20 / TypeScript (port 4000)                                  │
│                                                                    │
│  ┌─ Auth ─────────────────────────────────────────────────────┐   │
│  │  WebAuthn (passkeys)  →  requireAuth (JWT HS256)           │   │
│  │  TOTP step-up  ←  Risk engine (new device / time anomaly)  │   │
│  │  Refresh-token rotation + reuse detection (PostgreSQL)     │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌─ Approval engine ──────────────────────────────────────────┐   │
│  │  Policy CRUD  →  quorum evaluation (N-of-M, single_senior) │   │
│  │  Ed25519 vote signing (per-approver keypair in DB)         │   │
│  │  Delegation  +  break-glass escalation                    │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌─ Audit ledger ─────────────────────────────────────────────┐   │
│  │  Hash-chained audit entries (SHA-256 prev_hash → this_hash)│   │
│  │  Cryptographic receipt: signed votes + full chain          │   │
│  │  verify-chain script detects any tampering                 │   │
│  └────────────────────────────────────────────────────────────┘   │
└─────────────────────┬──────────────────────────────────────────────┘
                      │
              ┌───────▼──────────────────────┐
              │  PostgreSQL  (port 5432)      │
              │  Users, credentials, refresh  │
              │  tokens, policies, votes,     │
              │  audit log, signing keys      │
              └──────────────────────────────┘
```

> **Note on Redis:** Redis is included in `docker-compose.yml` for future use (e.g. distributed rate limiting). It is not currently used by the application server.

### Key design decisions

- **Non-repudiation via Ed25519** — every vote is signed server-side with the approver's stored keypair (AES-256-GCM encrypted at rest, key derived from `JWT_SECRET`). A dispute requires producing the signed receipt; no receipt = no approval.
- **Risk-based step-up** — login risk is scored on new device / unusual hour / geo anomaly. Score ≥ medium forces TOTP before a session is issued.
- **Refresh-token family invalidation** — token reuse detection: presenting an already-rotated token kills the entire family, not just the one session. All tokens are stored hashed (SHA-256) in PostgreSQL.
- **Hash-chained ledger** — each audit entry stores `this_hash = SHA-256(prev_hash + entry)`. The `verify-chain` script detects any row-level tampering.

---

## Demo scenarios

| Scenario | Route | What it shows |
|---|---|---|
| **Normal login** | `/login` | Passkey + optional TOTP step-up after risk scoring |
| **Register passkey** | `/register` | WebAuthn enrollment + TOTP setup flow |
| **Dashboard** | `/dashboard` | Active sessions, pending approvals, audit log, demo request creator |
| **Dispute resolution** | `/demo/dispute` | Pulls a signed receipt; verify Ed25519 signatures + hash chain live |
| **MFA fatigue / step-up attack** | `/demo/attack` | Rate-limiter blocks after 3 step-up attempts in 60 s |
| **Phishing clone** | `/demo/phishing-clone` | Side-by-side comparison of real vs. phishing login page |

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| **Docker Desktop** | ≥ 4.x (includes Compose v2) | [docker.com](https://www.docker.com/products/docker-desktop/) |
| **Node.js** *(local dev only)* | ≥ 20 LTS | [nodejs.org](https://nodejs.org) |
| **Git** | any | — |

---

## Quick start (Docker — recommended)

```bash
# 1. Clone
git clone https://github.com/DevOps-Tally/Fensta.git trustline
cd trustline

# 2. Create local environment file
cp backend/.env.example .env
# Edit .env — set JWT_SECRET to a unique random value:
#   node -e "const c=require('crypto'); console.log('JWT_SECRET='+c.randomBytes(64).toString('hex'))"

# 3. Start the full stack (builds images, migrates, seeds, then prints URLs)
./start-demo.sh
```

That's it. After ~60 seconds on first run:

```
  ✅  TrustLine is ready!

  Frontend:      http://localhost:5173
  Backend API:   http://localhost:4000
  Health check:  http://localhost:4000/health
```

### Additional start-demo.sh flags

```bash
./start-demo.sh --build    # force rebuild Docker images (after code changes)
./start-demo.sh --reset    # wipe all data and start fresh
./start-demo.sh --help     # show usage
```

---

## Manual setup (local dev, no Docker)

### 1. Start infrastructure

```bash
# PostgreSQL + Redis via Docker (infrastructure only)
docker compose up -d postgres redis
```

### 2. Backend

```bash
cd backend
cp .env.example .env         # fill in JWT_SECRET etc.
npm install
npm run migrate:up           # apply all DB migrations
npm run seed                 # insert demo users + policy
npm run dev                  # starts on port 4000 with hot-reload
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                  # starts on port 5173 with HMR
```

---

## Environment variables

All variables are documented in [`backend/.env.example`](backend/.env.example).

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | — | Signs access tokens + encrypts approver private keys at rest |
| `JWT_REFRESH_SECRET` | ☐ | — | Reserved; not currently read by the server |
| `PORT` | ☐ | `4000` | Backend listen port |
| `FRONTEND_ORIGIN` | ☐ | `http://localhost:5173` | CORS allow-origin |
| `WEBAUTHN_RP_ID` | ☐ | `localhost` | Must match the frontend domain |
| `LOG_LEVEL` | ☐ | `info` | Pino log level |

**Frontend** only needs `VITE_API_URL` (default: `http://localhost:4000`), baked into the bundle at build time.

> **Security note:** generate a strong secret with:
> ```bash
> node -e "console.log('JWT_SECRET='+require('crypto').randomBytes(64).toString('hex'))"
> ```

---

## API reference

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | — | Liveness check → `{ status: "ok", db: "ok" }` |
| `POST` | `/api/auth/register/options` | — | Begin WebAuthn registration |
| `POST` | `/api/auth/register/verify` | — | Complete WebAuthn registration → `{ verified, userId }` |
| `POST` | `/api/auth/totp/setup` | — | Generate TOTP secret + QR URI for enrollment |
| `POST` | `/api/auth/totp/verify` | — | Confirm TOTP code to complete enrollment |
| `POST` | `/api/auth/login/options` | — | Begin WebAuthn login |
| `POST` | `/api/auth/login/verify` | — | Complete login; may return `{ stepUpRequired, pendingToken }` |
| `POST` | `/api/auth/login/step-up` | — | Verify TOTP; issues full session tokens |
| `POST` | `/api/auth/refresh` | — | Rotate refresh token → new access + refresh token pair |
| `GET` | `/api/auth/sessions` | ✅ | List active sessions for the current user |
| `DELETE` | `/api/auth/sessions/:familyId` | ✅ | Revoke a specific session family |
| `GET` | `/api/auth/audit` | ✅ | Recent audit log entries for the current user |

### Approvals

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/approval/policies` | ✅ | List all approval policies |
| `POST` | `/api/approval/policies` | ✅ | Create a policy |
| `GET` | `/api/approval/policies/:id` | ✅ | Get a single policy |
| `POST` | `/api/approval/requests` | ✅ | Submit an approval request |
| `GET` | `/api/approval/requests` | ✅ | List resolved requests (dispute feed) |
| `GET` | `/api/approval/requests/pending` | ✅ | List all pending requests |
| `POST` | `/api/approval/requests/:id/votes` | ✅ | Cast a signed vote (approve / deny) |
| `POST` | `/api/approval/requests/:id/break-glass` | ✅ | Force-approve with mandatory post-hoc audit |
| `POST` | `/api/approval/delegations` | ✅ | Create a vote delegation |

### Ledger

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/ledger/receipt/:id` | ✅ | Fetch cryptographic receipt: signed votes + audit chain |

---

## Testing

```bash
cd backend

# Run all 75 tests (unit + integration)
npm test

# Watch mode
npm run test:watch

# Post-deploy smoke test (requires running backend)
npm run smoke-test

# Rate-limit load test (requires running backend)
npm run load-test

# Verify audit chain integrity (requires running DB)
npm run verify-chain
```

### Test breakdown

| Suite | File | Tests | What it covers |
|---|---|---|---|
| Quorum evaluation | `src/services/quorum.service.test.ts` | 19 | N-of-M, single_senior, rejection, edge cases |
| Signing / verification | `src/services/signing.service.test.ts` | 18 | Ed25519 sign, verify, tamper detection |
| Auth integration | `src/tests/auth.integration.test.ts` | 12 | Full login flow via real Express routes (services mocked) |
| Rate-limit smoke | `src/tests/rateLimit.test.ts` | 10 | Step-up rate limiter, 429 at attempt 4 |
| Approval integration | `src/tests/approval.integration.test.ts` | 16 | Policy, votes, quorum, receipt, signatures |
| **Total** | | **75** | |

---

## Docker reference

```bash
# Start full stack
docker compose up --build

# Run migrations inside container
docker compose exec backend npm run migrate:up

# Seed demo data
docker compose exec backend npm run seed

# Post-deploy smoke test
docker compose exec backend npm run smoke-test

# Stream logs
docker compose logs -f backend

# Stop (preserves data)
docker compose down

# Stop and wipe all data
docker compose down --volumes
```

---

## Project structure

```
trustline/
├── start-demo.sh              # one-command demo launcher
├── docker-compose.yml         # postgres · redis · backend · frontend
├── backend/
│   ├── Dockerfile             # multi-stage Node 20 build
│   ├── migrations/            # node-pg-migrate migrations (11 migrations)
│   ├── vitest.config.ts
│   └── src/
│       ├── app.ts             # Express app setup
│       ├── index.ts           # server entry point
│       ├── routes/
│       │   ├── auth.routes.ts
│       │   ├── approval.routes.ts
│       │   ├── ledger.routes.ts
│       │   └── risk.routes.ts
│       ├── services/
│       │   ├── webauthn.service.ts
│       │   ├── session.service.ts
│       │   ├── totp.service.ts
│       │   ├── risk.service.ts
│       │   ├── policy.service.ts
│       │   ├── request.service.ts
│       │   ├── quorum.service.ts
│       │   ├── signing.service.ts
│       │   ├── keys.service.ts
│       │   ├── audit.service.ts
│       │   ├── delegation.service.ts
│       │   ├── quorum.service.test.ts
│       │   └── signing.service.test.ts
│       ├── middleware/
│       │   └── requireAuth.ts
│       ├── jobs/
│       │   └── escalation.job.ts
│       ├── lib/
│       │   ├── config.ts
│       │   └── logger.ts
│       ├── db/
│       │   └── pool.ts
│       ├── scripts/
│       │   ├── seed.ts
│       │   ├── smokeTest.ts
│       │   ├── loadTest.ts
│       │   └── verifyChain.ts
│       └── tests/
│           ├── auth.integration.test.ts
│           ├── approval.integration.test.ts
│           └── rateLimit.test.ts
└── frontend/
    ├── Dockerfile             # Vite build → nginx:alpine
    ├── nginx.conf             # SPA routing + API proxy
    ├── tailwind.config.js
    └── src/
        ├── App.tsx
        ├── pages/
        │   ├── LoginPage.tsx
        │   ├── RegisterPage.tsx
        │   ├── DashboardPage.tsx
        │   ├── AttackDemoPage.tsx
        │   ├── DisputeDemoPage.tsx
        │   └── PhishingCloneDemoPage.tsx
        └── lib/
            ├── apiClient.ts
            └── auth.ts
```

---

## Security properties

| Property | Mechanism |
|---|---|
| Phishing resistance | WebAuthn origin-binding — credentials only work on the registered domain |
| Credential theft protection | Private keys never leave the authenticator device |
| MFA fatigue mitigation | Step-up rate-limit: 429 after 3 attempts per user in 60 s |
| Session reuse detection | Refresh-token family invalidation — presenting a rotated token revokes the whole family |
| Non-repudiation | Ed25519 vote signatures over `{requestId, decision, timestamp}` |
| Audit integrity | SHA-256 hash chain; `verify-chain` script detects any tampering |
| Secret at rest | Approver private keys encrypted AES-256-GCM, key derived from `JWT_SECRET` |

---

## Hackathon context

Built at **Tally hackathon** as a demonstration of high-assurance authentication and approval engineering. The goal was to answer the brief's three hardest scenarios — attacker, infrastructure failure, and post-hoc dispute — with working, verifiable code rather than slides.

See [`implementation-playbook.md`](implementation-playbook.md) for the full milestone-by-milestone build plan, and [`auth-platform-design_1.md`](auth-platform-design_1.md) for the original architecture rationale.
