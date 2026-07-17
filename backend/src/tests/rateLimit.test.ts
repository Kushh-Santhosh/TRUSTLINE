/**
 * M9.5 — Rate-limit smoke test (vitest / supertest)
 *
 * Tests the real in-memory rate limiter in risk.service.ts via the
 * POST /api/auth/login/step-up Express route.
 *
 * What is NOT mocked:
 *   - risk.service (recordStepUpAttempt, isStepUpBlocked) — the subject under test
 *   - requireAuth / JWT parsing — real middleware runs
 *
 * What IS mocked:
 *   - session.service.issueSession — prevents DB access on success path
 *   - totp.service.verifyCode — always throws (TOTP fails before issue)
 *
 * Rate-limit rule (risk.service.ts):
 *   STEP_UP_MAX_ATTEMPTS = 3
 *   STEP_UP_WINDOW_MS    = 60_000 ms
 *   Block condition: prev.length > 3  →  4th+ attempt → 429
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import config from '../lib/config';
import { recordStepUpAttempt, isStepUpBlocked } from '../services/risk.service';

// ── Mock dependencies that touch DB or real TOTP secrets ─────────────────
// totp.service.verifyCode always rejects — TOTP validation fails.
// This means requests 1-3 get 401 (not blocked) and 4+ get 429 (rate-limited).

vi.mock('../services/session.service', () => ({
  issueSession:        vi.fn().mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' }),
  rotateRefreshToken:  vi.fn().mockResolvedValue({ accessToken: 'at', refreshToken: 'rt2' }),
}));

vi.mock('../services/totp.service', () => ({
  verifyCode: vi.fn().mockRejectedValue(new Error('TOTP verification failed')),
}));

// ── Helpers ───────────────────────────────────────────────────────────────

function makePendingToken(sub: string): string {
  return jwt.sign({ sub, purpose: 'step_up' }, config.JWT_SECRET, { expiresIn: '5m' });
}

/** POST /login/step-up with a syntactically valid pending token. */
async function stepUp(pendingToken: string) {
  return request(app)
    .post('/api/auth/login/step-up')
    .send({ pendingToken, code: '000000' }); // wrong TOTP — expected
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('Rate-limit smoke test — POST /api/auth/login/step-up', () => {

  // Each test uses a unique userId so the in-memory Map starts fresh.
  let userId: string;
  let pendingToken: string;

  beforeEach(() => {
    userId = `load-test-user-${Math.random().toString(36).slice(2)}`;
    pendingToken = makePendingToken(userId);
  });

  // ── Unit-level rate-limit logic ───────────────────────────────────────────

  it('recordStepUpAttempt: first 3 calls return false (not blocked)', () => {
    const uid = `unit-${Math.random().toString(36).slice(2)}`;
    expect(recordStepUpAttempt(uid)).toBe(false); // 1 ≤ 3
    expect(recordStepUpAttempt(uid)).toBe(false); // 2 ≤ 3
    expect(recordStepUpAttempt(uid)).toBe(false); // 3 ≤ 3
  });

  it('recordStepUpAttempt: 4th call returns true (blocked)', () => {
    const uid = `unit-${Math.random().toString(36).slice(2)}`;
    recordStepUpAttempt(uid); // 1
    recordStepUpAttempt(uid); // 2
    recordStepUpAttempt(uid); // 3
    expect(recordStepUpAttempt(uid)).toBe(true); // 4 > 3 → blocked
  });

  it('isStepUpBlocked: false before threshold, true after', () => {
    const uid = `unit-${Math.random().toString(36).slice(2)}`;
    expect(isStepUpBlocked(uid)).toBe(false);
    recordStepUpAttempt(uid); recordStepUpAttempt(uid);
    recordStepUpAttempt(uid); recordStepUpAttempt(uid); // 4 attempts total
    expect(isStepUpBlocked(uid)).toBe(true);
  });

  // ── Route-level integration ───────────────────────────────────────────────

  it('attempts 1-3: not rate-limited (HTTP 401 TOTP fail, not 429)', async () => {
    const results: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await stepUp(pendingToken);
      results.push(res.status);
    }
    // All 3 should be non-429 (TOTP failure → 401)
    for (const status of results) {
      expect(status).not.toBe(429);
    }
    expect(results).toHaveLength(3);
  });

  it('attempt 4: rate limit engages → HTTP 429', async () => {
    for (let i = 0; i < 3; i++) {
      await stepUp(pendingToken); // consume 3 slots
    }
    const blocked = await stepUp(pendingToken); // 4th
    expect(blocked.status).toBe(429);
    expect(blocked.body).toHaveProperty('blocked', true);
    expect(blocked.body.error).toMatch(/too many step-up attempts/i);
  });

  it('attempts 5-6: remain blocked after 4th → HTTP 429', async () => {
    for (let i = 0; i < 4; i++) {
      await stepUp(pendingToken); // 1-3 unblocked, 4th blocked
    }
    const res5 = await stepUp(pendingToken);
    const res6 = await stepUp(pendingToken);
    expect(res5.status).toBe(429);
    expect(res6.status).toBe(429);
  });

  it('error response has correct shape: { blocked: true, error: string }', async () => {
    for (let i = 0; i < 4; i++) await stepUp(pendingToken);
    const res = await stepUp(pendingToken);
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ blocked: true, error: expect.any(String) });
  });

  it('different users get independent rate-limit counters', async () => {
    const userA = makePendingToken(`userA-${Math.random().toString(36).slice(2)}`);
    const userB = makePendingToken(`userB-${Math.random().toString(36).slice(2)}`);

    // Saturate user A (4 attempts)
    for (let i = 0; i < 4; i++) await request(app).post('/api/auth/login/step-up').send({ pendingToken: userA, code: '000000' });

    // User A should be blocked
    const resA = await request(app).post('/api/auth/login/step-up').send({ pendingToken: userA, code: '000000' });
    expect(resA.status).toBe(429);

    // User B should NOT be blocked (independent counter)
    const resB = await request(app).post('/api/auth/login/step-up').send({ pendingToken: userB, code: '000000' });
    expect(resB.status).not.toBe(429);
  });

  it('missing pendingToken → 400 (not affected by rate limiter)', async () => {
    const res = await request(app).post('/api/auth/login/step-up').send({ code: '123456' });
    expect(res.status).toBe(400);
  });

  it('missing code → 400 (not affected by rate limiter)', async () => {
    const res = await request(app).post('/api/auth/login/step-up').send({ pendingToken });
    expect(res.status).toBe(400);
  });
});
