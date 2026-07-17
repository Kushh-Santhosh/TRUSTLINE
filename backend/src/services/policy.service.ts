/**
 * M5.1 — Approval policy service
 * CRUD operations for the approval_policies table.
 */
import pool from '../db/pool';

// ── Types ─────────────────────────────────────────────────────────────────

export interface PolicyRow {
  id: string;
  name: string;
  quorum_type: string;
  quorum_n: number | null;
  quorum_m: number | null;
  eligible_roles: string[];
  escalation_timeout_seconds: number | null;
  escalation_to: unknown | null;
  geo_fence: unknown | null;
  version: number;
  created_at: Date;
}

export interface CreatePolicyData {
  name: string;
  quorum_type: string;
  quorum_n?: number | null;
  quorum_m?: number | null;
  eligible_roles: string[];
  escalation_timeout_seconds?: number | null;
  escalation_to?: unknown | null;
  geo_fence?: unknown | null;
}

// ── createPolicy ──────────────────────────────────────────────────────────
export async function createPolicy(data: CreatePolicyData): Promise<PolicyRow> {
  const {
    name,
    quorum_type,
    quorum_n = null,
    quorum_m = null,
    eligible_roles,
    escalation_timeout_seconds = null,
    escalation_to = null,
    geo_fence = null,
  } = data;

  const { rows } = await pool.query<PolicyRow>(
    `INSERT INTO approval_policies
       (name, quorum_type, quorum_n, quorum_m, eligible_roles,
        escalation_timeout_seconds, escalation_to, geo_fence)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      name,
      quorum_type,
      quorum_n,
      quorum_m,
      JSON.stringify(eligible_roles),
      escalation_timeout_seconds,
      escalation_to !== null ? JSON.stringify(escalation_to) : null,
      geo_fence !== null ? JSON.stringify(geo_fence) : null,
    ]
  );

  return rows[0];
}

// ── listPolicies ──────────────────────────────────────────────────────────
export async function listPolicies(): Promise<PolicyRow[]> {
  const { rows } = await pool.query<PolicyRow>(
    'SELECT * FROM approval_policies ORDER BY created_at DESC'
  );
  return rows;
}

// ── getPolicy ─────────────────────────────────────────────────────────────
export async function getPolicy(id: string): Promise<PolicyRow | null> {
  const { rows } = await pool.query<PolicyRow>(
    'SELECT * FROM approval_policies WHERE id = $1',
    [id]
  );
  return rows[0] ?? null;
}
