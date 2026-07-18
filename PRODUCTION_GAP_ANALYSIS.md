# TrustLine production-readiness gap analysis

> Scope: code-derived security and architecture gaps in the current repository. This excludes visual/style concerns and does not recommend replacing standards-based WebAuthn verification. “Demo only” means the issue is confined to intentionally labelled simulations; “Both” means it affects the current demo and a production deployment built from this code.

## Executive assessment

TrustLine contains sound building blocks—SimpleWebAuthn verification, parameterized PostgreSQL queries, native RFC 6238 verification, random opaque refresh tokens, AES-GCM encrypted signing keys, Ed25519 primitives, and a serialized hash-chain append. It is **not production-ready** as an identity or approval system because the implementation has factor-enrollment authorization gaps, lacks real approval authorization/separation of duties, keeps critical runtime state in process memory, and has unanchored/fail-open evidence handling.

## Findings

### Critical

#### P-01 — TOTP enrollment can be performed for an arbitrary user ID

- **Evidence:** `backend/src/routes/auth.routes.ts` exposes `POST /api/auth/totp/setup` and `POST /api/auth/totp/verify` without `requireAuth`; both accept `userId` from the body. `services/totp.service.ts` updates `users.totp_secret` and `totp_enabled` using that ID.
- **Why this is a weakness:** Enrollment/reset of a second factor is an account-security operation. The route does not establish that the caller is the account holder or has recently completed a reauthentication ceremony.
- **Impact:** A party who obtains or guesses a valid UUID can replace the user’s TOTP secret and potentially enable a factor they control, undermining adaptive step-up and account recovery assumptions.
- **Affects:** **Both.**
- **Severity:** **Critical.**
- **Recommended solution:** Require authenticated context, derive the target user from verified session identity, require recent/step-up WebAuthn for factor replacement, add a deliberate re-enrollment lifecycle and audit event. Do not trust a client-supplied target user ID.
- **Estimated effort:** **1–2 hours** for binding and authorization; **multiple days** for a complete recovery/re-enrollment policy.

#### P-02 — Approval authorization is not implemented as an approver workflow

- **Evidence:** `services/request.service.ts` selects a votable request with `WHERE id = $1 AND requester_id = $2`, where `$2` is the authenticated voter. `approval_policies.eligible_roles` is stored but no role model or role check exists. `breakGlass` uses the same requester ownership predicate.
- **Why this is a weakness:** The current system authorizes the request creator to vote on and force-approve their own request. It does not implement independent approver assignment, separation of duties, policy ownership, or privileged emergency access.
- **Impact:** It defeats the central security property of an enterprise approval workflow; a user can create permissive policy data and self-resolve an action.
- **Affects:** **Both.**
- **Severity:** **Critical.**
- **Recommended solution:** Add an identity/role/entitlement model, policy ownership, explicit eligible reviewer resolution, separation-of-duties checks, an authorization service, and privileged break-glass governance. Enforce all of it server-side and transactionally.
- **Estimated effort:** **Multiple days.**

#### P-03 — Approval signatures are server-controlled, not user-controlled approvals

- **Evidence:** `services/signing.service.ts` decrypts a private Ed25519 key from the database and signs votes in `request.service.ts` `submitVote`. The browser does not perform a WebAuthn ceremony for an approval vote.
- **Why this is a weakness:** A server compromise or database/key-encryption-secret compromise can generate a signature attributed to a user. The signature proves that this application key signed bytes, not necessarily that a user approved at that moment.
- **Impact:** Claims of user-held signing, strong non-repudiation, or approval intent would be inaccurate in production; audit evidence has a larger trusted-computing-base than a user-bound WebAuthn assertion.
- **Affects:** **Both.**
- **Severity:** **Critical** for any non-repudiation/approval-authority claim.
- **Recommended solution:** Align product claims with the implementation immediately. For stronger approval intent, bind a fresh user-controlled ceremony to the decision (for example, WebAuthn transaction authorization where supported) and retain the verified assertion/evidence; protect server signing keys with managed key custody for any remaining server attestations.
- **Estimated effort:** **Multiple days.**

