/**
 * M5.1 — Approval policy routes
 * All endpoints protected by requireAuth middleware.
 */
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import {
  createPolicy,
  getPolicy,
  listPolicies,
  type CreatePolicyData,
} from '../services/policy.service';

const router = Router();

// ── POST /api/approval/policies ───────────────────────────────────────────
// Body: { name, quorum_type, quorum_n?, quorum_m?, eligible_roles, ... }
// Returns: 201 + created policy row
router.post(
  '/policies',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as Partial<CreatePolicyData>;

    // Validate required fields
    if (!body.name || typeof body.name !== 'string') {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    if (!body.quorum_type || typeof body.quorum_type !== 'string') {
      res.status(400).json({ error: 'quorum_type is required' });
      return;
    }
    if (!Array.isArray(body.eligible_roles) || body.eligible_roles.length === 0) {
      res.status(400).json({ error: 'eligible_roles must be a non-empty array' });
      return;
    }

    try {
      const policy = await createPolicy({
        name: body.name,
        quorum_type: body.quorum_type,
        quorum_n: body.quorum_n ?? null,
        quorum_m: body.quorum_m ?? null,
        eligible_roles: body.eligible_roles as string[],
        escalation_timeout_seconds: body.escalation_timeout_seconds ?? null,
        escalation_to: body.escalation_to ?? null,
        geo_fence: body.geo_fence ?? null,
      });
      res.status(201).json(policy);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'internal error';
      res.status(500).json({ error: message });
    }
  }
);

// ── GET /api/approval/policies ────────────────────────────────────────────
// Returns: array of all policies, newest first
router.get(
  '/policies',
  requireAuth,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const policies = await listPolicies();
      res.json(policies);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'internal error';
      res.status(500).json({ error: message });
    }
  }
);

// ── GET /api/approval/policies/:id ───────────────────────────────────────
// Returns: single policy or 404
router.get(
  '/policies/:id',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string;

    try {
      const policy = await getPolicy(id);
      if (!policy) {
        res.status(404).json({ error: 'policy not found' });
        return;
      }
      res.json(policy);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'internal error';
      res.status(500).json({ error: message });
    }
  }
);

export default router;
