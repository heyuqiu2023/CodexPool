import { config } from '../config.js';

export function authMiddleware(req, res, next) {
  // If no secret configured, skip auth (backward compatible)
  if (!config.authSecret) return next();

  // Check Authorization header: Bearer <token>
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.slice(7);
    if (token === config.authSecret) return next();
  }

  // Check query param (for WebSocket connections)
  if (req.query.token === config.authSecret) return next();

  res.status(401).json({ message: 'Unauthorized. Set AUTH_SECRET in .env or provide Bearer token.' });
}
