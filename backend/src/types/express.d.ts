// Augment Express Request to carry the authenticated user ID.
// Set by requireAuth middleware; available on every protected route.
declare namespace Express {
  interface Request {
    userId?: string;
  }
}
