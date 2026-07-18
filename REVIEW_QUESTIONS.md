# TrustLine — adversarial engineering review questions

> National-hackathon mentor edition. Questions and findings refer to the current tracked implementation. This document intentionally challenges the design; it does not prescribe code changes.

## 1. File-by-file review prompts

For each file below, a reviewer should first ask: **Why does it exist, what breaks if it is deleted, who imports it, and which function must the developer be able to explain?**

| File(s)                                                                                            | Specific questions                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/main.tsx`, `App.tsx`                                                                 | Why is `StrictMode` enabled? Which routes have no route guard? What happens if a user pastes `/dashboard` without a token? Explain the purpose of the root redirect.                                                               |
| `frontend/src/lib/apiClient.ts`                                                                    | Explain `request<T>` parameter-by-parameter. Why is the API base URL build-time configuration? Why do authenticated helpers take a token rather than obtain it internally? What happens on a non-JSON error?                       |
| `frontend/src/lib/auth.ts`                                                                         | Why `sessionStorage` rather than an HttpOnly cookie? What happens on tab close, refresh, XSS, or token expiry? Why is `isAuthenticated` only a non-null check?                                                                     |
| `pages/RegisterPage.tsx`                                                                           | Why is `displayName` required but not submitted? Explain `handleSubmit` and `handleTotpVerify`. Why is the setup endpoint called with returned `userId` without a bearer token?                                                    |
| `pages/LoginPage.tsx`                                                                              | Explain every phase of `handleSignIn` and `handleTotpSubmit`. Is the number-matching push control a security factor or a local demonstration? How does the page distinguish low-risk and step-up responses?                        |
| `pages/DashboardPage.tsx`                                                                          | Explain `loadSessions`, `loadApprovals`, `loadActivity`, `submitVote`, and `createDemoRequest`. Why does the UI remove a request after one vote even if a multi-vote quorum could remain pending?                                  |
| `pages/DisputeDemoPage.tsx`                                                                        | What does the page cryptographically verify versus merely display? Why is receipt access requester-scoped? Explain every copied field and the limits of browser-side presentation.                                                 |
| `pages/AttackDemoPage.tsx`                                                                         | Why does `fakePendingToken` fabricate an invalid signature? Does `ApiError` expose `status`, while this page reads `statusCode`? What does the replay simulation actually prove?                                                   |
| `pages/PhishingCloneDemoPage.tsx`                                                                  | Why does it call the real login-options endpoint? Why can same-origin development produce the fallback message instead of a browser rejection? Is this a real phishing test?                                                       |
| `components/PushSimulator.tsx`                                                                     | Where is the target code created? Can a user bypass the component callback in DevTools? Why must it not be described as server-delivered push MFA?                                                                                 |
| `components/AdaptiveTrustEngine.tsx`, `AttackSimulation.tsx`, `TrustTimeline.tsx`, `JudgeMode.tsx` | Identify every `MOCK_*`/`DEMO_*` constant. Why are these not security controls? What would be required to replace each mock with trusted telemetry?                                                                                |
| `backend/src/index.ts`, `app.ts`                                                                   | Why must config load before app startup? Explain middleware order. What happens if `runEscalationCheck` overlaps an earlier execution? Why is the health endpoint not an availability guarantee?                                   |
| `lib/config.ts`, `db/pool.ts`, `lib/logger.ts`                                                     | Which environment variables are mandatory, and why does Docker Compose still start Redis despite no runtime Redis client? What happens if configuration changes after process start? Why can logging itself become sensitive data? |
| `middleware/requireAuth.ts`, `errorHandler.ts`, `types/express.d.ts`                               | Explain bearer parsing and `jwt.verify`. Why are refresh tokens not accepted by the middleware? Are all errors normalized consistently? How does TypeScript know `req.userId` exists?                                              |
| `routes/auth.routes.ts`                                                                            | Walk every endpoint and status code. Why is TOTP setup/verify unauthenticated? Why does step-up decode before verify for rate-limit lookup? What data reaches logs?                                                                |
| `services/webauthn.service.ts`                                                                     | Explain registration/login challenge maps, RP ID, expected origins, credential ownership query, counter update, and challenge deletion timing. What happens across replicas or restart?                                            |
| `services/totp.service.ts`                                                                         | Explain every helper: `decodeBase32`, `encodeBase32`, `counterBuffer`, `generateHOTP`, `generateTOTP`, `verifyTOTP`, `buildOtpAuthUri`, `generateSecretForUser`, `verifyCode`. Why are secrets stored as text?                     |
| `services/session.service.ts`                                                                      | Explain raw refresh-token generation, SHA-256 storage, family rotation, reuse detection, TTLs, and fail-open audit/login event writes. What happens in concurrent refresh requests?                                                |
| `services/risk.service.ts`                                                                         | Explain all three heuristic outcomes. Why is a new IP plus a new user-agent low risk after history exists? What resets the in-memory attempt counter?                                                                              |
| `routes/approval.routes.ts`, `services/policy.service.ts`                                          | Who may create/list policies? Where are roles actually enforced? Explain JSONB fields and whether their declared semantics are implemented.                                                                                        |
| `services/request.service.ts`, `quorum.service.ts`, `delegation.service.ts`                        | Explain the requester/approver ownership predicate, vote uniqueness, delegation checks, quorum math, terminal update, and break-glass behavior. Which operations lack transactions?                                                |
| `services/keys.service.ts`, `signing.service.ts`                                                   | Explain AES-GCM envelope format, SHA-256 key derivation, key migration, Ed25519 generation, canonicalization, Base64 signatures, and which actor actually owns the private key.                                                    |
| `services/audit.service.ts`, `routes/ledger.routes.ts`, `scripts/verifyChain.ts`                   | Explain `FOR UPDATE`, genesis handling, exact hash input, JSON serialization stability, receipt authorization, and why hash chaining is tamper-evident rather than immutable storage.                                              |
| `jobs/escalation.job.ts`                                                                           | Why is it run from every API process? What indexes support it? What prevents duplicate effects? Is an `escalated` flag an escalation workflow?                                                                                     |
| `migrations/00001`–`00011`                                                                         | Explain every FK, unique constraint, index, cascade/restrict choice, and migration ordering. Which business invariants are not represented by a database constraint?                                                               |
| `scripts/seed.ts`, `smokeTest.ts`, `loadTest.ts`                                                   | Can a developer safely run each against production? What assumptions do they make? How does seeded data interact with authorization claims?                                                                                        |
| `tests/*.test.ts`, `services/*.test.ts`                                                            | Which dependencies are mocked? Which high-risk production paths are not integration-tested with Postgres and a real authenticator?                                                                                                 |
| `docker-compose.yml`, Dockerfiles, nginx config                                                    | Why expose Postgres/Redis ports? Which secret source wins? How does the frontend’s baked `VITE_API_URL` behave behind a real reverse proxy?                                                                                        |

## 2. Authentication, crypto, and database questions

1. Who creates a passkey challenge and who proves it was consumed exactly once?
2. Why are registration and login challenges keyed only by normalized email?
3. Can two browser windows for one email overwrite each other’s challenge?
4. What is the exact representation of `credential_id` from generation through database lookup?
5. Where does a WebAuthn private key live, and where does the Ed25519 private key live?
6. Why are the expected origins an array and how is it configured in production?
7. What protections remain if the WebAuthn sign counter is zero on a synced passkey?
8. Why does registration upsert a user before credential verification?
9. What user information can `/login/options` disclose through timing/status behavior?
10. Why is TOTP enabled only after `verifyCode` succeeds?
11. Explain Base32 padding validation and interoperability with authenticator applications.
12. Why does RFC 6238 default to HMAC-SHA1 here, and what would change for SHA-256?
13. What is dynamic truncation and why clear the high bit?
14. What does the ±1 TOTP window accept in wall-clock seconds?
15. What attack does `timingSafeEqual` address, and what does it not address?
16. Why are TOTP setup and verification endpoints currently unauthenticated?
17. What happens if an attacker learns a valid `userId` during enrollment?
18. How are access and refresh tokens materially different?
19. What does refresh-token family revocation detect, and what race remains with concurrent use?
20. Why is the access token only 15 minutes and how is expiry handled in the frontend?
21. What does `requireAuth` validate beyond signature and expiry?
22. Which risk signals are real request metadata and which UI risk displays are mock-only?
23. Why can the first completed passkey login force TOTP step-up?
24. How is a pending step-up token constrained to purpose, user, IP, and user agent?
25. What prevents using a valid access token as a pending token?
26. What database rows form one active session as shown by the dashboard?
27. Why is Ed25519 signing server-side rather than a WebAuthn signature from the approver?
28. Explain AES-GCM authentication tag failure behavior.
29. Why is SHA-256 used for refresh-token hashing and audit-chain hashing but HMAC-SHA1 for HOTP?
30. What exact JSON representation is signed and what breaks if payload nesting changes?
31. Is `JSON.stringify` a durable canonicalization algorithm for arbitrary nested payloads?
32. Who is authorized to see a receipt and why?
33. Which audit entries are associated with a dashboard user by JSONB containment?
34. What happens when audit logging fails after a vote is inserted?
35. Which database constraints prevent duplicate credentials, votes, and tokens?

## 3. Technology-choice questions

1. Why React and Vite instead of server-rendered HTML or Next.js?
2. Why Express rather than Fastify, NestJS, or a serverless API?
3. Why PostgreSQL and JSONB instead of a document database?
4. Why `pg` SQL calls rather than an ORM and what safety review replaces ORM relations?
5. Why SimpleWebAuthn rather than handwritten CBOR/WebAuthn verification?
6. Why browser-native passkeys rather than passwords plus SMS OTP?
7. Why RFC 6238 TOTP as step-up instead of WebAuthn-only, push, or hardware tokens?
8. Why write RFC 6238 with Node `crypto` rather than a maintained OTP library, and how is it maintained?
9. Why Base32 instead of Base64 for provisioning secrets?
10. Why 30-second periods and six digits?
11. Why HMAC-SHA1 for standards compatibility despite SHA-1’s general reputation?
12. Why `timingSafeEqual` and why not compare decoded integers?
13. Why JWT bearer access tokens instead of opaque server sessions?
14. Why random opaque refresh tokens and SHA-256 storage?
15. Why AES-256-GCM for private-key encryption rather than a KMS envelope encryption service?
16. Why derive the AES key with a plain SHA-256 hash rather than HKDF/scrypt/Argon2?
17. Why Ed25519 over RSA-PSS or ECDSA P-256?
18. Why SHA-256 hash chaining rather than a Merkle tree or external transparency log?
19. Why Docker Compose rather than Kubernetes or managed services?
20. Why is Redis provisioned but unused, and what design was intended for it?

## 4. Attack questions (100)

1. What if Redis crashes when no application component currently uses it?
2. What if PostgreSQL fails between credential verification and counter update?
3. What if PostgreSQL fails after a vote insert but before a terminal status update?
4. What if the API restarts between options generation and WebAuthn response?
5. What if two replicas receive different halves of one WebAuthn ceremony?
6. What if two tabs request login options for the same email?
7. What if an attacker repeatedly overwrites another user’s email-keyed challenge?
8. What if a registration response is replayed after success?
9. What if a failed WebAuthn verification leaves a challenge reusable?
10. What if an authenticator reports a non-incrementing counter?
11. What if a credential ID is copied between accounts?
12. What if two users share one physical platform passkey?
13. What if browser malware invokes WebAuthn while the user is present?
14. What if the frontend origin is misconfigured in production?
15. What if DNS/reverse-proxy origin differs from WebAuthn RP ID?
16. What if an attacker steals a 15-minute access JWT from sessionStorage?
17. What if XSS reads both stored tokens?
18. What if a refresh token is stolen before its legitimate first use?
19. What if the thief and user refresh concurrently?
20. What if a revoked token is replayed after family revocation?
21. What if a token family UUID becomes known?
22. What if JWT secrets are weak, rotated, or accidentally logged?
23. What if a pending step-up token is stolen within five minutes?
24. What if an attacker sends malformed JWTs to consume rate-limit state for another `sub`?
25. What if step-up attempts are distributed across API replicas?
26. What if the server restarts to clear the MFA fatigue limiter?
27. What if the user’s IP is unavailable behind a proxy?
28. What if all users share one NAT IP?
29. What if an attacker spoofs a user-agent string?
30. What if a new IP and new user agent is categorized low risk?
31. What if login-event inserts fail silently?
32. What if an attacker knows a newly registered user ID?
33. What if an attacker calls `/api/auth/totp/setup` for that user ID?
34. What if the attacker replaces the victim’s TOTP secret before enrollment completes?
35. What if an attacker calls `/api/auth/totp/verify` with a guessed valid code after replacing it?
36. What if the database backup exposes plaintext `totp_secret` values?
37. What if logs or an error response reveal a provisioning URI?
38. What if a phone is stolen with its authenticator unlocked?
39. What if time synchronization drifts by more than one 30-second step?
40. What if a TOTP code is replayed within the same accepted window?
41. What if a user submits an invalid-length TOTP millions of times?
42. What if Base32 decoder edge cases lead to secret normalization confusion?
43. What if the signing-key encryption secret leaks?
44. What if `JWT_SECRET` doubles as signing-key encryption secret by default?
45. What if AES-GCM ciphertext, IV, or tag is truncated in the database?
46. What if an old signing-key secret is retained indefinitely?
47. What if an attacker replaces a user’s public signing key in PostgreSQL?
48. What if an attacker with DB write access replaces both private ciphertext and receipt data?
49. What if an approval vote signature timestamp is not persisted separately from its signed payload?
50. What if signature canonicalization differs in an independent verifier?
51. What if nested JSON key order changes before independent verification?
52. What if an actor votes on a request they created?
53. What if an unauthenticated role is named in `eligible_roles` but never checked?
54. What if a user creates a permissive policy and immediately self-approves?
55. What if two votes race past the same quorum boundary?
56. What if vote insertion succeeds but `evaluateQuorum` throws on an invalid policy?
57. What if a failed audit append hides a completed approval?
58. What if break-glass is invoked and no corresponding audit event is written?
59. What if a user invokes break-glass on a sensitive request without a separate privilege check?
60. What if an expired delegate has an unrelated active delegation?
61. What if delegation chains or delegator authority are not validated?
62. What if the escalation job runs on every horizontally scaled API node?
63. What if `escalated=true` is mistaken for an actual notified escalation?
64. What if a policy’s version changes after request creation but quorum evaluation reads current policy fields?
65. What if an approval request is deleted by privileged DB access?
66. What if audit-log rows are modified and all downstream hashes are recomputed?
67. What if the database administrator truncates the audit log and creates a new genesis?
68. What if JSON serialization differs across Node versions?
69. What if `FOR UPDATE` locking causes audit-log contention under load?
70. What if audit payloads contain sensitive PII and the dashboard exposes them?
71. What if JSONB containment matches an unexpected embedded `userId`?
72. What if receipt access is requested using a guessed request UUID from another user?
73. What if CORS permits a hostile origin due to a misparsed comma-separated config?
74. What if credentials are sent cross-origin despite CORS settings?
75. What if the API URL is baked to localhost in a production frontend build?
76. What if Docker exposes Postgres and Redis to an untrusted network?
77. What if Docker Compose uses development database credentials in deployment?
78. What if rate-limit Maps consume unbounded memory via forged subjects?
79. What if a request body is extremely large before JSON parsing?
80. What if logs include raw WebAuthn responses or token data during debugging?
81. What if API error messages return internal database details?
82. What if browser DevTools calls approval APIs directly, bypassing UI labels?
83. What if UI optimistic removal makes a pending multi-quorum request disappear?
84. What if an attacker abuses policy creation to create huge JSONB fields?
85. What if SQL query limits hide critical sessions or activity from a user?
86. What if session revocation fails for a token that is currently being rotated?
87. What if a refresh family has multiple active tokens due to concurrent rotation?
88. What if access JWTs remain valid after manual session revocation?
89. What if a compromised browser retains an access token after user signs out locally?
90. What if a phishing demo is accidentally deployed at the legitimate origin?
91. What if a mentor mistakes mock trust score screens for live risk analysis?
92. What if test mocks conceal route/service integration errors?
93. What if a migration is only partially applied?
94. What if database indexes do not match actual large-scale authorization queries?
95. What if `gen_random_uuid()` extension is unavailable?
96. What if process time is manipulated by a compromised host?
97. What if the system clock moves backwards during TOTP verification?
98. What if an attacker controls `X-Forwarded-For` but Express proxy trust is later enabled incorrectly?
99. What if no monitoring alerts on chain verification failure, DB failure, or key decryption errors?
100. What if an external verifier cannot establish a trusted checkpoint for the audit chain?

## 5. Code-walk questions

Ask the developer to whiteboard these actual functions, every parameter, every query, and every return path:

- `webauthn.service.ts`: `generateRegistrationOptionsForUser(email)`, `verifyRegistration(email,response)`, `generateLoginOptionsForUser(email)`, `verifyLogin(email,response)`.
- `totp.service.ts`: `decodeBase32(secret)`, `generateHOTP(secret,counter,digits)`, `generateTOTP(secret,timestamp)`, `verifyTOTP(secret,token,window,timestamp)`, `generateSecretForUser(userId)`, `verifyCode(userId,code)`.
- `session.service.ts`: `issueRefreshToken(userId,familyId)`, `issueSession(userId,ip,userAgent)`, `rotateRefreshToken(rawToken)`.
- `keys.service.ts`: `deriveEncryptionKey`, `encryptPrivateKey`, `decryptPrivateKeyWithMigration`, `generateKeypairForUser`.
- `signing.service.ts`: `canonicalize`, `sign`, `verify`, `verifyForUser`.
- `audit.service.ts`: `computeHash`, `appendAuditEntry`, `getReceiptForRequest`.
- `request.service.ts`: `createRequest`, `submitVote`, `breakGlass`, `listResolvedRequests`.
- `quorum.service.ts`: `evaluateQuorum`; prove the denial condition for `n_of_m`.
- `risk.service.ts`: `recordStepUpAttempt`, `scoreLoginRisk`; explain every branch.
- `requireAuth(req,res,next)`: explain malformed headers, missing `sub`, expiry, and `req.userId` typing.
- Each SQL statement: identify user-controlled values, parameterization, authorization predicates, transaction boundaries, indexes used, and failure semantics.

## 6. Architecture and operations questions

1. How would this design behave behind a load balancer with four API replicas?
2. Which state must move to Redis or PostgreSQL before horizontal scaling?
3. Why is Redis started but not used, and how would you safely use it for challenge TTLs and rate limits?
4. How would you prevent concurrent refresh rotation from issuing multiple valid family tokens?
5. Which API routes need payload limits, schema validation, and abuse controls?
6. What database connection-pool size matches the deployment topology?
7. Which existing indexes support sessions, pending requests, audit queries, and escalation at scale?
8. Where would you add composite indexes and why?
9. How would you isolate a background job so only one worker executes it?
10. How would you manage encryption/JWT secrets, rotation, and KMS access in production?
11. How would you create immutable audit checkpoints outside PostgreSQL?
12. What is the disaster-recovery plan for signing keys, TOTP secrets, and audit data?
13. Which observability signals, alerts, traces, and security events are missing?
14. How would you test WebAuthn in CI and on real browsers?
15. How would you deploy frontend/API behind one TLS origin while preserving WebAuthn RP ID/origin rules?
16. What must change to use HttpOnly SameSite cookies instead of sessionStorage?
17. Is a microservice split justified yet, and what boundaries would be candidates?
18. How would you add reviewer assignment, roles, least privilege, and policy ownership?
19. How would you represent approval state transitions atomically?
20. What service-level objectives would you set for authentication and ledger verification?

## 7. The 100 hardest mentor questions

1. Prove which secret protects each layer and identify every blast radius if it leaks.
2. Reconcile WebAuthn counter semantics with multi-device passkeys.
3. Explain why in-memory challenge storage violates ceremony availability under scaling.
4. Design a challenge record that resists overwrite, replay, expiry, and account enumeration.
5. Explain why the registration upsert is safe or unsafe before proof of authenticator possession.
6. Derive HOTP dynamic truncation from the HMAC bytes.
7. Explain the valid Base32 padding lengths used by this decoder.
8. Prove why a ±1 window is usability/security trade-off, not replay prevention.
9. Design TOTP replay prevention without breaking common authenticator behavior.
10. Explain why timing-safe comparison cannot protect a stolen shared secret.
11. Contrast the two uses of SHA-256 in this project.
12. Explain what `crypto.sign(null, …)` means for Ed25519.
13. Critique the private-key encryption key derivation.
14. Define canonical JSON suitable for independent cross-language receipt verification.
15. Show how a receipt consumer verifies every vote and every audit link.
16. Explain why a hash chain is not immutable without an external trust anchor.
17. Identify all fail-open security writes and defend or reject each choice.
18. Prove whether a vote and its status transition are atomic.
19. Explain the discrepancy between policy snapshot storage and current-policy quorum lookup.
20. Prove who may vote under the exact SQL predicate.
21. Explain why `eligible_roles` is data, not authorization, in the current code.
22. Design a correct reviewer-assignment query.
23. Model a race between two `submitVote` calls at quorum.
24. Model a race between two refresh requests for one raw token.
25. Explain what revoking a family does not revoke.
26. Design immediate access-token revocation.
27. Explain the risk heuristic’s counterintuitive final low-risk branch.
28. Calculate behavior for no IP, no user agent, a NAT, and a proxy.
29. Explain why decoding a pending JWT before verification is a resource-risk decision.
30. Bound memory use of `stepUpAttempts`.
31. Assess the security impact of unauthenticated TOTP enrollment.
32. Explain which user identifiers are observable and how that matters.
33. Identify every endpoint vulnerable to payload/schema ambiguity.
34. Explain CORS versus WebAuthn origin verification precisely.
35. Design production RP ID/origin configuration for multiple subdomains.
36. Explain why a phishing demo on the same origin cannot demonstrate origin binding.
37. Identify where browser compromise defeats this architecture.
38. Explain why a passkey does not automatically authorize every business action.
39. Compare server-held Ed25519 vote signatures with user-held WebAuthn signatures.
40. Define non-repudiation honestly for the current signing design.
41. Explain key loss and user account recovery consequences.
42. Design signing-key rotation with verifiable historic receipts.
43. Explain AES-GCM nonce uniqueness requirements and how code meets them.
44. Assess whether public key substitution is detectable from the ledger.
45. Explain why auditing is asynchronous in `issueSession`.
46. Identify missing audit events, including break-glass.
47. Explain SQL isolation used by audit appends versus absent isolation in votes.
48. Propose database constraints for valid request status transitions.
49. Explain current delegation semantics and an escalation path to delegation chains.
50. Explain idempotency for policy creation, request creation, vote submission, and break-glass.
51. Explain why test doubles alter confidence in the integration test suite.
52. Name the highest-value end-to-end tests missing today.
53. Explain database backup encryption requirements for this schema.
54. Separate encryption at rest, in transit, and application-level encryption.
55. Explain why TOTP secrets need a distinct encryption key lifecycle.
56. Assess whether Docker Compose satisfies production network segmentation.
57. Explain why exposed service ports matter beyond localhost development.
58. Design secret injection that avoids `.env` drift.
59. Explain required CSP, XSS, and dependency controls for sessionStorage tokens.
60. Explain why frontend route navigation is not authorization.
61. Identify every UI statement that could overclaim live security behavior.
62. Explain receipt authorization versus approval authorization.
63. Design an auditor role without leaking unrelated data.
64. Explain JSONB containment authorization query pitfalls.
65. Design pagination that preserves audit-chain evidence ordering.
66. Explain audit-log lock contention and viable append architectures.
67. Design a Merkle/checkpoint extension without invalidating historic chains.
68. Explain how to independently verify Node-generated Ed25519 signatures elsewhere.
69. Explain why HMAC-SHA1 remains RFC compatible but has migration considerations.
70. Plan a TOTP algorithm migration without locking out enrolled users.
71. Explain passkey credential lifecycle: add, remove, rename, recover.
72. Design credential challenge TTL and cleanup.
73. Assess how server clock trust affects TOTP and JWT validity.
74. Explain logging privacy constraints for IPs, user agents, emails, and crypto errors.
75. Design alerting for refresh reuse and approval abuse.
76. Explain the actual blast radius of database read access.
77. Explain the actual blast radius of database write access.
78. Explain the actual blast radius of API host compromise.
79. Explain the actual blast radius of browser compromise.
80. Design least-privilege database roles for API, migrator, and verifier.
81. Explain why Redis could help and why it would not fix all state problems.
82. Design distributed rate limiting resistant to attacker-selected keys.
83. Explain how to use proxy headers safely for risk signals.
84. Explain how to make risk scoring explainable without leaking detection thresholds.
85. Assess policy JSONB validation and versioning guarantees.
86. Explain why a `single_senior` policy lacks identity/role enforcement.
87. Design an append-only database permission model for the audit ledger.
88. Explain ledger deletion, truncation, and re-genesis detection.
89. Design external anchoring frequency and verification procedure.
90. Explain trade-offs of issuing a session after TOTP versus another WebAuthn assertion.
91. Explain whether local push number matching adds independent assurance.
92. Identify each assumption made by `smokeTest.ts` and `loadTest.ts`.
93. Explain migration rollback safety with production data.
94. Assess error classification and client-information leakage.
95. Explain authentication availability if SimpleWebAuthn validation errors spike.
96. Design graceful degradation without weakening authentication.
97. Explain what “immutable” and “cryptographically signed” must mean in a demo pitch.
98. Give a threat model boundary statement for TrustLine.
99. Rank fixes under one week, one month, and production timelines.
100. Defend which parts are production techniques, which are demo implementations, and why.

## 8. Findings and weaknesses

### Critical

1. **Unauthenticated TOTP enrollment/reset surface.** `POST /api/auth/totp/setup` and `/totp/verify` accept a caller-provided `userId` without `requireAuth` (`routes/auth.routes.ts`). A known user UUID could permit replacement/enabling of another user’s TOTP secret.
2. **Approval authorization is demo-only.** `request.service.ts` constrains `submitVote` and `breakGlass` with requester ownership; it does not enforce reviewer identity, role eligibility, separation of duties, or break-glass privilege. Policy `eligible_roles` is not enforced.
3. **Application-held approval keys.** Votes are signed by the server using a decryptable per-user Ed25519 private key, not by a browser/WebAuthn user ceremony. Claims of user-controlled/non-repudiable approval signatures must be limited accordingly.

### High

1. **In-memory security state.** WebAuthn challenges and step-up rate limits are Maps; restart loses state, replicas split it, and there is no TTL/cleanup policy for challenges.
2. **Plaintext TOTP secrets.** `users.totp_secret` is text, unlike signing private keys. Database-read exposure enables TOTP generation.
3. **Session tokens in sessionStorage.** XSS can read access and refresh tokens; sign-out is client-only and access tokens remain valid until expiry.
4. **Untransactional approval state machine.** Vote insertion, quorum reads, status update, and audit writes are not one atomic transaction; current policy fields are read despite storing a version snapshot.
5. **Audit chain is not independently anchored.** A database writer can modify/recompute a self-contained chain; audit application code uses serializable-style locking but there is no DB append-only permission or outside checkpoint.

### Medium

1. **Risk signal quality.** It uses only IP and user-agent; the final new-IP/new-UA branch is low risk, and rate limiting resets per process.
2. **Incomplete input/schema and authorization validation.** Routes mostly use ad-hoc type checks; no request schema library, policy ownership, or payload limits are apparent.
3. **Break-glass lacks an audit append in `breakGlass`.** `needs_review` records a flag but there is no demonstrated review workflow.
4. **Frontend accuracy issues.** Dashboard removes a request after any vote; `AttackDemoPage` reads a `statusCode` field although `ApiError` exposes `status`.
5. **Tests use extensive mocks.** Route tests demonstrate routing/status behavior but do not replace real Postgres/WebAuthn/browser end-to-end assurance.

### Low / maintainability

1. Root workspace scripts reference `apps/*` while actual applications live in `frontend/` and `backend/`; verify intended tooling before relying on root commands.
2. Redis is mandatory configuration and Compose infrastructure without a tracked client use.
3. Several security demo components intentionally use mock data; their labels are good, but future copy must preserve that distinction.

## 9. Ranked improvement questions

| Rank     | Improvement to defend                                                                                                  | Why it ranks here                                                |
| -------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Critical | How will you authenticate and bind TOTP setup/verification to the current user, with re-enrollment controls?           | Prevents direct factor takeover.                                 |
| Critical | How will you implement real approver assignment, role authorization, separation of duties, and privileged break-glass? | Current approval boundary is not enterprise authorization.       |
| Critical | How will you change approval signing so the claimed signer controls the signing operation?                             | Determines the truthfulness of signature/non-repudiation claims. |
| High     | How will challenges/rate limits become distributed, expiring, bounded state?                                           | Required for reliable secure scale.                              |
| High     | How will TOTP secrets be encrypted and rotated independently?                                                          | Limits DB disclosure impact.                                     |
| High     | How will approval transitions/audit records become transactionally consistent and independently anchored?              | Protects decision and evidence integrity.                        |
| High     | How will browser-token theft/XSS exposure be reduced?                                                                  | Current tokens are script-readable.                              |
| Medium   | How will risk scoring gain trustworthy signals and a defensible policy?                                                | Current heuristic is intentionally simple.                       |
| Medium   | How will validation, payload limits, observability, and production error handling be standardized?                     | Reduces abuse and operational ambiguity.                         |
| Medium   | How will real-browser/real-database E2E tests cover critical journeys?                                                 | Mocks leave critical gaps.                                       |
| Low      | How will root tooling and unused Redis configuration be reconciled?                                                    | Improves developer confidence and clarity.                       |

## 10. 45-minute mock viva (questions only)

**0–5 min — architecture**

1. Draw the request path from `main.tsx` to `app.ts` for a dashboard API call.
2. Which data is browser state, process state, and PostgreSQL state?
3. What does Redis do in this repository today?
4. Identify all browser-only simulations.
5. State the trust boundary between authenticator, browser, API, and database.

**5–15 min — authentication**

6. Walk registration from `RegisterPage.handleSubmit` to `webauthn_credentials`.
7. Where is the registration challenge generated, stored, and deleted?
8. What exact values are passed to `verifyRegistrationResponse`?
9. Explain credential counter replay protection.
10. Walk login through risk scoring and step-up.
11. Explain pending-token purpose validation.
12. Why does the first login receive high risk?
13. Compare access JWT and refresh token storage/validation.
14. Model two simultaneous refreshes.
15. Identify the TOTP enrollment authorization weakness.

**15–25 min — TOTP and crypto**

16. Derive a TOTP code from Base32 secret to six digits.
17. Why HMAC-SHA1, dynamic truncation, and a 30-second counter?
18. What exact acceptance range does window ±1 create?
19. What does `timingSafeEqual` protect?
20. Explain AES-GCM fields stored in `signing_keys`.
21. Why Ed25519 and who holds the effective signing authority?
22. How would an external receipt verifier reproduce canonical bytes?
23. What happens if signing-key encryption configuration changes?

**25–35 min — approvals and ledger**

24. Who can create, view, vote on, and break-glass a request today?
25. Prove quorum behavior for two approvals and one denial in 2-of-3.
26. Explain the stored policy snapshot/current policy discrepancy.
27. Trace `submitVote` through signature, database, quorum, and audit.
28. Which part of that operation is not atomic?
29. Explain the audit hash formula and genesis entry.
30. How would a malicious DB administrator evade the current chain?
31. What does a dispute receipt contain and not prove?
32. Why does requester-scoped receipt access matter?

**35–45 min — threat model and production readiness**

33. What breaks with four API replicas?
34. What is the highest-priority fix and why?
35. What happens if PostgreSQL is unavailable at each major workflow step?
36. What happens if an attacker steals each token/factor/key type?
37. Which tests are mocked and what real tests are missing?
38. Which Docker defaults are development-only?
39. Which dashboard claims must be labelled as demo/mock?
40. Give an honest production-readiness statement in 30 seconds.
41. Describe a one-week hardening plan.
42. Describe a one-month authorization and evidence-integrity plan.