### High

#### P-04 — WebAuthn challenges are in memory, email-keyed, and have no expiry

- **Evidence:** `services/webauthn.service.ts` uses `challengeStore` and `loginChallengeStore` as `Map<string,string>`, keyed solely by email. It removes a challenge after successful verification but does not attach expiry, request ID, session binding, or durable storage.
- **Why this is a weakness:** Restart loses ceremonies; multiple tabs overwrite one another; horizontal replicas cannot reliably verify a ceremony; abandoned challenges persist until overwritten or process restart.
- **Impact:** Authentication availability and correctness fail under normal scaling/deployment behavior; concurrent ceremonies may be denied unexpectedly.
- **Affects:** **Both.**
- **Severity:** **High.**
- **Recommended solution:** Store a random ceremony ID, user binding, purpose, creation/expiry, and one-time status in a TTL-backed shared store (Redis is already provisioned) or a database; bind verification to that record and atomically consume it.
- **Estimated effort:** **Half day.**

#### P-05 — TOTP secrets are stored plaintext in PostgreSQL

- **Evidence:** migration `00006_totp_secret.js` adds `users.totp_secret text`; `generateSecretForUser` writes the Base32 secret directly.
- **Why this is a weakness:** Database readers, backups, and dumps can generate valid codes indefinitely until enrollment changes.
- **Impact:** Compromise of data at rest compromises the shared second factor for every enrolled user.
- **Affects:** **Both.**
- **Severity:** **High.**
- **Recommended solution:** Encrypt TOTP secrets at the application layer with a distinct, managed/KMS-backed data-encryption-key lifecycle; use authenticated encryption, migration/version metadata, rotation and re-enrollment procedures. Restrict DB/backups access regardless.
- **Estimated effort:** **Full day.**

#### P-06 — Browser-readable tokens are exposed to XSS

- **Evidence:** `frontend/src/lib/auth.ts` places access and refresh tokens in `window.sessionStorage`; `apiClient.ts` adds them as bearer headers.
- **Why this is a weakness:** Any same-origin script injection can read and exfiltrate both credential classes. Session storage limits persistence, not script access.
- **Impact:** Account/session takeover until access expiry and potentially through refresh rotation; client-side sign-out does not revoke access JWTs.
- **Affects:** **Both.**
- **Severity:** **High.**
- **Recommended solution:** Prioritize XSS controls (strict CSP, dependency hygiene, output safety) and move refresh credentials to Secure, HttpOnly, SameSite cookies with CSRF defenses; consider short-lived memory-only access tokens and a server-side revocation strategy.
- **Estimated effort:** **Multiple days.**

#### P-07 — Refresh-token rotation has a concurrent-use race and does not revoke issued access JWTs

- **Evidence:** `rotateRefreshToken` reads a token row, checks `revoked`, then updates it and creates a successor without a transaction/row lock. Access JWTs contain only `sub`, have a 15-minute TTL, and `requireAuth` has no session/family lookup.
- **Why this is a weakness:** Two concurrent refresh requests can both observe an unrevoked token and issue successors. Revoking a family affects refresh rows only, not already issued access tokens.
- **Impact:** Replay detection can be bypassed or produce multiple active successors in a race; emergency/manual revocation is delayed by access-token expiry.
- **Affects:** **Both.**
- **Severity:** **High.**
- **Recommended solution:** Make rotation a single transaction with `SELECT … FOR UPDATE` or conditional `UPDATE … WHERE revoked=false RETURNING`; model access-token session/family identity (`sid`/`jti`) and check a revocation store for high-risk operations or shorten TTL further.
- **Estimated effort:** **Half day.**

#### P-08 — Approval voting/resolution is not atomic

