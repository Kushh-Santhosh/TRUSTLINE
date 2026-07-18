# Tally CodeBrewers 2026 — Authentication Platform

> **Historical design material.** This file contains proposal-stage ideas and may describe capabilities that are not implemented. For the current code-derived status, use [README.md](README.md), [PROJECT_ARCHITECTURE.md](PROJECT_ARCHITECTURE.md), and [PRODUCTION_GAP_ANALYSIS.md](PRODUCTION_GAP_ANALYSIS.md).

## Design Document: "TrustLine" (working name)

---

## 1. What the judges are actually testing

Reading past the surface ask, this brief is testing three specific judgment calls, not feature count:

1. **Can you say "passwordless" and actually mean it** — not "passwordless login + SMS OTP fallback that's really your primary path 80% of the time." The doc explicitly calls out SMS/OTP weaknesses (interception, delay, redirection) as things you should have already internalized, not rediscovered in a threat-model slide.
2. **Do you understand that the approval system is the hard part, not login.** The brief says outright: _"We're evaluating your approval design and the reasoning behind it, not the forms an admin fills out."_ That's a direct signal — don't spend your demo on a pretty admin panel for configuring quorum rules. Spend it on what happens when quorum rules collide with reality (approver unavailable, disputed approval, compromised approver device).
3. **Can you reason about failure, not just attack.** Three failure classes are explicitly separated in the doc: attacker-driven failure, no-fault failure (bad wifi, lost device), and unfalsifiable failure (the 2 a.m. "I never approved that" dispute). Most teams will build hard for #1 and forget #2 and #3 exist. The 2 a.m. scenario is really asking: **can your system produce cryptographic proof of who approved what, when, from where — proof strong enough that "he said/she said" becomes verifiable fact?** That's non-repudiation, and it's the single highest-leverage thing you can build.

The three personas (bank customer, exam-deadline student, integrating startup) aren't there to be individually designed for — they're there to stop you from over-optimizing for one axis (security for the bank customer, speed for the student, zero-maintenance API for the startup). The brief says so directly: build for all three equally and you've built for none. Practically this means your core primitives (session, token, approval) need to be tunable per risk-context rather than one-size-fits-all.

---

## 2. Core authentication design

**Primary: WebAuthn / FIDO2 passkeys.** Public-key cryptography bound to a device authenticator (platform: Face ID/Windows Hello, or roaming: security key). This is the only mainstream mechanism that is phishing-resistant by construction — the credential is bound to the origin, so it cannot be replayed against a lookalike domain. No shared secret ever crosses the network, which kills credential stuffing and most token-theft attacks outright.

**Fallback chain (in order of preference, not equal weight):**

1. Passkey (primary)
2. TOTP authenticator app (offline-generated, no network dependency) — for the hotel-wifi scenario, since it works without connectivity to _your_ servers
3. Magic link via email (not SMS) — email is asynchronous and doesn't carry the SIM-swap risk, though it inherits "is their email compromised" risk, which you disclose rather than pretend away
4. Recovery flow (Section 4) for lost-device — the actual hard case the brief is hinting at with _"even something that never leaves your device only stays safe as long as the device itself does."_

**Explicitly do not use SMS OTP as a primary factor.** You can offer it as a last-resort, clearly labeled lower-assurance option, which shows you understand the tradeoff rather than pretending SMS doesn't exist.

