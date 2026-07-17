# TrustLine

**High-assurance authentication and approval platform** — phishing-resistant passkey login, cryptographic quorum approvals, and a tamper-evident hash-chained audit ledger built for a 24-hour hackathon.

[![Tests](https://img.shields.io/badge/tests-75%20passing-brightgreen)](backend/src/tests)
[![Stack](https://img.shields.io/badge/stack-Node%20%7C%20React%20%7C%20Postgres%20%7C%20Redis-blue)](docker-compose.yml)

---

## Why TrustLine

Most auth demos stop at "a user logged in." TrustLine answers three harder questions that judges actually care about:

| Scenario | TrustLine's answer |
|---|---|
| **Attacker intercepts credentials** | WebAuthn passkeys — credentials never leave the device, nothing to steal |
| **Infrastructure fails at 3 a.m.** | Quorum policy: approval still resolves via escalation chain even if one approver is unavailable |
| **"He said / she said" dispute** | Every vote is Ed25519-signed over `{action, timestamp, approver}` — the signed receipt is the proof |

---

## Architecture

```
┌─ Browser ──────────────────────────────────────────────────────────┐
│  React + Vite SPA (port 5173)                                      │
│                                                                    │
│  LoginPage  RegisterPage  Dashboard  AttackDemoPage                │
│  DisputeDemoPage  PhishingCloneDemoPage                            │
└───────────────────────┬────────────────────────────────────────────┘
                        │ HTTPS / JSON (VITE_API_URL)
┌─ Express API ─────────▼────────────────────────────────────────────┐
│  Node 20 / TypeScript (port 4000)                                  │
│                                                                    │
│  ┌─ Auth ─────────────────────────────────────────────────────┐   │
│  │  WebAuthn (passkeys)  →  requireAuth (JWT RS256)           │   │
│  │  TOTP step-up  ←  Risk engine (new device / geo / time)   │   │
│  │  Refresh-token rotation + reuse detection                  │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌─ Approval engine ──────────────────────────────────────────┐   │
│  │  Policy CRUD  →  quorum evaluation (N-of-M, unanimous …)  │   │
│  │  Ed25519 vote signing (per-approver keypair in DB)         │   │
│  │  Delegation  +  break-glass escalation                    │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌─ Audit ledger ─────────────────────────────────────────────┐   │
│  │  Hash-chained audit entries (SHA-256 prev_hash → this_hash)│   │
│  │  Cryptographic receipt: signed votes + full chain          │   │
│  │  Verify-chain script detects any tampering                 │   │
│  └────────────────────────────────────────────────────────────┘   │
└─────────────────────┬──────────────────┬───────────────────────────┘
                      │                  │
              ┌───────▼──────┐   ┌───────▼───────┐
              │  PostgreSQL  │   │     Redis      │
              │  (port 5432) │   │  (port 6379)   │
              │  Users,keys  │   │  Refresh-token │
              │  policies,   │   │  family store  │
              │  votes,audit │   └───────────────┘
              └──────────────┘
```

### Key design decisions

- **Non-repudiation via Ed25519** — every vote is signed server-side with the approver's stored keypair (AES-256-GCM encrypted at rest, key derived from `JWT_SECRET`). A dispute requires producing the signed receipt; no receipt = no approval.
- **Risk-based step-up** — login risk is scored on new device / unusual hour / geo anomaly. Score ≥ medium forces TOTP before a session is issued.
- **Refresh-token family invalidation** — token reuse detection: presenting an already-rotated token kills the entire family, not just the one session.
- **Hash-chained ledger** — each audit entry stores `this_hash = SHA-256(prev_hash + entry)`. The `verify-chain` script detects any row-level tampering.

---

## Demo scenarios

| Scenario | Route | What it shows |
|---|---|---|
| **Normal login** | `/login` | Passkey + optional TOTP step-up |
| **Dispute resolution** | `/demo/dispute` | Pulls a signed receipt; verify signatures live |
| **MFA fatigue attack** | `/demo/mfa-fatigue` | Rate-limiter blocks after 3 step-up attempts in 60 s |
| **Replay attack** | `/demo/replay` | Reused authentication artifact is detected and rejected |
| **Phishing-clone** | `/demo/phishing` | Side-by-side comparison of real vs. phishing login |

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
# Edit .env — set JWT_SECRET and JWT_REFRESH_SECRET to unique random values:
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
| `REDIS_URL` | ✅ | — | Redis connection string |
| `JWT_SECRET` | ✅ | — | Signs access tokens + encrypts private keys |
| `JWT_REFRESH_SECRET` | ✅ | — | Signs refresh tokens |
| `PORT` | ☐ | `4000` | Backend listen port |
| `FRONTEND_ORIGIN` | ☐ | `http://localhost:5173` | CORS allow-origin |
| `WEBAUTHN_RP_ID` | ☐ | `localhost` | Must match the frontend domain |
| `LOG_LEVEL` | ☐ | `info` | Pino log level |

**Frontend** only needs `VITE_API_URL` (default: `http://localhost:4000`), baked into the bundle at build time.

> **Security note:** generate secrets with:
> ```bash
> node -e "const c=require('crypto'); \
>   console.log('JWT_SECRET='+c.randomBytes(64).toString('hex')); \
>   console.log('JWT_REFRESH_SECRET='+c.randomBytes(64).toString('hex'));"
> ```

---

## API reference

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | — | Liveness check → `{ status: "ok" }` |
| `POST` | `/api/auth/register/options` | — | Begin WebAuthn registration |
| `POST` | `/api/auth/register/verify` | — | Complete WebAuthn registration |
| `POST` | `/api/auth/login/options` | — | Begin WebAuthn login |
| `POST` | `/api/auth/login/verify` | — | Complete login; may return step-up token |
| `POST` | `/api/auth/login/step-up` | — | Verify TOTP; issues full session |
| `POST` | `/api/auth/refresh` | — | Rotate refresh token |
| `POST` | `/api/auth/logout` | ✅ | Revoke session |
| `GET` | `/api/approval/policies` | ✅ | List approval policies |
| `POST` | `/api/approval/policies` | ✅ | Create policy |
| `POST` | `/api/approval/requests` | ✅ | Submit approval request |
| `POST` | `/api/approval/requests/:id/votes` | ✅ | Cast signed vote |
| `GET` | `/api/approval/requests` | ✅ | List resolved requests (dispute feed) |
| `GET` | `/api/ledger/receipt/:id` | ✅ | Fetch signed receipt + audit chain |

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
| Quorum evaluation | `quorum.service.test.ts` | 19 | N-of-M, unanimous, rejection, edge cases |
| Signing / verification | `signing.service.test.ts` | 18 | Ed25519 sign, verify, tamper detection |
| Auth integration | `auth.integration.test.ts` | 12 | Full login flow via real Express routes |
| Rate-limit smoke | `rateLimit.test.ts` | 10 | Step-up rate limiter, 429 at attempt 4 |
| Approval integration | `approval.integration.test.ts` | 16 | Policy, votes, quorum, receipt, signatures |
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
├── start-demo.sh              # one-command demo launcher (M10.3)
├── docker-compose.yml         # postgres · redis · backend · frontend
├── backend/
│   ├── Dockerfile             # multi-stage Node 20 build
│   ├── migrations/            # node-pg-migrate SQL migrations (M0.x–M7.x)
│   └── src/
│       ├── routes/            # Express route handlers
│       │   ├── auth.routes.ts
│       │   ├── approval.routes.ts
│       │   ├── ledger.routes.ts
│       │   └── risk.routes.ts
│       ├── services/          # business logic
│       │   ├── webauthn.service.ts
│       │   ├── session.service.ts
│       │   ├── risk.service.ts
│       │   ├── policy.service.ts
│       │   ├── request.service.ts
│       │   ├── signing.service.ts
│       │   ├── keys.service.ts
│       │   ├── audit.service.ts
│       │   ├── totp.service.ts
│       │   └── quorum.service.ts
│       ├── scripts/
│       │   ├── seed.ts        # demo data (alice, bob, carol + policy)
│       │   ├── smokeTest.ts   # post-deploy health verification (M10.4)
│       │   ├── loadTest.ts    # rate-limit load test (M9.5)
│       │   └── verifyChain.ts # audit chain integrity check
│       └── tests/
│           ├── auth.integration.test.ts
│           ├── approval.integration.test.ts
│           └── rateLimit.test.ts
└── frontend/
    ├── Dockerfile             # Vite build → nginx:alpine
    ├── nginx.conf             # SPA routing
    └── src/
        ├── pages/
        │   ├── LoginPage.tsx
        │   ├── RegisterPage.tsx
        │   ├── DashboardPage.tsx
        │   ├── AttackDemoPage.tsx
        │   ├── DisputeDemoPage.tsx
        │   └── PhishingCloneDemoPage.tsx
        └── lib/
            └── apiClient.ts
```

---

## Security properties

| Property | Mechanism |
|---|---|
| Phishing resistance | WebAuthn origin-binding — credentials only work on the registered domain |
| Credential theft protection | Private keys never leave the authenticator device |
| MFA fatigue mitigation | Step-up rate-limit: 429 after 3 attempts per user in 60 s |
| Replay protection | Refresh-token family invalidation; demo replay detection |
| Non-repudiation | Ed25519 vote signatures over `{requestId, decision, timestamp}` |
| Audit integrity | SHA-256 hash chain; `verify-chain` script detects any tampering |
| Secret at rest | Approver private keys encrypted AES-256-GCM, key derived from `JWT_SECRET` |

---

## Hackathon context

Built at **Tally hackathon** as a demonstration of high-assurance authentication and approval engineering. The goal was to answer the brief's three hardest scenarios — attacker, infrastructure failure, and post-hoc dispute — with working, verifiable code rather than slides.

See [`implementation-playbook.md`](implementation-playbook.md) for the full milestone-by-milestone build plan, and [`auth-platform-design_1.md`](auth-platform-design_1.md) for the original architecture rationale.
