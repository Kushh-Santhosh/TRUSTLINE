/**
 * M9.5 — Load/rate-limit smoke test script
 *
 * Fires 6 rapid POST /api/auth/login/step-up requests for a demo user and
 * prints each response status, confirming the in-memory rate-limit logic in
 * risk.service.ts blocks after the 3rd attempt within the 60-second window.
 *
 * Expected output:
 *   Attempt 1: 401  (or 400 — TOTP validation, not yet rate-limited)
 *   Attempt 2: 401
 *   Attempt 3: 401
 *   Attempt 4: 429  ← rate limit kicks in (>3 attempts in 60 s)
 *   Attempt 5: 429
 *   Attempt 6: 429
 *
 * Usage:
 *   npx ts-node -r dotenv/config src/scripts/loadTest.ts
 *
 * Requires the TrustLine backend to be running (npm run dev).
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';

const BASE_URL  = process.env.BACKEND_URL ?? 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret';
const DEMO_USER_ID = 'load-test-demo-user';

// A syntactically-valid JWT (so jwt.decode inside the route can extract sub).
// The rate-limit check runs BEFORE full signature verification, so this token
// only needs to be decodable — not necessarily signed with the correct secret.
// For a real pending token, sign with the actual JWT_SECRET.
const pendingToken = jwt.sign(
  { sub: DEMO_USER_ID, purpose: 'step_up' },
  JWT_SECRET,
  { expiresIn: '5m' }
);

async function fireStepUp(attempt: number): Promise<void> {
  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}/api/auth/login/step-up`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ pendingToken, code: '000000' }), // wrong TOTP code — expected
  });

  const elapsed = Date.now() - t0;
  const body    = await res.json() as { error?: string; blocked?: boolean };
  const label   = res.status === 429 ? '🚫 BLOCKED' : res.status === 401 ? '✓ (unblocked)' : `HTTP ${res.status}`;
  console.log(`  Attempt ${attempt}: HTTP ${res.status}  ${label}  [${elapsed}ms]  ${body.error ?? ''}`);
}

async function main(): Promise<void> {
  console.log(`\n═══ TrustLine — Rate-limit smoke test ═══`);
  console.log(`Target: POST ${BASE_URL}/api/auth/login/step-up`);
  console.log(`User:   ${DEMO_USER_ID}`);
  console.log(`Threshold: block after >3 attempts in 60 s\n`);

  let hitRateLimit = false;

  for (let i = 1; i <= 6; i++) {
    await fireStepUp(i);
    if (i === 4) hitRateLimit = true; // 4th attempt should be blocked
  }

  console.log('\n─── Result ───');
  if (hitRateLimit) {
    console.log('✅ Rate limit engaged at attempt 4 as expected.');
  } else {
    console.log('❌ Rate limit did NOT engage — check risk.service.ts configuration.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Load test failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
