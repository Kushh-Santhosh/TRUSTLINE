/**
 * M6.7 — Ledger routes
 * GET /api/ledger/receipt/:requestId — returns the full cryptographic receipt
 * for a resolved approval request, including:
 *   - all vote signatures
 *   - approver public keys (from signing_keys)
 *   - related audit_log entries (hash-chained)
 *
 * Protected by requireAuth.
 * Read-only — no database writes.
 */
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { getReceiptForRequest } from '../services/audit.service';

const router = Router();

// ── GET /api/ledger/receipt/:requestId ─────────────────────────────────────
// Returns: { request_id, votes: [{ id, approver_id, decision, signature, public_key }],
//            audit_entries: [{ id, entry_type, payload, prev_hash, this_hash, created_at }] }
router.get(
  '/receipt/:requestId',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const requestId = req.params['requestId'] as string;

    try {
      const receipt = await getReceiptForRequest(requestId, req.userId as string);
      if (!receipt) {
        res.status(404).json({ error: 'request not found' });
        return;
      }
      res.json(receipt);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'internal error';
      res.status(500).json({ error: message });
    }
  }
);

export default router;
