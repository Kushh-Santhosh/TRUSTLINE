/**
 * M5.1 — Approval policy routes
 * M5.2 — Approval request creation
 * M5.4 — Vote submission
 * M5.5 — Delegation management
 * M5.7 — Break-glass emergency access
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
import { createRequest, submitVote, breakGlass, listResolvedRequests } from '../services/request.service';
import { createDelegation } from '../services/delegation.service';

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

// ── POST /api/approval/requests ───────────────────────────────────────────────
// Body: { policyId: string, actionPayload: object }
// Returns: 201 + created request row (status: 'pending', policy_version_snapshot captured)
router.post(
  '/requests',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { policyId, actionPayload } = req.body as {
      policyId?: string;
      actionPayload?: unknown;
    };

    if (!policyId || typeof policyId !== 'string') {
      res.status(400).json({ error: 'policyId is required' });
      return;
    }
    if (actionPayload === undefined || actionPayload === null) {
      res.status(400).json({ error: 'actionPayload is required' });
      return;
    }

    // req.userId is guaranteed by requireAuth
    const requesterId = req.userId as string;

    try {
      const request = await createRequest(policyId, requesterId, actionPayload);
      res.status(201).json(request);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'internal error';
      const status = message === 'policy not found' ? 404 : 500;
      res.status(status).json({ error: message });
    }
  }
);

// ── POST /api/approval/requests/:id/votes ────────────────────────────────────
// Body: { decision: 'approve' | 'deny' }
// Returns: { vote (with server-generated Ed25519 signature), request, quorumResult }
// approverId = req.userId (set by requireAuth)
// Signature is generated server-side via signing.service (M6.3)
router.post(
  '/requests/:id/votes',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const requestId = req.params['id'] as string;
    const { decision } = req.body as { decision?: string };

    if (decision !== 'approve' && decision !== 'deny') {
      res.status(400).json({ error: 'decision must be "approve" or "deny"' });
      return;
    }

    const approverId = req.userId as string;

    try {
      const result = await submitVote(requestId, approverId, decision);
      res.status(201).json(result);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'internal error';
      const status =
        message === 'request not found' ? 404
        : message.includes('already') ? 409
        : 500;
      res.status(status).json({ error: message });
    }
  }
);

// ── POST /api/approval/delegations ───────────────────────────────────────────────
// Body: { delegateId: string, expiresAt: string (ISO 8601) }
// Returns: 201 + delegation row
// delegatorId = req.userId (set by requireAuth)
router.post(
  '/delegations',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { delegateId, expiresAt } = req.body as {
      delegateId?: string;
      expiresAt?: string;
    };

    if (!delegateId || typeof delegateId !== 'string') {
      res.status(400).json({ error: 'delegateId is required' });
      return;
    }
    if (!expiresAt || typeof expiresAt !== 'string') {
      res.status(400).json({ error: 'expiresAt is required (ISO 8601 timestamp)' });
      return;
    }

    const expiresAtDate = new Date(expiresAt);
    if (isNaN(expiresAtDate.getTime())) {
      res.status(400).json({ error: 'expiresAt is not a valid ISO 8601 timestamp' });
      return;
    }

    const delegatorId = req.userId as string;

    try {
      const delegation = await createDelegation(delegatorId, delegateId, expiresAtDate);
      res.status(201).json(delegation);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'internal error';
      const status = message.includes('must be') ? 400 : 500;
      res.status(status).json({ error: message });
    }
  }
);

// ── POST /api/approval/requests/:id/break-glass ───────────────────────────────────
// Returns: 200 + updated request row
// status='approved', break_glass=true, needs_review=true, resolved_at set
router.post(
  '/requests/:id/break-glass',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const requestId = req.params['id'] as string;
    const actorId   = req.userId as string;

    try {
      const request = await breakGlass(requestId, actorId);
      res.json(request);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'internal error';
      const status =
        message === 'request not found'                       ? 404
        : message.includes('already')                         ? 409
        : 500;
      res.status(status).json({ error: message });
    }
  }
);

// ── GET /api/approval/requests ──────────────────────────────────────────
// Query: ?status=resolved (optional, filters to approved/denied/expired)
// Returns: list of approval requests for the dispute demo picker
// M8.4 — Read-only.
router.get(
  '/requests',
  requireAuth,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const rows = await listResolvedRequests();
      res.json(rows);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'internal error';
      res.status(500).json({ error: message });
    }
  }
);

export default router;
