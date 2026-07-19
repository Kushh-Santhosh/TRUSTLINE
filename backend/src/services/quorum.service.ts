// Quorum evaluation — pure, deterministic, no database access.
//
// Supported quorum_type values:
//   n_of_m        — approved when quorum_n approve-votes exist;
//                   denied when remaining votes can't reach quorum_n.
//   single_senior — approved on first approve, denied on first deny.
//   role_weighted — role eligibility checked at submission; resolved by count
//                   using n_of_m semantics.

// ── Types ─────────────────────────────────────────────────────────────────

export type QuorumResult = 'approved' | 'denied' | 'pending';

export interface QuorumPolicy {
  quorum_type: string;
  quorum_n: number | null;
  quorum_m: number | null;
}

export interface Vote {
  decision: 'approve' | 'deny';
}

// ── evaluateQuorum ────────────────────────────────────────────────────────
export function evaluateQuorum(policy: QuorumPolicy, votes: Vote[]): QuorumResult {
  const approveCount = votes.filter((v) => v.decision === 'approve').length;
  const denyCount = votes.filter((v) => v.decision === 'deny').length;

  switch (policy.quorum_type) {
    case 'n_of_m': {
      const n = policy.quorum_n ?? 1;
      const m = policy.quorum_m ?? 1;

      if (approveCount >= n) return 'approved';

      // Quorum is mathematically impossible: remaining potential votes + existing
      // approvals can never reach n, so deny is the only possible outcome.
      const votesRemaining = m - approveCount - denyCount;
      if (approveCount + votesRemaining < n) return 'denied';

      return 'pending';
    }

    case 'single_senior': {
      // A single senior approver's vote is decisive in either direction.
      if (approveCount >= 1) return 'approved';
      if (denyCount >= 1) return 'denied';
      return 'pending';
    }

    case 'role_weighted': {
      // Role eligibility is enforced at vote-submission time (M5.4).
      // Here we evaluate purely by count using n_of_m semantics.
      const n = policy.quorum_n ?? 1;
      const m = policy.quorum_m ?? 1;

      if (approveCount >= n) return 'approved';

      const votesRemaining = m - approveCount - denyCount;
      if (approveCount + votesRemaining < n) return 'denied';

      return 'pending';
    }

    default:
      throw new Error(`unsupported quorum_type: "${policy.quorum_type}"`);
  }
}