- **Evidence:** `submitVote` performs request read, delegation calls, signing, vote insert, all-vote query, policy query, status update, and asynchronous audit operations in separate pool queries with no encompassing transaction.
- **Why this is a weakness:** Concurrent votes can evaluate stale vote sets or make terminal updates non-deterministically; an inserted vote can survive an error before resolution.
- **Impact:** Incorrect quorum status, duplicate resolution/audit behavior, and evidence divergence under concurrency.
- **Affects:** **Both.**
- **Severity:** **High.**
- **Recommended solution:** Use one database transaction, lock the request/policy rows or use a safe isolation strategy, make vote uniqueness/status transition deterministic, and append mandatory evidence within the same durable operation/outbox.
- **Estimated effort:** **Full day.**

#### P-09 — Stored policy snapshot is not used for quorum evaluation

- **Evidence:** requests retain `policy_version_snapshot`, but `submitVote` reads current `approval_policies.quorum_type/quorum_n/quorum_m` by policy ID.
- **Why this is a weakness:** A policy update can change the outcome of an in-flight request despite the claimed snapshot.
- **Impact:** Audit/history semantics are unreliable; a policy administrator can retroactively influence pending approval decisions.
- **Affects:** **Both.**
- **Severity:** **High.**
- **Recommended solution:** Store immutable effective quorum/eligibility data per request or maintain versioned policy rows and load the exact version during evaluation.
- **Estimated effort:** **Half day.**

#### P-10 — Audit evidence is fail-open and the chain has no external trust anchor

- **Evidence:** session/risk/vote/resolution services call `appendAuditEntry(...).catch(...)`; `audit.service.ts` hashes `prevHash + JSON.stringify(payload)` in PostgreSQL. `verifyChain.ts` verifies only the same database’s chain.
- **Why this is a weakness:** Security-relevant action can succeed without a durable audit record. A database writer can rewrite rows and recompute all later hashes; nothing external detects a re-genesis/truncation/rewrite.
- **Impact:** The ledger is tamper-evident only against unsophisticated/partial modifications, not a privileged data-plane attacker; evidence completeness is not guaranteed.
- **Affects:** **Both.**
- **Severity:** **High.**
- **Recommended solution:** Classify which events must be audit-atomic, write them transactionally or via a transactional outbox, enforce append-only DB permissions, and periodically anchor signed chain checkpoints to independent immutable storage/monitoring.
- **Estimated effort:** **Multiple days.**

#### P-11 — Signing-key protection shares/defaults to JWT secret and lacks managed key custody

- **Evidence:** `lib/config.ts` defaults `SIGNING_KEY_ENCRYPTION_SECRET` to `JWT_SECRET`; `keys.service.ts` derives AES key using a simple SHA-256 hash of that secret.
- **Why this is a weakness:** One secret compromise can enable JWT forgery and decryption of every stored approval signing key. Plain SHA-256 derivation has no key separation context or managed rotation boundary.
- **Impact:** Large blast radius and difficult incident recovery.
- **Affects:** **Both.**
- **Severity:** **High.**
- **Recommended solution:** Require a separate high-entropy encryption secret/data-encryption key in production, use a KMS/HSM envelope-encryption model with explicit key IDs/versioning, and develop key rotation/recovery runbooks.
- **Estimated effort:** **Multiple days.**

#### P-12 — No real server-wide rate limiting or abuse controls

- **Evidence:** only `risk.service.ts` implements an in-memory per-user step-up attempt Map. Options, registration, refresh, TOTP setup/verify, policy, and approval routes have no visible distributed rate limits; `express.json()` has no configured body size limit.
- **Why this is a weakness:** Attackers can distribute traffic across instances, restart/rotate processes, enumerate costly flows, or submit excessive JSON bodies.
- **Impact:** Brute force, DoS, resource exhaustion, and noisy logs; no dependable MFA fatigue defense at scale.
- **Affects:** **Both.**
- **Severity:** **High.**
- **Recommended solution:** Apply layered per-IP/account/endpoint distributed limits with bounded keys and TTLs, body-size limits, reverse-proxy/WAF protections, and monitoring; avoid using unverified JWT claims as the sole limiter key.
- **Estimated effort:** **Full day.**

### Medium

#### P-13 — Risk engine is a minimal heuristic and can reduce assurance on novel devices