**Session model:** short-lived access token (5–15 min) + rotating refresh token, refresh token reuse detection (if a used-and-invalidated refresh token is presented again, that's a signal of theft — kill the whole token family, not just the session). Device-bound refresh tokens (DPoP or mTLS-style proof-of-possession) so a stolen refresh token is useless without the device key.

**Risk-based step-up:** every request carries a computed risk score (new device, new geo, impossible travel, unusual hour, sensitive action). Low risk → silent. Medium → re-prompt passkey. High → require a second approver (this is where auth and the approval system share infrastructure — a deliberate design choice, not two separate subsystems).

---

## 3. Approval system — the actual differentiator

This is where the brief tells you the scoring weight lives, so the design needs to earn it.

**Policy model:** an approval requirement is not "needs approval" (boolean) — it's a **policy object**:

```
ApprovalPolicy {
  action_class          // e.g. "prod_deploy", "wire_transfer", "brand_post"
  quorum: { type: N_of_M | weighted | role_based }
  eligible_approvers    // set or dynamic query (e.g. "role=senior_finance")
  fallback_policy       // what applies if eligible approvers = 0
  expiry                // how long a pending approval lives before auto-escalate/deny
  risk_multiplier       // large txn requires stricter quorum than small txn, same action type
}
```

Key design decision: **the policy is evaluated at request-time against live approver state**, not baked in at setup. This is what handles "what happens when the people who normally approve aren't around" — the policy resolves to a live eligible set, and if that set is empty or below quorum, it falls through a defined escalation chain (backup approver role → break-glass single-senior-approver with mandatory post-hoc review → deny). You never silently let an action through because approvers vanished.

**Non-repudiation (the 2 a.m. problem):** every approval decision is signed by the approver's device key (same passkey infra as login) over a payload that includes the action hash, timestamp, and approver identity. The signature is stored, not just a boolean "approved=true" row in a database an admin could edit. This turns "he said/she said" into "produce the signed receipt" — if no signed receipt exists, the approval didn't happen, full stop, regardless of what a teammate claims in Slack. This single mechanism is worth explaining carefully to judges since it directly answers the scenario they wrote into the brief.

**Delegation & temporary approvers:** delegation is itself an approved, signed, time-boxed action ("Approver A delegates to B, valid until date X, scope limited to action-class Y") — not a config toggle, so delegation abuse is itself auditable.

**Emergency/break-glass approval:** a defined lower-quorum emergency path that is _usable_ but _expensive_ — it fires additional notifications to all other approvers/admins in real time and forces mandatory review within a fixed window. This solves the "3 a.m. prod is on fire and the approver is asleep" case without creating a silent backdoor.

**Fraud/anomaly signals feeding the approval, not replacing it:** AI's legitimate use here is anomaly scoring (unusual amount, unusual approver pattern, velocity) that _raises_ the required quorum or flags for secondary review — never as the approver itself. That's a defensible "AI where it helps, not where it doesn't" story for the judges.

---

## 4. Account recovery (the case most teams skip)

Passwordless systems live or die on recovery UX, and the brief flags this directly. Design:

- Multiple registered passkeys per account (phone + laptop + security key) so single-device loss doesn't lock you out
- If all devices are lost: identity re-verification via a secondary channel (recovery codes generated at signup, stored offline by the user) + a cooldown/notification window (email + push to any surviving registered device: "someone is trying to recover this account") before recovery completes — this is the standard defense against social-engineering-based recovery abuse
- Recovery itself is logged and, for high-value accounts, can itself require approval from a designated trusted contact — reusing the same approval engine

---

## 5. Threat model (high-signal subset)

| Attack                                        | Mitigated by                                                                                                                                                          |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phishing                                      | WebAuthn origin-binding — credential unusable on a lookalike domain                                                                                                   |
| Token/session theft                           | Short-lived access tokens, device-bound refresh tokens, reuse detection                                                                                               |
| SIM swap                                      | No SMS as primary factor                                                                                                                                              |
| MFA fatigue / fake approval push              | Approval requests carry contextual detail (device, location, action) rendered in the request itself, not a bare "approve?" button; number-matching challenge required |
| Replay                                        | Signed, timestamped, single-use approval payloads                                                                                                                     |
| Insider/admin tampering with approval records | Signatures over an append-only log, not mutable DB rows                                                                                                               |
| Race conditions on concurrent approvals       | Quorum evaluation is atomic against an idempotent action ID                                                                                                           |
| API abuse / credential stuffing               | No passwords to stuff; rate limiting + anomaly scoring at gateway                                                                                                     |

Deepfake voice/video approval requests are explicitly out of scope for spoofing your system, since your approvals are cryptographically signed device actions, not phone calls — worth saying this out loud to judges as evidence you considered it and designed it away structurally rather than needing a deepfake-detector bolted on.

---

## 6. Architecture

- **API Gateway** (rate limiting, TLS termination, first-line anomaly scoring)
- **Auth service** — WebAuthn ceremony handling, session/token issuance, risk scoring
- **Approval service** — policy engine, quorum evaluation, delegation, signed-receipt ledger
- **Notification service** — push/email delivery, decoupled via queue so a slow provider never blocks the request path
- **Audit/ledger store** — append-only (e.g. hash-chained log) separate from the operational DB, so even a compromised app-tier can't rewrite history
- Modular monolith to start (hackathon timeline reality), with auth/approval/notification as clearly separated modules behind internal interfaces — structured so it _could_ split into microservices later. Justification: microservices add deployment/ops overhead you don't have time for in a hackathon, but judges will penalize a tangled monolith; a well-modularized monolith gets you both velocity and a credible "here's how this scales" story.
- Postgres for relational/ledger data (transactional integrity matters for approvals), Redis for session/risk-score caching, a queue (e.g. SQS/RabbitMQ) for notification delivery decoupling.

---

## 7. What to actually build vs. talk about in the demo

Given hackathon time constraints, the highest-leverage build order is:

1. Passkey registration + login (core, must work end to end)
2. Approval policy engine with N-of-M quorum + signed receipts (this is your differentiator — protect the time for this)
3. One compelling high-stakes action gated by it (e.g. "approve production deploy" or "approve wire transfer") with a live demo of the disputed-approval scenario resolved by a signed receipt
4. Risk-based step-up as a visible demo moment (login from "new device" triggers step-up)
5. Recovery flow — even a simplified version, since its absence is conspicuous

Everything else in the original deliverables list (full admin UI, multi-region deployment, disaster recovery infra) is worth describing in the architecture doc and README as "designed for, not fully implemented under hackathon time constraints" — judges reward honest scoping over overclaimed, half-working breadth.

---

_Next steps I'd suggest: pick the specific high-stakes demo action, then I can help design the exact DB schema, the WebAuthn + approval API contracts, and the signed-receipt format in detail._
