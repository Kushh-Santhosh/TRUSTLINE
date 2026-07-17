/**
 * M9.1 — Unit tests: quorum evaluation
 * Tests the existing `evaluateQuorum` function in quorum.service.ts.
 * All tests are deterministic and isolated — no database access.
 *
 * Playbook-required cases:
 *   1. 2-of-3 policy, 2 approves → 'approved'
 *   2. 2-of-3 policy, 2 denies  → 'denied'
 *   3. 2-of-3 policy, 1 approve → 'pending'
 *   4. 3-of-3 policy, 1 deny    → 'denied' (can't reach quorum)
 */
import { describe, it, expect } from 'vitest';
import { evaluateQuorum, type QuorumPolicy, type Vote } from './quorum.service';

// ── helpers ───────────────────────────────────────────────────────────────

const approve = (): Vote => ({ decision: 'approve' });
const deny    = (): Vote => ({ decision: 'deny' });

function nOfM(n: number, m: number): QuorumPolicy {
  return { quorum_type: 'n_of_m', quorum_n: n, quorum_m: m };
}

function singleSenior(): QuorumPolicy {
  return { quorum_type: 'single_senior', quorum_n: null, quorum_m: null };
}

// ── M9.1 playbook-required cases ─────────────────────────────────────────

describe('evaluateQuorum — n_of_m', () => {

  it('2-of-3: 2 approves → approved', () => {
    expect(evaluateQuorum(nOfM(2, 3), [approve(), approve()])).toBe('approved');
  });

  it('2-of-3: 2 denies → denied (quorum unreachable)', () => {
    expect(evaluateQuorum(nOfM(2, 3), [deny(), deny()])).toBe('denied');
  });

  it('2-of-3: 1 approve only → pending', () => {
    expect(evaluateQuorum(nOfM(2, 3), [approve()])).toBe('pending');
  });

  it('3-of-3: 1 deny → denied (quorum mathematically impossible)', () => {
    // approveCount=0, denyCount=1, votesRemaining=2 → max reachable=2 < 3
    expect(evaluateQuorum(nOfM(3, 3), [deny()])).toBe('denied');
  });

  // ── Additional edge cases ─────────────────────────────────────────────

  it('1-of-1: 1 approve → approved', () => {
    expect(evaluateQuorum(nOfM(1, 1), [approve()])).toBe('approved');
  });

  it('1-of-1: 1 deny → denied', () => {
    expect(evaluateQuorum(nOfM(1, 1), [deny()])).toBe('denied');
  });

  it('1-of-1: no votes → pending', () => {
    expect(evaluateQuorum(nOfM(1, 1), [])).toBe('pending');
  });

  it('3-of-3: 3 approves → approved', () => {
    expect(evaluateQuorum(nOfM(3, 3), [approve(), approve(), approve()])).toBe('approved');
  });

  it('3-of-3: 2 approves, 0 denies → pending (1 vote remaining can push over)', () => {
    // approveCount=2, denyCount=0, votesRemaining=1 → max reachable=3 >= 3 → pending
    expect(evaluateQuorum(nOfM(3, 3), [approve(), approve()])).toBe('pending');
  });

  it('2-of-4: 1 approve, 3 denies → denied (approves + remaining=0 < 2)', () => {
    // approveCount=1, denyCount=3, votesRemaining=0 → max reachable=1 < 2
    expect(evaluateQuorum(nOfM(2, 4), [approve(), deny(), deny(), deny()])).toBe('denied');
  });

  it('2-of-4: 1 approve, 1 deny, 2 remaining → pending', () => {
    // approveCount=1, denyCount=1, votesRemaining=2 → max reachable=3 >= 2 → pending
    expect(evaluateQuorum(nOfM(2, 4), [approve(), deny()])).toBe('pending');
  });

  it('returns approved even with mixed votes once n threshold is met', () => {
    // 2 approves even though 1 deny — approved because quorum_n=2 reached
    expect(evaluateQuorum(nOfM(2, 3), [approve(), approve(), deny()])).toBe('approved');
  });
});

// ── single_senior ─────────────────────────────────────────────────────────

describe('evaluateQuorum — single_senior', () => {

  it('1 approve → approved', () => {
    expect(evaluateQuorum(singleSenior(), [approve()])).toBe('approved');
  });

  it('1 deny → denied', () => {
    expect(evaluateQuorum(singleSenior(), [deny()])).toBe('denied');
  });

  it('no votes → pending', () => {
    expect(evaluateQuorum(singleSenior(), [])).toBe('pending');
  });
});

// ── role_weighted (n_of_m semantics) ─────────────────────────────────────

describe('evaluateQuorum — role_weighted', () => {

  const roleWeighted = (n: number, m: number): QuorumPolicy => ({
    quorum_type: 'role_weighted', quorum_n: n, quorum_m: m,
  });

  it('2-of-3 role_weighted: 2 approves → approved', () => {
    expect(evaluateQuorum(roleWeighted(2, 3), [approve(), approve()])).toBe('approved');
  });

  it('2-of-3 role_weighted: 2 denies → denied', () => {
    expect(evaluateQuorum(roleWeighted(2, 3), [deny(), deny()])).toBe('denied');
  });

  it('2-of-3 role_weighted: 1 approve → pending', () => {
    expect(evaluateQuorum(roleWeighted(2, 3), [approve()])).toBe('pending');
  });
});

// ── error path ────────────────────────────────────────────────────────────

describe('evaluateQuorum — unsupported quorum type', () => {

  it('throws for an unrecognised quorum_type', () => {
    const policy: QuorumPolicy = { quorum_type: 'unknown', quorum_n: 1, quorum_m: 1 };
    expect(() => evaluateQuorum(policy, [])).toThrow('unsupported quorum_type: "unknown"');
  });
});
