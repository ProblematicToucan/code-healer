import { Router } from 'express';
import type { Request, Response } from 'express';
import { isOAuthEnabled, issueAccessToken, verifyClientCredentials } from '../auth/oauth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.post(
  '/token',
  asyncHandler(async (req: Request, res: Response) => {
    if (!isOAuthEnabled()) {
      res.status(503).json({
        error: 'temporarily_unavailable',
        error_description: 'OAuth client credentials are not configured on this server',
      });
      return;
    }
    const grantType = req.body?.grant_type;
    if (grantType !== 'client_credentials') {
      res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: 'Only grant_type=client_credentials is supported',
      });
      return;
    }
    const clientId = req.body?.client_id;
    const clientSecret = req.body?.client_secret;
    if (
      typeof clientId !== 'string' ||
      typeof clientSecret !== 'string' ||
      !clientId ||
      !clientSecret
    ) {
      res.status(400).json({
        error: 'invalid_request',
        error_description: 'client_id and client_secret are required',
      });
      return;
    }
    if (!verifyClientCredentials(clientId, clientSecret)) {
      res.status(401).json({
        error: 'invalid_client',
        error_description: 'Client authentication failed',
      });
      return;
    }
    const token = await issueAccessToken(clientId);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.status(200).json(token);
  }),
);

export default router;
