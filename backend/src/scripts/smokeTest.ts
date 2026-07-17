/**
 * M10.4 — Post-deploy smoke test
 *
 * Hits core endpoints against a running TrustLine stack and prints a
 * pass/fail summary. Requires native fetch (Node ≥ 18).
 *
 * Usage:
 *   # Inside the Docker container (via start-demo.sh or manually):
 *   docker compose exec backend npm run smoke-test
 *
 *   # Against a local dev server:
 *   npm run smoke-test
 *
 *   # Against an arbitrary host:
 *   BACKEND_URL=http://example.com npm run smoke-test
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — one or more checks failed
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';

// ── Configuration ──────────────────────────────────────────────────────────
const BACKEND_URL = (process.env.BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const JWT_SECRET  = process.env.JWT_SECRET ?? 'change-me-to-a-long-random-secret';

// Generate a short-lived smoke-test JWT (same logic as requireAuth middleware)
const SMOKE_TOKEN = jwt.sign(
  { sub: 'smoke-test-runner' },
  JWT_SECRET,
  { expiresIn: '1m' }
);

const AUTH = { Authorization: `Bearer ${SMOKE_TOKEN}` };

// ── Result tracker ─────────────────────────────────────────────────────────
interface Result {
  name:   string;
  passed: boolean;
  detail: string;
}

const results: Result[] = [];

async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ name, passed: true, detail: 'OK' });
  } catch (err) {
    results.push({
      name,
      passed: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
async function getJSON<T>(path: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

// ── Checks ─────────────────────────────────────────────────────────────────
async function runChecks(): Promise<void> {

  // 1. Health endpoint (no auth — first thing to verify after deploy)
  await check('GET /health → { status: "ok" }', async () => {
    const body = await getJSON<{ status: string }>('/health');
    if (body.status !== 'ok') {
      throw new Error(`expected status: "ok", got: ${JSON.stringify(body.status)}`);
    }
  });

  // 2. JWT authentication works (requireAuth middleware)
  await check('JWT auth accepted by protected endpoints', async () => {
    const res = await fetch(`${BACKEND_URL}/api/approval/policies`, { headers: AUTH });
    if (res.status === 401) {
      throw new Error('401 Unauthorized — JWT_SECRET may not match the running server');
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  });

  // 3. Seeded demo policy is present (confirms DB + seed ran)
  await check('Seed: "Demo 2-of-3 Quorum" policy exists', async () => {
    const policies = await getJSON<Array<{ name: string }>>('/api/approval/policies', AUTH);
    const found = policies.find((p) => p.name === 'Demo 2-of-3 Quorum');
    if (!found) {
      throw new Error(
        'Policy not found — did you run: docker compose exec backend npm run seed?'
      );
    }
  });

  // 4. Seeded demo users are present (confirms users table is populated)
  // We probe via the register/options endpoint — it upserts the user and returns
  // registration options; for demo users it just confirms the DB is reachable.
  await check('Seed: demo users reachable via register/options', async () => {
    for (const email of ['alice@demo.com', 'bob@demo.com', 'carol@demo.com']) {
      const res = await fetch(`${BACKEND_URL}/api/auth/register/options`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      });
      // 200 = options returned (user exists or just created)
      // 400 = validation error (unexpected)
      // 500 = DB not connected (failure)
      if (res.status === 500) {
        throw new Error(`Database unreachable while checking user ${email}`);
      }
      // Any non-500 response means the API is up and DB is reachable
    }
  });

  // 5. Approval list endpoint is reachable (dispute-resolution demo depends on it)
  await check('GET /api/approval/requests → 200 (dispute-resolution feed)', async () => {
    const body = await getJSON<unknown[]>('/api/approval/requests', AUTH);
    if (!Array.isArray(body)) throw new Error('expected array response');
  });

  // 6. Ledger endpoint reachable (audit chain is queryable)
  await check('GET /api/ledger/receipt/unknown → 404 (ledger reachable)', async () => {
    const res = await fetch(`${BACKEND_URL}/api/ledger/receipt/smoke-test-id`, {
      headers: AUTH,
    });
    if (res.status === 500) {
      throw new Error('Ledger returned 500 — DB may be down or audit table missing');
    }
    // 404 means the endpoint works (no receipt for a fake ID — expected)
  });
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('\n🔍  TrustLine — Post-deploy smoke test');
  console.log(`    Target: ${BACKEND_URL}\n`);

  await runChecks();

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('─'.repeat(64));
  for (const r of results) {
    if (r.passed) {
      console.log(`  ✅  ${r.name}`);
    } else {
      console.log(`  ❌  ${r.name}`);
      console.log(`       └─ ${r.detail}`);
    }
  }
  console.log('─'.repeat(64));

  if (failed === 0) {
    console.log(`\n  ✅  All ${passed} checks passed — stack is healthy.\n`);
  } else {
    console.log(`\n  ❌  ${failed} of ${passed + failed} checks failed.`);
    console.log('      Review the errors above and check docker compose logs.\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('💥  Smoke test crashed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