- **Evidence:** `scoreLoginRisk` looks at up to five `login_events`; no history is high, known IP is low, new IP with known UA is medium, and new IP plus new UA is low. Browser UI trust-engine components are mock-only.
- **Why this is a weakness:** User-agent is trivially spoofed, IPs are noisy, and the final low-risk branch is counterintuitive for an “adaptive risk” control.
- **Impact:** False assurance/under-challenge in real use; claims must remain limited to a demonstration heuristic.
- **Affects:** **Both** (logic) and **Demo only** (mock visual scenarios).
- **Severity:** **Medium.**
- **Recommended solution:** Treat it as an explainable pilot heuristic; collect privacy-reviewed, trustworthy signals, use calibrated policy, add device/session binding and monitoring, and require step-up for sensitive actions independent of score.
- **Estimated effort:** **Multiple days.**

#### P-14 — API validation is ad hoc and business invariants are underspecified

- **Evidence:** routes mainly check field presence/type; policy fields such as quorum values, roles, JSONB payload shape, escalation targets, and geo fences are passed to services without schema validation.
- **Why this is a weakness:** Database parameterization prevents SQL injection, but not malformed/oversized/unexpected business data or inconsistent policy state.
- **Impact:** Service errors, DoS surface, invalid policy behavior, and a harder authorization review.
- **Affects:** **Both.**
- **Severity:** **Medium.**
- **Recommended solution:** Add shared runtime request schemas and limits, validate cross-field constraints (for example `n <= m`), constrain enumerations, and encode key invariants in database constraints.
- **Estimated effort:** **Full day.**

#### P-15 — Error responses expose internal messages

- **Evidence:** multiple handlers return `err.message` directly, including database/service paths; `/health` returns `dbError`.
- **Why this is a weakness:** Internal error strings can reveal schema, infrastructure, behavior, or security-control details to remote callers.
- **Impact:** Information disclosure and brittle public API behavior.
- **Affects:** **Both.**
- **Severity:** **Medium.**
- **Recommended solution:** Use stable public error codes/messages, log detailed structured context server-side with redaction, restrict detailed health diagnostics to trusted networks, and test error-contract behavior.
- **Estimated effort:** **1–2 hours.**

#### P-16 — Audit-chain serialization is not a portable canonical evidence format

- **Evidence:** `computeHash` uses `JSON.stringify(payload)`; signing uses a shallow sorted-key `JSON.stringify(payload, Object.keys(payload).sort())` in `signing.service.ts`.
- **Why this is a weakness:** Object serialization is dependent on construction/key order (especially nested objects); the audit hash omits `entry_type` and ID despite migration commentary implying a broader formula.
- **Impact:** Independent verification and long-term evidence interoperability are weaker; semantically related data can hash differently.
- **Affects:** **Both.**
- **Severity:** **Medium.**
- **Recommended solution:** Define/version a canonical byte serialization, include all intended metadata explicitly, publish an independent verifier/test vectors, and preserve backwards-compatible versions.
- **Estimated effort:** **Full day.**

#### P-17 — Delegation and break-glass governance are incomplete

- **Evidence:** delegation checks only whether a voter has any active delegation as delegate; it does not connect delegation to a request/policy/delegator. `breakGlass` has no privileged-role check and does not append an audit record.
- **Why this is a weakness:** Authority is not scoped to the original approver or the action; emergency bypass lacks independent controls/evidence.
- **Impact:** Incorrect authorization acceptance and unreviewable emergency actions.
- **Affects:** **Both.**
- **Severity:** **Medium.**
- **Recommended solution:** Scope delegations to policy/request/authority, validate delegator eligibility and expiry in the vote transaction, restrict break-glass to explicit privilege plus reauthentication, and make it mandatory-audited/reviewable.
- **Estimated effort:** **Multiple days.**

#### P-18 — Background escalation is not singleton-safe and does not deliver escalation

