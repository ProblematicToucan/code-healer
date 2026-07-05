import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      name: 'Self-Healing Code',
      version: '1.0.0',
      description: 'Self-healing API for automated error repair pipelines',
      documentation: '/reference',
      openapi: '/openapi.json',
    });
  }),
);

router.get(
  '/health',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  }),
);

export default router;
