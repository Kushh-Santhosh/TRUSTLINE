# TrustLine — Live Demo Script

> **Use with the current implementation only.** Clearly label the requester-scoped approval model and mock trust/attack/Judge Mode components as demonstrations; do not claim role enforcement, user-held approval signatures, or externally immutable audit storage. See [the root README](../README.md).

**Total time budget: 3 min 45 sec**
A judge-facing, click-by-click walkthrough. Rehearse until you can complete each segment within its time budget without looking at these notes.

---

## Pre-demo checklist (do this before walking on stage)

- [ ] Stack is running: `./start-demo.sh` completed with ✅
- [ ] Smoke test passes: `docker compose exec backend npm run smoke-test`
- [ ] Browser open to `http://localhost:5173/login`
- [ ] Browser DevTools closed (or tabbed out of sight)
- [ ] Second browser tab pre-opened at `http://localhost:5173/demo/phishing-clone`
- [ ] Font size bumped (Cmd + two or three times so the back row can read it)
- [ ] A demo passkey credential registered for `alice@demo.com` (do this 5 min before)

---

## Segment 1 — Passkey login `[0:00 – 0:45]`

**Page:** `http://localhost:5173/login`

| Step | Action                                                        | Expected                            |
| ---- | ------------------------------------------------------------- | ----------------------------------- |
| 1    | Point at the URL bar — say "this is the real TrustLine login" | Audience oriented                   |
| 2    | Type `alice@demo.com` in the email field                      | Field fills                         |
| 3    | Click **"Sign in with passkey"**                              | OS biometric / touch prompt appears |
| 4    | Authenticate (fingerprint / Face ID / Windows Hello)          | Passkey resolves, request sent      |
| 5    | Dashboard loads at `/dashboard`                               | Session active                      |

**Say:** _"No password was typed. No OTP was sent over SMS. The credential never left Alice's device — there's nothing for a phishing page to steal."_

**If risk engine flags medium/high risk:** a TOTP prompt will appear before the dashboard — continue with Segment 2 naturally. If not, skip ahead.

---

## Segment 2 — Risk-triggered step-up `[0:45 – 1:15]`

> Skip this segment if the dashboard loaded without a TOTP prompt.
> To force a step-up: log out, clear browser storage, log in again from an incognito window — the risk engine will score "new device."

**Page:** TOTP step-up modal (appears after login/verify)

| Step | Action                                                 | Expected                      |
| ---- | ------------------------------------------------------ | ----------------------------- |
| 1    | Show the TOTP entry field                              | Audience sees second factor   |
| 2    | Enter a valid TOTP code from Alice's authenticator app | Code accepted, session issues |
| 3    | Dashboard loads                                        | Full session active           |

**Say:** _"TrustLine scored this login as medium-risk — new device fingerprint, unusual time. It silently added a second factor. No SMS. No email. An offline TOTP that works even on hotel Wi-Fi."_

---

## Segment 3 — Dispute resolution `[1:15 – 2:00]`

**Page:** `http://localhost:5173/demo/dispute`
_(navigate from dashboard, or paste URL directly)_

| Step | Action                                              | Expected                                               |
| ---- | --------------------------------------------------- | ------------------------------------------------------ |
| 1    | Page loads showing a list of past approval requests | Requests panel appears                                 |
| 2    | Click any request card in the list                  | Request detail expands                                 |
| 3    | Click **"Reveal Receipt"**                          | Signed receipt unfolds below                           |
| 4    | Point at the **Signatures** section                 | Each vote shows `approver_id`, `decision`, `signature` |
| 5    | Point at the **Audit Chain** section                | Hash-linked entries are visible                        |

**Say:** _"This is the 2 a.m. problem — 'who actually approved this?' Every vote is Ed25519-signed over the action hash, decision, and timestamp. The signature is stored, not a boolean. If you can't produce this receipt, the approval didn't happen. The hash chain means you can't quietly delete an entry — any gap fails verification."_

**Optional 10-second depth:** _"Run `npm run verify-chain` at any time — it re-computes every hash and exits non-zero if anything was tampered with."_

---

## Segment 4 — Attack mode `[2:00 – 3:00]`

