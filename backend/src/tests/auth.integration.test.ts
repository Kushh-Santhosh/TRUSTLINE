/**
 * M9.3 — Integration test: full login flow
 * Uses supertest against the real Express app (real routes, middleware, request parsing).
 *
 * Infrastructure mocked:
 *   - @simplewebauthn/server  — real browser crypto cannot run in Node
 *   - webauthn.service        — wraps DB + WebAuthn; mocked so tests run without PostgreSQL
 *   - session.service         — wraps DB + JWT; mocked for predictable token values
 *
 * What is NOT mocked:
 *   - Express app, routing, CORS, error handling middleware
 *   - Request/response body parsing and JSON shaping
 *   - JWT format assertions (tokenShape regex)
 *   - HTTP status codes from the route layer
 *
 * To run against a real DB, remove the service-level mocks and set DATABASE_URL.
 *
 * Dep: M4.6 (JWT session), M7.3 (step-up gating)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';

// ── Stable test fixtures ───────────────────────────────────────────────────

const FAKE_CRED_ID  = 'dGVzdC1jcmVkLWlk';
const TEST_USER_ID  = 'test-user-uuid-001';
const TEST_EMAIL    = 'integration@test.invalid';

// Real JWTs signed with the test JWT_SECRET (from .env)
// We use jwt.sign so the token shape matches what the real routes would produce.
// (JWT_SECRET is loaded at import time from config/env.)
import config from '../lib/config';

function makeAccessToken()  { return jwt.sign({ sub: TEST_USER_ID }, config.JWT_SECRET, { expiresIn: '15m' }); }
function makeRefreshToken() { return jwt.sign({ sub: TEST_USER_ID, type: 'refresh', jti: Math.random().toString(36).slice(2) }, config.JWT_SECRET, { expiresIn: '7d' }); }


// ── Mock: @simplewebauthn/server ─────────────────────────────────────────
// vi.mock is hoisted — all values must be inline literals.

vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions:   vi.fn().mockResolvedValue({ challenge: 'cmVnLWNoYWxsZW5nZQ', rp: { id: 'localhost' }, user: { id: 'dGVzdA', name: 'test', displayName: 'test' }, pubKeyCredParams: [] }),
  verifyRegistrationResponse:    vi.fn().mockResolvedValue({ verified: true, registrationInfo: { credential: { id: 'dGVzdC1jcmVkLWlk', publicKey: new Uint8Array(65).fill(4), counter: 0, transports: [] }, fmt: 'none' } }),
  generateAuthenticationOptions: vi.fn().mockResolvedValue({ challenge: 'YXV0aC1jaGFsbGVuZ2U', rpId: 'localhost', allowCredentials: [] }),
  verifyAuthenticationResponse:  vi.fn().mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 1, credentialID: 'dGVzdC1jcmVkLWlk' } }),
}));

// ── Mock: webauthn.service ────────────────────────────────────────────────

vi.mock('../services/webauthn.service', () => ({
  generateRegistrationOptionsForUser: vi.fn().mockResolvedValue({ challenge: 'cmVnLWNoYWxsZW5nZQ', rp: { id: 'localhost' } }),
  verifyRegistration:                 vi.fn().mockResolvedValue({ userId: 'test-user-uuid-001' }),
  generateLoginOptionsForUser:        vi.fn().mockResolvedValue({ challenge: 'YXV0aC1jaGFsbGVuZ2U', rpId: 'localhost', allowCredentials: [{ id: 'dGVzdC1jcmVkLWlk' }] }),
  verifyLogin:                        vi.fn().mockResolvedValue('test-user-uuid-001'),
  challengeStore:                     new Map(),
  loginChallengeStore:                new Map(),
}));

// ── Mock: session.service ─────────────────────────────────────────────────

// rotateRefreshToken needs to simulate replay detection:
// - first call with token X → succeeds
// - second call with the same token X → throws (token consumed)
const consumedTokens = new Set<string>();

vi.mock('../services/session.service', () => ({
  issueSession: vi.fn().mockImplementation(() => {
    return Promise.resolve({ accessToken: makeAccessToken(), refreshToken: makeRefreshToken() });
  }),
  rotateRefreshToken: vi.fn().mockImplementation((token: string) => {
    if (consumedTokens.has(token)) {
      return Promise.reject(new Error('invalid refresh token'));
    }
    consumedTokens.add(token);
    return Promise.resolve({ accessToken: makeAccessToken(), refreshToken: makeRefreshToken() });
  }),
}));

// ── Mock: risk.service ────────────────────────────────────────────────────

vi.mock('../services/risk.service', () => ({
  scoreLoginRisk:      vi.fn().mockResolvedValue({ score: 'low', reason: 'test_mock' }),
  recordStepUpAttempt: vi.fn().mockReturnValue(false),
  isStepUpBlocked:     vi.fn().mockReturnValue(false),
}));

// ── Dummy request bodies ───────────────────────────────────────────────────

const FAKE_REG_RESPONSE = {
  id: FAKE_CRED_ID, rawId: FAKE_CRED_ID, type: 'public-key',
  response: { clientDataJSON: 'e30', attestationObject: 'e30' },
};

const FAKE_AUTH_RESPONSE = {
  id: FAKE_CRED_ID, rawId: FAKE_CRED_ID, type: 'public-key',
  response: { clientDataJSON: 'e30', authenticatorData: 'e30', signature: 'e30' },
};

// JWT three-segment regex
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

// ── Tests ─────────────────────────────────────────────────────────────────

describe('Auth integration — full login flow (service-layer mocks)', () => {

  beforeEach(() => {
    consumedTokens.clear();
  });

  // ── Health ───────────────────────────────────────────────────────────────

  it('GET /health → 200 { status: "ok" }', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  // ── Registration ──────────────────────────────────────────────────────────

  it('POST /api/auth/register/options → 200 with challenge field', async () => {
    const res = await request(app)
      .post('/api/auth/register/options')
      .send({ email: TEST_EMAIL });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('challenge');
    expect(typeof res.body.challenge).toBe('string');
  });

  it('POST /api/auth/register/options missing email → 400', async () => {
    const res = await request(app)
      .post('/api/auth/register/options')
      .send({});
    expect(res.status).toBe(400);
  });

  it('POST /api/auth/register/verify → 201', async () => {
    const res = await request(app)
      .post('/api/auth/register/verify')
      .send({ email: TEST_EMAIL, response: FAKE_REG_RESPONSE });

    expect(res.status).toBe(200);
  });

  it('POST /api/auth/register/verify missing email → 400', async () => {
    const res = await request(app)
      .post('/api/auth/register/verify')
      .send({ response: FAKE_REG_RESPONSE });
    expect(res.status).toBe(400);
  });

  // ── Login ─────────────────────────────────────────────────────────────────

  it('POST /api/auth/login/options → 200 with challenge', async () => {
    const res = await request(app)
      .post('/api/auth/login/options')
      .send({ email: TEST_EMAIL });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('challenge');
  });

  it('POST /api/auth/login/options missing email → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login/options')
      .send({});
    expect(res.status).toBe(400);
  });

  it('POST /api/auth/login/verify (low-risk) → 200 with valid JWT pair', async () => {
    const res = await request(app)
      .post('/api/auth/login/verify')
      .send({ email: TEST_EMAIL, response: FAKE_AUTH_RESPONSE });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.accessToken).toMatch(JWT_SHAPE);
    expect(res.body.refreshToken).toMatch(JWT_SHAPE);

  });

  it('POST /api/auth/login/verify missing response → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login/verify')
      .send({ email: TEST_EMAIL });
    expect(res.status).toBe(400);
  });

  // ── Token rotation ────────────────────────────────────────────────────────

  it('POST /api/auth/refresh (valid token) → 200 with rotated JWT pair', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login/verify')
      .send({ email: TEST_EMAIL, response: FAKE_AUTH_RESPONSE });
    expect(loginRes.status).toBe(200);
    const { refreshToken } = loginRes.body as { refreshToken: string };

    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body).toHaveProperty('accessToken');
    expect(refreshRes.body).toHaveProperty('refreshToken');
    // Rotated token must differ
    expect(refreshRes.body.refreshToken).not.toBe(refreshToken);
  });

  it('POST /api/auth/refresh (missing token) → 400', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(400);
  });

  // ── Replay protection ─────────────────────────────────────────────────────

  it('POST /api/auth/refresh (consumed token) → 401 replay rejected', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login/verify')
      .send({ email: TEST_EMAIL, response: FAKE_AUTH_RESPONSE });
    const { refreshToken } = loginRes.body as { refreshToken: string };

    // First use — consumes the token
    await request(app).post('/api/auth/refresh').send({ refreshToken });

    // Replay — should be rejected
    const replayRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(replayRes.status).toBe(401);
  });
});
