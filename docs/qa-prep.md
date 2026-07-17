# TrustLine — Judge Q&A Preparation

> Anticipated questions with 2–4 sentence answers grounded in the implemented system.
> Organised by theme. Review before the demo — have the terminal ready to show code.

---

## Category 1 — Authentication & passkeys

**Q: What happens if the network fails mid-login?**
WebAuthn credential creation and assertion happen entirely on the client device — the cryptographic challenge/response exchange is local. If the network drops after the browser completes the passkey assertion but before the server responds, the user simply retries the login flow; no credential is lost because the passkey is stored on the device, not the server. For the TOTP step-up, the one-time code is generated offline using only a shared secret already stored on the authenticator app — it works without any network connectivity at all.

---

**Q: Passkeys are hardware-bound — what happens when a user loses their device?**
The passkey is bound to the authenticator (device or platform credential store), so a lost device means lost access — that is a deliberate security property, not a bug. Recovery flows are out of scope for this hackathon build, but the correct path is a pre-registered backup authenticator (FIDO2 allows multiple credentials per account) combined with an identity-verified recovery ceremony that itself produces a signed audit entry. We deliberately didn't bolt on an insecure "reset by email" escape hatch, which would undermine the phishing-resistance of the entire system.

---

**Q: What's the difference between your passkey implementation and just using Auth0 or Supabase?**
Third-party auth providers typically abstract the WebAuthn ceremony behind their own servers, so credential verification happens at the provider, not at your origin — you're trusting their non-repudiation, not your own. TrustLine runs the full `@simplewebauthn/server` ceremony on its own Express instance, so the challenge/response, the credential storage, and the session issuance are all under our control and audited in our own hash-chained ledger. There's no third-party holding session state that could be breached or experience downtime.

---

**Q: Why TOTP and not push notifications or email for step-up?**
Push notifications require a reachable notification service — that fails the hotel-Wi-Fi scenario the brief hints at. Email has asynchronous delivery, introduces a dependency on an email provider, and inherits whatever compromise risk exists on the user's inbox. TOTP generates codes offline using only a shared secret already stored in the authenticator app; it works in airplane mode and has no external dependency at all. We explicitly didn't use SMS, which the brief calls out as weaker due to SIM-swap risk.

---

**Q: How does risk scoring decide when to require step-up?**
`risk.service.ts` computes a score on every `login/verify` request using signals available at login time: new device fingerprint (user-agent + accept-language hash), time-of-day anomaly (outside normal 8 a.m.–10 p.m. window), and previously unseen IP subnet. A score of `medium` or higher forces TOTP before a full session is issued; `low` issues a session directly. The thresholds are conservative for a hackathon; in production they would be tuned against real login telemetry. The key point is that the scoring is **deterministic and explainable** — no black-box model, no false-positive mystery.

---

## Category 2 — Approval engine & quorum

**Q: What if all the approvers are unavailable — does the approval just stall forever?**
No — the policy object includes an `escalation_timeout_seconds` field and an `escalation_to` target (e.g. `{ role: 'admin' }`). When the timeout elapses, the request escalates to the fallback role rather than silently expiring. There is also a `break_glass` endpoint that allows a single senior approver to unilaterally resolve an urgent request — but this fires real-time notifications to all other approvers and sets a `break_glass: true` flag on the request that is visible in the audit trail, so it cannot be used silently. You can never get a silent approval by approver absence.

---

**Q: How does quorum evaluation actually work — N-of-M only?**
The `quorum.service.ts` supports `n_of_m` (any N out of M eligible approvers), `unanimous` (every eligible approver must vote before quorum resolves), and `threshold` (a numeric percentage, e.g. 60%). After each vote, `evaluateQuorum` counts approve/deny decisions against the policy snapshot attached to the request at creation time — not the live policy, so a policy change mid-flight doesn't retroactively alter an in-progress request. A denial from any single approver returns `denied` immediately without waiting for the full quorum window (fail-closed by default).

---

**Q: Can an approver vote twice to game the quorum count?**
No — `submitVote` in `request.service.ts` inserts into `approval_votes` with a `(request_id, approver_id)` unique constraint enforced at the database level. A second vote from the same approver on the same request returns a constraint violation. The quorum evaluator counts distinct approver IDs, not raw vote rows, so even if somehow two rows slipped through they would count as one.

---

**Q: What is delegation and how is it audited?**
Delegation is a signed, time-boxed, scope-limited record in the `delegations` table: Approver A grants Approver B the ability to vote on their behalf until a given timestamp, limited to a specific policy or action class. The delegation itself is created via an authenticated API call and appears in the audit ledger as an explicit event — it's not a config toggle. When B votes on a delegated request, the audit entry records both B's identity and the delegation ID so the chain of authority is fully traceable.

---

## Category 3 — Non-repudiation & the audit ledger

**Q: How does the dispute resolution actually prove who approved something?**
Every vote is signed server-side using the approver's Ed25519 private key (stored AES-256-GCM encrypted, key derived from `JWT_SECRET`) over the canonical payload `{ requestId, decision, timestamp }`. The signature is stored in the `approval_votes` table alongside the approver's public key. The dispute resolution screen fetches the receipt via `GET /api/ledger/receipt/:id` and the client can verify each signature using the same `signing.service.verify()` function — no trusted intermediary required. The integration tests in `approval.integration.test.ts` do exactly this with a real keypair.

---