**Page:** `http://localhost:5173/demo/attack`

This page has two sub-demos. Run both.

### 4a — MFA fatigue attack `[2:00 – 2:30]`

| Step | Action                                                                 | Expected                                               |
| ---- | ---------------------------------------------------------------------- | ------------------------------------------------------ |
| 1    | Click **"Simulate MFA Fatigue Attack"** (button id: `btn-mfa-fatigue`) | Progress bar runs through 4 attempts                   |
| 2    | Watch the status column                                                | Attempts 1–3: `401` (failed), Attempt 4: `429 BLOCKED` |

**Say:** _"Real MFA fatigue works by hammering the step-up prompt until the user gives in and approves. TrustLine's rate-limiter blocks after 3 attempts in a 60-second window — the 4th request returns 429 before it even reaches TOTP validation. The attack is dead on arrival."_

### 4b — Replay attack `[2:30 – 3:00]`

| Step | Action                                                              | Expected                                    |
| ---- | ------------------------------------------------------------------- | ------------------------------------------- |
| 1    | Click **"Simulate Replay Attack"** (button id: `btn-replay-attack`) | Two requests fire sequentially              |
| 2    | Watch the result rows                                               | First use: `200 OK`; Replay: `401 REJECTED` |

**Say:** _"Captured a refresh token from the network? The token family system detects reuse. The moment a rotated token is presented a second time, the entire family is killed — not just the one session. The attacker's stolen token is immediately worthless."_

---

## Segment 5 — Phishing-clone demo `[3:00 – 3:45]`

**Switch to the pre-opened tab** at `http://localhost:5173/demo/phishing-clone`

| Step | Action                                                                             | Expected                  |
| ---- | ---------------------------------------------------------------------------------- | ------------------------- |
| 1    | Point at the page — show the domain and the subtly misspelled "Trust**I**ine" logo | Audience notices the tell |
| 2    | Type any email in the field                                                        | Field accepts input       |
| 3    | Click **"Sign in with passkey"**                                                   | WebAuthn flow begins      |
| 4    | Authenticate (or cancel — the result is the same)                                  | Error message appears     |

**Say:** _"WebAuthn is origin-bound. The browser checks the relying party ID against the actual URL — this page is `localhost:5173` with a different origin than the registered credential. The passkey simply refuses to execute. There's no credential to harvest, no password to replay. Phishing this app is structurally impossible, not just difficult."_

**End:** _"Three attack vectors — fatigue, replay, phishing — all demonstrated live, all blocked. That's TrustLine."_

---

## Timing summary

| Segment                      | Duration | Running total |
| ---------------------------- | -------- | ------------- |
| Passkey login                | 45 s     | 0:45          |
| Risk step-up _(conditional)_ | 30 s     | 1:15          |
| Dispute resolution           | 45 s     | 2:00          |
| MFA fatigue attack           | 30 s     | 2:30          |
| Replay attack                | 30 s     | 3:00          |
| Phishing-clone               | 45 s     | 3:45          |
| **Total**                    | **3:45** | —             |

---

## Fallback notes (if something breaks live)

| Problem                                             | Recovery                                                                                                 |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Passkey prompt doesn't appear                       | Reload page; use the "Use a different device" option in the browser dialog                               |
| Dashboard shows TOTP even though you pre-registered | Complete TOTP with the authenticator app; it only adds ~15 s                                             |
| Dispute page shows no requests                      | Run `docker compose exec backend npm run seed` from a side terminal; the seeded policy creates a request |
| Attack demo hangs                                   | Click "Reset" then retry; in-memory state resets on click                                                |
| Phishing page shows no error                        | Confirm you're on the `/demo/phishing-clone` tab, not the real `/login`                                  |

---

## Key one-liners (memorise these)

- **On passkeys:** _"Nothing to steal — the credential never leaves the device."_
- **On non-repudiation:** _"The signed receipt is the proof. No receipt, no approval."_
- **On MFA fatigue:** _"The attack is dead at attempt 4 — before TOTP is even checked."_
- **On replay:** _"Reusing a rotated token kills the entire family, not just that session."_
- **On phishing:** _"Origin-bound credentials. Structurally impossible to phish, not just hard."_
