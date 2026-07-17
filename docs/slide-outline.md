# TrustLine — Slide Deck Outline

> **Format:** bullet outline — slide titles + one-liner content each.
> Hand this to a design tool or presenter to build the actual deck.
> Estimated delivery: **5–7 min** (3:45 live demo + ~2 min framing slides).

---

## Slide 1 — Title

**Title:** TrustLine
**Sub-title:** High-Assurance Authentication & Approval — Built in 24 Hours
**Visual:** TrustLine wordmark on dark background; three icons (passkey shield, quorum vote ring, hash-chain link)
**Speaker note:** Let the title breathe — pause before speaking.

---

## Slide 2 — The real question (problem framing)

**Title:** The Brief's Real Question
**One-liner:** "Who actually approved this, and can you prove it wasn't faked?"
**Bullets:**
- The brief mentions attacker, infrastructure failure, and a 2 a.m. dispute — those are three graded scenarios, not decorative flavour text
- Most teams answer "how do we let a user log in" and stop there
- The unanswered question is **non-repudiation**: proving after the fact who did what, irrefutably

**Visual:** Three scenario cards in a row — 🕵️ Attacker / 🔴 3 a.m. outage / ⚖️ Dispute — each with a red ✗ labeled "most demos can't answer this"
**Speaker note:** *"If you can't answer 'prove the approval happened', you've built a dashboard, not a security system."*

---

## Slide 3 — Why our approach answers it directly

**Title:** Non-Repudiation as the Core Primitive
**One-liner:** Every approval vote is Ed25519-signed over `{action, decision, timestamp}` — the signature is the proof.
**Bullets:**
- Not a boolean `approved = true` in a database an admin can flip
- Signed receipt = cryptographic evidence; no receipt = approval didn't happen
- Hash-chained audit ledger detects any row-level tampering
- Same passkey infrastructure as login — one unified key infrastructure, not two separate systems

**Visual:** Two-column comparison: "Traditional approval" (database row, ✗ editable) vs. "TrustLine" (signed receipt with key icon, ✓ tamper-evident)
**Speaker note:** Linger on the two-column comparison. Judges have seen the boolean approach 20 times today.

---

## Slide 4 — Architecture (one-breath version)

**Title:** Architecture
**One-liner:** Four services, one network, zero passwords.
**Visual:** The ASCII architecture diagram from README.md, converted to a clean block diagram:
```
  Browser (React/Vite)
       │
  Express API ─── Risk engine ─── Step-up (TOTP)
       │
  ┌────┴──────────────────┐
  │ Approval engine       │
  │  Policy → Quorum      │
  │  Ed25519 vote signing │
  └────┬──────────────────┘
       │
  Audit ledger (SHA-256 hash chain)
       │
  PostgreSQL   Redis (refresh-token families)
```
**Bullets:**
- WebAuthn passkeys — phishing-resistant by protocol, not by policy
- Risk scoring drives adaptive step-up — no manual configuration needed
- Quorum policy evaluates at request time against live approver state

**Speaker note:** Keep this brief — 30 seconds. Architecture is context for the demo, not the point.

---

## Slide 5 — Demo cue (transition slide)

**Title:** Let's See It Live
**One-liner:** Five scenarios, 3 min 45 sec — no slides in between.
**Bullets (scenario titles only — appear as the demo runs):**
1. Passkey login (no password typed)
2. Risk-triggered TOTP step-up
3. Dispute resolution — live receipt verification
4. MFA fatigue attack — blocked at attempt 4
5. Phishing clone — credential simply refuses to execute

**Visual:** Countdown bar graphic OR just a clean dark slide with the five bullets numbered
**Speaker note:** *"I'm switching to the app now."* Do not narrate the slide — switch immediately.

---

## Slide 6 — What we deliberately didn't build (and why)

**Title:** Deliberate Omissions
**One-liner:** Every missing feature was a conscious trade-off, not an oversight.
**Table:**

| Not built | Why not |
|---|---|
| SMS OTP | Carrier SIM-swap risk; brief explicitly calls this out as weaker |
| AI fraud model | Hackathon training data doesn't exist; risk scoring is a deterministic heuristic that explains itself |
| Blockchain audit trail | Hash-chained SQL gives identical tamper-evidence without consensus overhead or a running chain |
| Full policy UI | Brief says "we're evaluating your approval design, not the forms an admin fills out" |
| OAuth social login | Delegates trust to a third party — defeats phishing-resistance story |

**Visual:** Table on a dark background; omitted items in muted grey, "Why not" column in accent colour
**Speaker note:** *"Knowing what not to build is engineering judgment. Every one of these was considered and rejected for a specific reason."*

---

## Slide 7 — Closing / results

**Title:** TrustLine — What We Built
**One-liner:** 11 milestones, 75 passing tests, one command to deploy.
**Bullets:**
- ✅ Phishing-resistant passkey login (WebAuthn, FIDO2)
- ✅ Risk-adaptive TOTP step-up (no SMS, no magic links)
- ✅ Quorum approval engine with Ed25519 vote signing
- ✅ Hash-chained audit ledger — tamper-evident by construction
- ✅ Live dispute resolution with cryptographic receipt
- ✅ Three attack demos: MFA fatigue, replay, phishing clone
- ✅ Docker Compose one-command deployment

**Visual:** Metric tiles — `75 tests` · `11 milestones` · `1 command to run`; green accent on all checkmarks
**Speaker note:** End with *"Questions?"* and pull up the terminal — ready to run `npm run verify-chain` or `npm run smoke-test` if a judge wants to probe.

---

## Production notes for deck builder

| Slide | Duration | Visual required |
|-------|----------|-----------------|
| 1 — Title | 10 s | Wordmark + 3 icons |
| 2 — Real question | 40 s | 3 scenario cards with ✗ |
| 3 — Our approach | 50 s | Two-column comparison table |
| 4 — Architecture | 30 s | Block diagram from README |
| 5 — Demo cue | 5 s | Dark slide, numbered list |
| — **Live demo** — | 3 min 45 s | Browser — no slide |
| 6 — Omissions | 30 s | 5-row table |
| 7 — Closing | 20 s | Metric tiles |
| **Total** | **~6 min 30 s** | |

**Theme:** Dark background (`#0f0f13`), accent `#6c63ff`, success green `#22c55e`, danger `#f87171` — matches the live app's colour palette so there's no visual whiplash switching between slides and demo.
