import { Router } from 'express';

const router = Router();

// Placeholder — routes implemented in Phase 7
router.get('/', (_req, res) => {
  res.status(501).json({ error: 'not implemented' });
});

export default router;