- **Evidence:** `index.ts` starts `setInterval(runEscalationCheck, 30_000)` in every API process. Job only flips `escalated=true`.
- **Why this is a weakness:** Multiple replicas run the same job; although flag updates are mostly idempotent, execution ownership and real notification/escalation are absent.
- **Impact:** Duplicate work/logs and misleading expectations that a human/process was escalated to.
- **Affects:** **Both.**
- **Severity:** **Medium.**
- **Recommended solution:** Move recurring work to a singleton worker/queue with distributed lease; model escalation events, destination and delivery outcome explicitly.
- **Estimated effort:** **Full day.**

#### P-19 — Logging/monitoring and operational alerting are incomplete

- **Evidence:** Pino is used for request/service errors, but no metrics, tracing, security alerting, redaction policy, chain-check scheduler, or failure dashboards are tracked. Some handlers log raw `err` objects.
- **Why this is a weakness:** Incidents such as refresh reuse, key decryption failure, repeated enrollment calls, audit failures, and chain corruption may go undetected; logs can also contain sensitive diagnostics.
- **Impact:** Slow detection/response and possible data leakage.
- **Affects:** **Both.**
- **Severity:** **Medium.**
- **Recommended solution:** Define structured/redacted security events, metrics and alerts; schedule independent chain verification; retain logs securely with access control; add health/readiness separation and incident runbooks.
- **Estimated effort:** **Multiple days.**

#### P-20 — Test coverage does not exercise critical real integrations

- **Evidence:** `auth.integration.test.ts` and `approval.integration.test.ts` mock WebAuthn, session, risk, request/policy/audit dependencies; no tracked browser ceremony or real PostgreSQL concurrency suite is evident.
- **Why this is a weakness:** Unit/mocked route tests cannot prove WebAuthn origin behavior, migrations, authorization isolation, refresh races, audit atomicity, or cross-process state behavior.
- **Impact:** Production regressions in the most security-sensitive integrations can ship undetected.
- **Affects:** **Both.**
- **Severity:** **Medium.**
- **Recommended solution:** Add ephemeral Postgres/Redis integration tests, real-browser WebAuthn test strategy where feasible, concurrency tests for refresh/vote, authorization-isolation tests, and deployment/configuration smoke tests.
- **Estimated effort:** **Multiple days.**

#### P-21 — Docker Compose is development infrastructure, not hardened deployment

- **Evidence:** `docker-compose.yml` exposes PostgreSQL `5432` and Redis `6379`, uses `postgres/postgres`, uses local ports/origins, and frontend API URL is baked as `http://localhost:4000`.
- **Why this is a weakness:** It lacks TLS/reverse-proxy production topology, secret manager integration, network restrictions, resource limits, backup/restore policy, and production identity configuration.
- **Impact:** Unsafe if deployed as-is outside a controlled local environment.
- **Affects:** **Production only** if Compose is used as deployment.
- **Severity:** **Medium.**
- **Recommended solution:** Treat Compose as local-only; create a production deployment design with managed database/cache, private network paths, TLS, secure image supply chain, non-default credentials, secrets manager, readiness probes, and environment-specific RP/origin configuration.
- **Estimated effort:** **Multiple days.**

#### P-22 — Sensitive state is not consistently durable or revocable

- **Evidence:** challenges and limiter are process Maps; session access JWTs have no server-side session identifier; login/audit writes are asynchronous fail-open.
- **Why this is a weakness:** Security decisions and evidence differ after restart, scale-out, or partial failure.
- **Impact:** Inconsistent authentication and incomplete incident response.
- **Affects:** **Both.**
- **Severity:** **Medium.**
- **Recommended solution:** Define durable state ownership for each security property: shared expiring ceremony/limit store, transactionally persisted event/outbox, and explicit session identifiers/revocation semantics.
- **Estimated effort:** **Multiple days.**

### Low

#### P-23 — Dashboard behavior can misrepresent pending quorum state

- **Evidence:** `DashboardPage.submitVote` removes the request from local pending state after any successful vote; `submitVote` may return `quorumResult: 'pending'` for multi-vote policy.
- **Why this is a weakness:** UI state may imply completion when backend request remains pending.
- **Impact:** Operator confusion and weaker audit/demo clarity, not direct server authorization bypass.
- **Affects:** **Both.**
- **Severity:** **Low.**
- **Recommended solution:** Update from returned request/quorum result or refetch pending state; communicate residual quorum accurately.
- **Estimated effort:** **<30 min.**

