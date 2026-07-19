# TrustLine

TrustLine is a full-stack security demonstration for passwordless authentication, adaptive MFA, high-value approval workflows, and verifiable audit evidence.

## Project overview

### Problem

Organizations need to reduce phishing risk at sign-in, apply additional verification when context changes, and retain credible evidence for sensitive decisions. Password-only login and ordinary audit logs do not provide enough assurance for these workflows.

### Solution

TrustLine combines WebAuthn passkeys, risk-triggered TOTP, multi-party approval policies, cryptographic receipts, and a hash-linked audit trail in one inspectable application.

## Features

- **Passkey authentication:** passwordless WebAuthn registration and sign-in.
- **TOTP MFA:** standards-based time-based one-time passwords for step-up verification.
- **Adaptive Trust Engine:** evaluates login context and requests step-up MFA for elevated risk.
- **Multi-party approval workflow:** configurable approval policies, requests, votes, quorum evaluation, delegation, escalation, and break-glass handling.
- **Cryptographic receipts:** Ed25519-signed approval evidence with inspectable public-key material.
- **Tamper-evident audit chain:** SHA-256-linked audit entries with a chain-verification script.
- **Dispute resolution:** receipt and audit views for reviewing a resolved approval.
- **Attack simulation:** labelled demonstrations of MFA-fatigue, replay, and phishing-resistance scenarios.

## Technology stack

| Library / framework | Purpose | Why it was chosen |
| --- | --- | --- |
| React | Frontend UI | Component-based interface for the authentication and approval flows. |
| React Router | Client-side routing | Clear routes for product and demo screens. |
| Vite | Frontend build tool | Fast local development and production builds. |
| TypeScript | Type safety | Safer contracts across frontend and backend. |
| Tailwind CSS | UI styling | Consistent, responsive utility-based styling. |
| Express | Backend API | Small, explicit HTTP API and middleware model. |
| PostgreSQL | Persistent storage | Relational integrity for users, sessions, approvals, and audit records. |
| `pg` | PostgreSQL client | Direct, typed database access from Node.js. |
| node-pg-migrate | Database migrations | Repeatable schema setup for local and Docker environments. |
| SimpleWebAuthn | FIDO2/WebAuthn passkeys | Maintained browser and server implementations of WebAuthn ceremonies. |
| jsonwebtoken | Access tokens | Signed, short-lived JWT access tokens. |
| Node.js `crypto` | Cryptography | Built-in CSPRNG, Ed25519 signatures, AES-GCM encryption, HMAC, and SHA-256. |
| QRCode | TOTP enrollment QR codes | Renders the standard `otpauth://` enrollment URI. |
| dotenv | Environment configuration | Loads local backend configuration safely. |
| cors | Cross-origin controls | Restricts browser API access to configured frontend origins. |
| Pino / pino-http | Structured logging | Request-aware logs for local diagnostics. |
| Vitest / Supertest | Testing | Fast service and API integration testing. |
| Docker Compose | Local deployment | Reproducible PostgreSQL, backend, and frontend stack. |

## Authentication

Passkeys provide passwordless authentication through WebAuthn. The private key remains in the user’s authenticator, while TrustLine verifies the public-key response for the legitimate site origin.

TOTP MFA is compatible with standard authenticator applications such as Microsoft Authenticator and Google Authenticator. TrustLine intentionally uses industry-standard authenticator applications for TOTP because they are secure, interoperable, and familiar to enterprise users.

## Architecture

```text
React frontend
      ↓
Express backend API
      ↓
PostgreSQL database
      ↓
SHA-256 audit chain and cryptographic receipts
```

The frontend conducts WebAuthn and TOTP user interactions. The backend enforces authentication, risk evaluation, approvals, signatures, and receipt creation. PostgreSQL stores application state, while the audit chain links security-relevant events for later verification.

## Run the demo

Prerequisites: Node.js 20+, Docker Desktop with Docker Compose, and a WebAuthn-capable browser.

```bash
git clone https://github.com/Kushh-Santhosh/TRUSTLINE.git
cd TRUSTLINE
cp backend/.env.example backend/.env
# Set JWT_SECRET in backend/.env
./start-demo.sh --build
```

The launcher starts the stack, applies migrations, and seeds demo data.

- Frontend: `http://localhost:5173`
- API health: `http://localhost:4000/health`
- Dispute demo: `http://localhost:5173/demo/dispute`
- Attack simulation: `http://localhost:5173/demo/attack`
- Phishing-resistance demo: `http://localhost:5173/demo/phishing-clone`

For local development without Dockerized application services, run the backend and frontend in separate terminals after starting PostgreSQL:

```bash
cd backend && npm install && npm run migrate:up && npm run dev
cd frontend && npm install && npm run dev
```

## Verification

```bash
cd backend && npm run build && npm test
cd frontend && npm run build && npm run lint
```

Audit-chain verification is available with `cd backend && npm run verify-chain` after the database is running.

## Repository guide

- [Authentication flow](AUTH_FLOW.md)
- [Project architecture](PROJECT_ARCHITECTURE.md)
- [Judge demo script](docs/demo-script.md)
- [Production-gap analysis](PRODUCTION_GAP_ANALYSIS.md)

## Future scope

- Hardware security modules and cloud KMS
- Push-based MFA
- Risk-based continuous authentication
- AI-powered anomaly detection
- Organization management
- Role-based access control
- Multi-region deployment
- SIEM integration
- Mobile applications
- Enterprise SSO with SAML/OIDC
- Hardware security keys
- Compliance dashboards
- Live risk analytics

## License

No license has been specified.
