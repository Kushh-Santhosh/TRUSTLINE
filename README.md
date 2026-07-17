# TrustLine

TrustLine is a high-assurance authentication and approval platform. It combines phishing-resistant passkeys, risk-aware step-up checks, signed approval decisions, and a tamper-evident audit trail in a focused demonstration application.

## Features

- **Passkey authentication** — WebAuthn registration and sign-in without passwords.
- **Adaptive risk engine** — risk-aware authentication with TOTP step-up when required.
- **Multi-step approvals** — policy-driven quorum approvals, delegation, escalation, and break-glass support.
- **Ed25519 signatures** — approval decisions are cryptographically signed for non-repudiation.
- **Immutable audit ledger** — SHA-256 hash-linked audit records make tampering detectable.
- **Dispute and receipts** — resolved requests expose signed votes and their associated audit evidence.
- **Security demonstrations** — MFA-fatigue, refresh-token replay, phishing-clone, and number-matching push simulations.

## Frontend

The React frontend uses a shared, enterprise-grade design system with consistent typography, surfaces, semantic states, responsive layouts, keyboard focus treatment, and accessible feedback states. The dashboard, approval workflow, dispute receipt view, and security demonstrations all use the same information-first visual language.

<!-- Screenshots: add Dashboard, Dispute Receipt, and Security Demonstrations captures here when available. -->

## Architecture

```text
React + Vite SPA
        │ HTTPS / JSON
Express + TypeScript API
 ├─ WebAuthn, sessions, TOTP, and risk scoring
 ├─ Approval policies, quorum evaluation, and Ed25519 signing
 └─ Hash-chained audit ledger and receipt retrieval
        │
PostgreSQL
```

## Tech stack

| Layer | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| Security | WebAuthn, TOTP, JWT, Ed25519, SHA-256 |
| Data | PostgreSQL |
| Tooling | Docker Compose, Vitest, ESLint/Oxlint |

## Quick start

### Docker (recommended)

```bash
git clone https://github.com/Kushh-Santhosh/TRUSTLINE.git trustline
cd trustline
cp backend/.env.example .env
# Set a unique JWT_SECRET in .env
./start-demo.sh
```

The application is then available at:

- Frontend: `http://localhost:5173`
- API: `http://localhost:4000`
- Health check: `http://localhost:4000/health`

### Local development

```bash
# Infrastructure
docker compose up -d postgres redis

# Terminal 1 — API
cd backend
cp .env.example .env
npm install
npm run migrate:up
npm run seed
npm run dev

# Terminal 2 — frontend
cd frontend
npm install
npm run dev
```

`VITE_API_URL` defaults to `http://localhost:4000`. Backend environment variables are documented in [`backend/.env.example`](backend/.env.example).

## Useful commands

```bash
# Frontend quality checks
cd frontend
npm run lint
npm run build

# Backend tests and audit verification
cd ../backend
npm test
npm run verify-chain
```

## Demo routes

| Route | Purpose |
|---|---|
| `/login` | Passkey authentication and risk-based step-up |
| `/register` | Passkey enrollment and TOTP setup |
| `/dashboard` | Sessions, approvals, activity, and workflow demo |
| `/demo/dispute` | Signed receipt and audit-ledger evidence |
| `/demo/attack` | MFA-fatigue and refresh-token replay simulations |
| `/demo/phishing-clone` | Origin-bound passkey phishing-resistance demonstration |

## Security properties

| Property | Mechanism |
|---|---|
| Phishing resistance | WebAuthn origin binding |
| Step-up protection | Risk scoring and TOTP verification |
| Approval accountability | Ed25519-signed decisions |
| Refresh-token reuse detection | Session-family invalidation |
| Audit integrity | SHA-256 hash chain and verification script |

Built for the Tally hackathon as a demonstration of high-assurance authentication and approval engineering.
