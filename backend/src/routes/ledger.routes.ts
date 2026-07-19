import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { getReceiptForRequest } from '../services/audit.service';

const router = Router();

// GET /api/ledger/receipt/:requestId
// Returns: { request_id, votes, audit_entries } — full cryptographic receipt for a resolved request.
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
      const message = err instanceof Error ? err.message : 'internal error';
      res.status(500).json({ error: message });
    }
  }
);

export default router;
