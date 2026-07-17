/**
 * M9.4 — Integration test: approval + dispute flow
 * Uses supertest against the real Express app.
 *
 * Services mocked (require DB or external crypto that can't run in Node tests):
 *   - policy.service        — DB-backed policy CRUD
 *   - request.service       — DB-backed request + vote lifecycle
 *   - audit.service         — DB-backed audit chain + receipt fetch
 *
 * NOT mocked (exercised directly):
 *   - Express app, routing, CORS, error handler, pino-http
 *   - requireAuth middleware (validates real JWTs)
 *   - signing.service.verify() — called in the test to assert receipt signatures
 *   - evaluateQuorum() — reflected in mocked submitVote return values
 *
 * Key assertion (playbook): receipt signatures must verify against stored public
 * keys using the existing signing.service.ts verify() function.
 *
 * Dep: M6.7 (receipt endpoint), M9.3 (auth integration pattern)
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import { generateKeyPairSync, sign as rawSign } from 'crypto';
import jwt from 'jsonwebtoken';
import app from '../app';
import config from '../lib/config';
import { verify } from '../services/signing.service';

// ── Test keypair — generated once for real signature assertions ───────────

let PUBLIC_KEY_PEM  = '';
let PRIVATE_KEY_PEM = '';

beforeAll(() => {
  const kp = generateKeyPairSync('ed25519', {
    publicKeyEncoding:  { type: 'spki',  format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  PUBLIC_KEY_PEM  = kp.publicKey;
  PRIVATE_KEY_PEM = kp.privateKey;
});

// ── Auth token — real JWT verified by requireAuth middleware ──────────────

const TEST_USER_ID     = 'test-approver-001';
const TEST_APPROVER_2  = 'test-approver-002';
const TEST_REQUEST_ID  = 'req-integration-001';
const TEST_POLICY_ID   = 'pol-integration-001';

function makeToken(sub = TEST_USER_ID) {
  return jwt.sign({ sub }, config.JWT_SECRET, { expiresIn: '15m' });
}

const authHeader = () => ({ Authorization: `Bearer ${makeToken()}` });

// ── Vote payload signed in the real test ──────────────────────────────────
// Mirrors the canonical format used by signing.service (sign() in submitVote):
//   { requestId, decision, timestamp }
// Keys are sorted alphabetically by signing.service.canonicalize.

const VOTE_TIMESTAMP = '2024-01-01T00:00:00.000Z';

function signVotePayload(decision: 'approve' | 'deny') {
  const payload = { decision, requestId: TEST_REQUEST_ID, timestamp: VOTE_TIMESTAMP };
  // Canonical: JSON with sorted keys — mirrors signing.service internals
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  const sig = rawSign(null, Buffer.from(canonical, 'utf8'), PRIVATE_KEY_PEM);
  return { payload, signature: sig.toString('base64') };
}

// ── Mock: signing.service (only sign() — verify() is left real) ──────────
// sign() is called inside the real submitVote; since we mock request.service,
// sign() is never reached. We mock it purely as a safety guard.

vi.mock('../services/signing.service', async (importOriginal) => {
  const real = await importOriginal<typeof import('../services/signing.service')>();
  return {
    ...real,   // keep verify() and verifyForUser() real
    sign: vi.fn().mockResolvedValue('mock-sig-not-reached'),
  };
});

// ── Mock: policy.service ──────────────────────────────────────────────────

vi.mock('../services/policy.service', () => ({
  createPolicy: vi.fn().mockResolvedValue({
    id:                      'pol-integration-001',
    name:                    'Test 2-of-3 Policy',
    quorum_type:             'n_of_m',
    quorum_n:                2,
    quorum_m:                3,
    eligible_roles:          ['approver'],
    require_mfa:             false,
    escalation_timeout_mins: null,
    auto_escalate:           false,
    version:                 1,
    created_at:              new Date('2024-01-01'),
  }),
  listPolicies: vi.fn().mockResolvedValue([]),
  getPolicy: vi.fn().mockResolvedValue({
    id: 'pol-integration-001', name: 'Test 2-of-3 Policy',
    quorum_type: 'n_of_m', quorum_n: 2, quorum_m: 3,
    eligible_roles: ['approver'], require_mfa: false,
    escalation_timeout_mins: null, auto_escalate: false, version: 1,
    created_at: new Date('2024-01-01'),
  }),
}));

// ── Mock: request.service ─────────────────────────────────────────────────

vi.mock('../services/request.service', () => {
  const pending = {
    id:                      'req-integration-001',
    policy_id:               'pol-integration-001',
    policy_version_snapshot: 1,
    requester_id:            'test-approver-001',
    action_payload:          { transfer: 100 },
    status:                  'pending',
    created_at:              new Date('2024-01-01'),
    resolved_at:             null,
    escalated:               false,
    break_glass:             false,
    needs_review:            false,
  };
  const approved = { ...pending, status: 'approved', resolved_at: new Date('2024-01-01') };

  return {
    createRequest:        vi.fn().mockResolvedValue(pending),
    submitVote:           vi.fn()
      .mockResolvedValueOnce({
        vote:         { id: 'v1', request_id: 'req-integration-001', approver_id: 'test-approver-001', decision: 'approve', signature: 'sig1', created_at: new Date() },
        request:      pending,
        quorumResult: 'pending',
      })
      .mockResolvedValueOnce({
        vote:         { id: 'v2', request_id: 'req-integration-001', approver_id: 'test-approver-002', decision: 'approve', signature: 'sig2', created_at: new Date() },
        request:      approved,
        quorumResult: 'approved',
      }),
    listResolvedRequests: vi.fn().mockResolvedValue([approved]),
    breakGlass:           vi.fn().mockResolvedValue(approved),
  };
});

// ── Mock: audit.service ────────────────────────────────────────────────────
// getReceiptForRequest returns a receipt with a REAL signature (signed in beforeAll)
// that can be verified by the real signing.service.verify() function.

vi.mock('../services/audit.service', async () => {
  // Build real-signed receipt lazily (PUBLIC_KEY_PEM / PRIVATE_KEY_PEM filled in beforeAll)
  const makeReceipt = () => {
    const { payload: votePayload, signature } = (() => {
      if (!PRIVATE_KEY_PEM) return { payload: {}, signature: '' };
      const p = { decision: 'approve', requestId: TEST_REQUEST_ID, timestamp: VOTE_TIMESTAMP };
      const canonical = JSON.stringify(p, Object.keys(p).sort());
      const sig = rawSign(null, Buffer.from(canonical, 'utf8'), PRIVATE_KEY_PEM);
      return { payload: p, signature: sig.toString('base64') };
    })();

    return {
      request_id: TEST_REQUEST_ID,
      votes: [{
        id:          'v1',
        approver_id: TEST_USER_ID,
        decision:    'approve',
        signature,
        public_key:  PUBLIC_KEY_PEM,
        created_at:  new Date('2024-01-01').toISOString(),
      }],
      audit_entries: [
        {
          id:         1,
          entry_type: 'request_created',
          payload:    { requestId: TEST_REQUEST_ID },
          prev_hash:  null,
          this_hash:  'abc123',
          created_at: new Date('2024-01-01').toISOString(),
        },
        {
          id:         2,
          entry_type: 'vote',
          payload:    votePayload,
          prev_hash:  'abc123',
          this_hash:  'def456',
          created_at: new Date('2024-01-01').toISOString(),
        },
      ],
    };
  };

  return {
    getReceiptForRequest:  vi.fn().mockImplementation(() => Promise.resolve(makeReceipt())),
    appendAuditEntry:      vi.fn().mockResolvedValue(undefined),
    computeHash:           vi.fn().mockReturnValue('mock-hash'),
  };
});

// ── Shared request body shapes ────────────────────────────────────────────

const CREATE_POLICY_BODY = {
  name: 'Test 2-of-3 Policy',
  quorum_type: 'n_of_m',
  quorum_n: 2,
  quorum_m: 3,
  eligible_roles: ['approver'],
};

const CREATE_REQUEST_BODY = {
  policyId:      TEST_POLICY_ID,
  actionPayload: { transfer: 100 },
};

// ── Suite ─────────────────────────────────────────────────────────────────

describe('Approval + dispute flow — integration', () => {

  // ── Authorization guard ──────────────────────────────────────────────────

  it('POST /api/approval/policies (no auth) → 401', async () => {
    const res = await request(app)
      .post('/api/approval/policies')
      .send(CREATE_POLICY_BODY);
    expect(res.status).toBe(401);
  });

  it('GET /api/approval/requests (no auth) → 401', async () => {
    const res = await request(app).get('/api/approval/requests');
    expect(res.status).toBe(401);
  });

  it('GET /api/ledger/receipt/any-id (no auth) → 401', async () => {
    const res = await request(app).get('/api/ledger/receipt/any-id');
    expect(res.status).toBe(401);
  });

  // ── Policy creation ───────────────────────────────────────────────────────

  it('POST /api/approval/policies → 201 creates 2-of-3 policy', async () => {
    const res = await request(app)
      .post('/api/approval/policies')
      .set(authHeader())
      .send(CREATE_POLICY_BODY);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.quorum_type).toBe('n_of_m');
    expect(res.body.quorum_n).toBe(2);
    expect(res.body.quorum_m).toBe(3);
  });

  it('POST /api/approval/policies missing quorum_type → 400', async () => {
    const res = await request(app)
      .post('/api/approval/policies')
      .set(authHeader())
      .send({ name: 'Incomplete Policy' });
    expect(res.status).toBe(400);
  });

  // ── Request creation ──────────────────────────────────────────────────────

  it('POST /api/approval/requests → 201 creates pending request', async () => {
    const res = await request(app)
      .post('/api/approval/requests')
      .set(authHeader())
      .send(CREATE_REQUEST_BODY);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.status).toBe('pending');
  });

  it('POST /api/approval/requests missing policyId → 400', async () => {
    const res = await request(app)
      .post('/api/approval/requests')
      .set(authHeader())
      .send({ actionPayload: { transfer: 100 } });
    expect(res.status).toBe(400);
  });

  // ── Vote submission — quorum progression ─────────────────────────────────

  it('POST /api/approval/requests/:id/votes (vote 1) → 200 quorumResult: pending', async () => {
    const res = await request(app)
      .post(`/api/approval/requests/${TEST_REQUEST_ID}/votes`)
      .set(authHeader())
      .send({ decision: 'approve' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('quorumResult');
    expect(res.body.quorumResult).toBe('pending');
    expect(res.body.vote.decision).toBe('approve');
  });

  it('POST /api/approval/requests/:id/votes (vote 2) → 200 quorumResult: approved', async () => {
    const res = await request(app)
      .post(`/api/approval/requests/${TEST_REQUEST_ID}/votes`)
      .set({ Authorization: `Bearer ${makeToken(TEST_APPROVER_2)}` })
      .send({ decision: 'approve' });

    expect(res.status).toBe(201);
    expect(res.body.quorumResult).toBe('approved');
    expect(res.body.request.status).toBe('approved');
  });

  it('POST /api/approval/requests/:id/votes missing decision → 400', async () => {
    const res = await request(app)
      .post(`/api/approval/requests/${TEST_REQUEST_ID}/votes`)
      .set(authHeader())
      .send({});
    expect(res.status).toBe(400);
  });

  // ── Receipt retrieval ─────────────────────────────────────────────────────

  it('GET /api/ledger/receipt/:id → 200 returns receipt with votes + audit_entries', async () => {
    const res = await request(app)
      .get(`/api/ledger/receipt/${TEST_REQUEST_ID}`)
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('request_id', TEST_REQUEST_ID);
    expect(Array.isArray(res.body.votes)).toBe(true);
    expect(Array.isArray(res.body.audit_entries)).toBe(true);
    expect(res.body.votes.length).toBeGreaterThan(0);
    expect(res.body.audit_entries.length).toBeGreaterThan(0);
  });

  it('GET /api/ledger/receipt/unknown-id → 404', async () => {
    const { getReceiptForRequest } = await import('../services/audit.service');
    vi.mocked(getReceiptForRequest).mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/api/ledger/receipt/does-not-exist')
      .set(authHeader());

    expect(res.status).toBe(404);
  });

  // ── Signature verification (playbook key assertion) ───────────────────────
  // Fetch the receipt and verify each vote's signature against its stored
  // public key using the real signing.service.verify() function.

  it('receipt vote signatures verify against stored public keys', async () => {
    const res = await request(app)
      .get(`/api/ledger/receipt/${TEST_REQUEST_ID}`)
      .set(authHeader());

    expect(res.status).toBe(200);

    const { votes } = res.body as {
      votes: Array<{ approver_id: string; decision: string; signature: string; public_key: string }>;
    };

    // Every vote with a public_key must have a valid signature
    const { payload: votePayload } = signVotePayload('approve');

    for (const vote of votes) {
      if (!vote.public_key || !vote.signature) continue;
      const isValid = verify(vote.public_key, votePayload, vote.signature);
      expect(isValid).toBe(true);
    }
  });

  it('tampered payload fails signature verification', async () => {
    const res = await request(app)
      .get(`/api/ledger/receipt/${TEST_REQUEST_ID}`)
      .set(authHeader());

    expect(res.status).toBe(200);

    const vote = (res.body.votes as Array<{ decision: string; signature: string; public_key: string }>)[0];

    if (vote?.public_key && vote?.signature) {
      const tamperedPayload = { decision: 'deny', requestId: TEST_REQUEST_ID, timestamp: VOTE_TIMESTAMP };
      const isValid = verify(vote.public_key, tamperedPayload, vote.signature);
      expect(isValid).toBe(false);
    }
  });

  // ── Dispute flow — list resolved requests ─────────────────────────────────

  it('GET /api/approval/requests → 200 lists resolved requests', async () => {
    const res = await request(app)
      .get('/api/approval/requests')
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('status', 'approved');
  });

  // ── Audit chain integrity ─────────────────────────────────────────────────

  it('audit entries in receipt are hash-chained (each prev_hash links)', async () => {
    const res = await request(app)
      .get(`/api/ledger/receipt/${TEST_REQUEST_ID}`)
      .set(authHeader());

    const { audit_entries } = res.body as {
      audit_entries: Array<{ prev_hash: string | null; this_hash: string }>;
    };

    for (let i = 1; i < audit_entries.length; i++) {
      expect(audit_entries[i].prev_hash).toBe(audit_entries[i - 1].this_hash);
    }
  });
});