#### P-24 — Attack demo error handling does not match API client error shape

- **Evidence:** `ApiError` exposes `status`, while `AttackDemoPage` reads `statusCode` from caught errors.
- **Why this is a weakness:** The demo may display status `0` rather than actual API response, reducing evidence accuracy.
- **Impact:** Demo correctness only.
- **Affects:** **Demo only.**
- **Severity:** **Low.**
- **Recommended solution:** Consume the client’s documented `ApiError.status`/`body` shape and test the demo’s expected displays.
- **Estimated effort:** **<30 min.**

#### P-25 — Demo/mock components can be mistaken for live controls without disciplined messaging

- **Evidence:** `AdaptiveTrustEngine`, `AttackSimulation`, `TrustTimeline`, and `JudgeMode` contain explicit mock data/comments; they are rendered from the dashboard demo surface.
- **Why this is a weakness:** The code labels them, but production/hackathon presentations can still overstate their relationship to backend enforcement.
- **Impact:** Trust/claim accuracy rather than a direct exploit.
- **Affects:** **Demo only.**
- **Severity:** **Low.**
- **Recommended solution:** Keep explicit “simulation/mock” labels, separate mock and live telemetry visually/API-wise, and maintain an implementation-status matrix in demos and documentation.
- **Estimated effort:** **<30 min.**

## Top 20 improvements by engineering value

| Rank | Improvement                                                                        | Primary value                          | Effort                                  |
| ---: | ---------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------- |
|    1 | Authenticate and reauthenticate TOTP enrollment/replacement                        | prevents factor takeover               | 1–2 hours / multiple days for lifecycle |
|    2 | Implement real reviewer, role, separation-of-duties, and break-glass authorization | makes approval workflow meaningful     | multiple days                           |
|    3 | Align approval intent/signature model with user-controlled evidence                | restores cryptographic claim integrity | multiple days                           |
|    4 | Move WebAuthn ceremony state to shared TTL-backed storage with atomic consumption  | correct scaling/replay lifecycle       | half day                                |
|    5 | Encrypt TOTP secrets with separate managed key lifecycle                           | limits data-at-rest compromise         | full day                                |
|    6 | Transactionalize refresh-token rotation                                            | fixes replay/concurrency behavior      | half day                                |
|    7 | Make votes/quorum/status/evidence transactionally consistent                       | protects approval integrity            | full day                                |
|    8 | Use immutable per-request policy version data                                      | preserves policy/audit semantics       | half day                                |
|    9 | Make mandatory audit events durable and externally anchor checkpoints              | improves evidence trust                | multiple days                           |
|   10 | Separate signing-key encryption from JWT secrets; use KMS envelope encryption      | reduces crypto blast radius            | multiple days                           |
|   11 | Add distributed, bounded rate limiting and request/body limits                     | prevents abuse/DoS                     | full day                                |
|   12 | Move refresh token handling away from script-readable storage and harden XSS       | reduces session theft                  | multiple days                           |
|   13 | Define explicit access-token revocation/session-ID policy                          | improves incident response             | full day                                |
|   14 | Introduce runtime schemas and DB constraints for policy/request invariants         | strengthens API correctness            | full day                                |
|   15 | Rework delegation and emergency workflow with scope and audit                      | closes authority gaps                  | multiple days                           |
|   16 | Replace in-process escalation timer with singleton worker/queue                    | correct operations at scale            | full day                                |
|   17 | Establish error redaction/public error contracts                                   | limits information disclosure          | 1–2 hours                               |
|   18 | Build production monitoring, alerts, chain verification scheduling, and runbooks   | improves detection/response            | multiple days                           |
|   19 | Add real DB/concurrency/browser integration test coverage                          | reduces security regressions           | multiple days                           |
|   20 | Define hardened production deployment/secret/TLS topology                          | prevents unsafe Compose deployment     | multiple days                           |