**Q: What if an admin just edits the database row to change a vote?**
Editing a database row would break the Ed25519 signature — you'd need the approver's private key to produce a valid signature over the modified payload, and that key is encrypted at rest. Additionally, every audit entry stores `this_hash = SHA-256(prev_hash + JSON(entry))`. Editing any row would break the chain from that point forward. Run `npm run verify-chain` from the terminal right now — it re-computes every hash and exits non-zero if anything is inconsistent.

---

**Q: Does the hash chain protect against deletion — what if someone removes a row?**
Yes. Each entry's `prev_hash` must equal the previous entry's `this_hash`. A deleted row breaks the chain at the gap — `verify-chain` will report a missing link. You cannot delete a vote and then re-link the chain without knowing all subsequent entries' content, which is computationally infeasible without also re-signing every subsequent audit entry with the original private keys.

---

## Category 4 — Architecture & technology choices

**Q: Why didn't you use a blockchain for the audit trail?**
A hash-chained SQL table gives identical tamper-evidence to a blockchain for a single-operator system: entries are append-only in practice, cryptographically linked, and verifiable offline. A real blockchain adds consensus overhead (latency, gas/fees, node infrastructure), requires either a trusted chain or a permissioned validator set that a hackathon can't meaningfully decentralise, and would have distracted from the actual security engineering. The judges' brief explicitly warns against technology-chasing; we chose the simpler, equally secure, explainable solution.

---

**Q: Why didn't you use an ML fraud model?**
ML fraud detection requires training data that doesn't exist for a 24-hour hackathon. A model trained on synthetic data would have no signal and would give judges false confidence. Our risk engine is deterministic: new device, unusual hour, unusual subnet → medium/high risk → step-up required. That rule is auditable, explainable, and testable. In production the thresholds would be refined using real login telemetry, and the risk engine interface is already structured to accept additional signals (velocity, geo-distance, impossible travel) without changing the API contract.

---

**Q: Why Node/Express instead of a framework with more batteries included (NestJS, Fastify, etc.)?**
For a 24-hour build, Express gives the fastest path from zero to a working route with full control over middleware ordering — critical when you need exact control over auth middleware placement, error handling, and request logging. The architecture doesn't need the opinions NestJS imposes; those conventions save time at scale but cost time at prototype speed. Fastify would be a reasonable alternative for production (lower overhead), but Express was the right call for hackathon velocity.

---

**Q: How does refresh-token rotation protect against session theft?**
On every `/auth/refresh`, the presented token is invalidated and a new one is issued. The `jti` (JWT ID) of the old token is stored in Redis. If a stolen token is presented after rotation — meaning an attacker captured the token and is trying to use it — the server detects the `jti` as already-invalidated and kills the **entire token family** (all sessions for that user), not just the one session. This is visible in the attack demo: the second call to `/auth/refresh` with the same token returns 401.

---

## Category 5 — Testing & reliability

**Q: How confident are you in the system's correctness — how much is tested?**
75 tests across 5 test suites, all passing. The key coverage: 19 quorum evaluation tests cover every quorum type and edge case; 18 signing tests cover Ed25519 round-trips and tamper detection; 12 auth integration tests hit the real Express routes via supertest; 10 rate-limit tests verify the step-up blocker triggers at exactly the 4th attempt; 16 approval integration tests cover the full vote lifecycle including live signature verification using `signing.service.verify()` on a real keypair. The post-deploy smoke test independently verifies the running stack after `./start-demo.sh`.

---

**Q: What's the most likely thing to break in a live demo?**
WebAuthn credential resolution — if the browser doesn't have a registered passkey for the demo user, the authenticator dialog will appear but fail. The mitigation is in the demo-script pre-checklist: register `alice@demo.com` 5 minutes before going on stage and verify login once. The backend is stateless (no in-memory session across restarts) and all other demo flows use in-memory state that resets on button click, so they're reliably reproducible.

---

## Category 6 — Product & scope

**Q: This is a hackathon — what would you do differently with 6 more months?**
Three priorities: (1) replace the server-side signing keypairs with HSM-backed keys or device-attested signing so the private key never exists in software memory; (2) add real telemetry to the risk engine — currently it uses static heuristics, but real login history would enable anomaly detection via isolation forest or similar lightweight model; (3) add delegated credential recovery — a notarised ceremony where recovery requires two-of-three recovery contacts to sign an identity assertion, producing a full audit chain. None of these change the architecture — they harden surfaces that are consciously "good enough for a demo" today.

---

**Q: Is this production-ready?**
No — and we'd say that clearly. The JWT encryption key is derived from `JWT_SECRET` via SHA-256, which is adequate for a demo but not a proper KDF for production (should use Argon2 or PBKDF2 with a salt). The risk engine uses static thresholds. There's no rate limiting on the registration endpoint. TrustLine demonstrates the **correct architecture** for a non-repudiation system — the bones are right, the production hardening is out of scope for 24 hours.

---

**Q: Could this work for a real financial institution?**
The design deliberately mirrors production patterns — Ed25519 over symmetric tokens, policy-at-request-time over booleans, hash chains over plain logs. The missing pieces (HSM key storage, compliance logging schema, SOC 2 audit controls) are well-understood engineering work, not architectural rewrites. The core insight — that non-repudiation requires signed receipts, not just access control — is the same principle used in systems like e-IDAS qualified electronic signatures and SWIFT's transaction signing requirements.
