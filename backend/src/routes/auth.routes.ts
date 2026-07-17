import { Router } from 'express';

const router = Router();

// Placeholder — routes implemented in Phase 4
router.get('/', (_req, res) => {
  res.status(501).json({ error: 'not implemented' });
});

export default router;
