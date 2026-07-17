import { Router, type Request, type Response } from 'express';
import { generateRegistrationOptionsForUser } from '../services/webauthn.service';

const router = Router();

// ── POST /api/auth/register/options ───────────────────────────────────────
// Body: { email: string }
// Returns: PublicKeyCredentialCreationOptionsJSON
router.post(
  '/register/options',
  async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body as { email?: string };

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'email is required' });
      return;
    }

    try {
      const options = await generateRegistrationOptionsForUser(email.trim().toLowerCase());
      res.json(options);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'internal error';
      res.status(500).json({ error: message });
    }
  }
);

export default router;
