import { Router } from 'express';
import type { Request, Response } from 'express';
import { listWorkspaceEntries, runWorkspaceCleanup } from '../utils/workspaceCleanup.js';
import { config, getEnvInt } from '../config.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const entries = await listWorkspaceEntries();
    res.json({ entries });
  }),
);

router.post(
  '/cleanup',
  asyncHandler(async (req: Request, res: Response) => {
    const fromQuery = parseInt(String(req.query.retentionDays), 10);
    const fromEnv = getEnvInt('WORKSPACE_RETENTION_DAYS', NaN);

    const raw =
      (Number.isFinite(fromQuery) ? fromQuery : null) ??
      (Number.isFinite(fromEnv) ? fromEnv : null) ??
      config.workspace.retentionDays;

    const retentionDays = Math.max(1, Math.min(365, raw));
    const dryRun = req.query.dryRun === 'true' || req.query.dryRun === '1';
    const deleted = await runWorkspaceCleanup(retentionDays, dryRun);
    res.json({ deleted, dryRun });
  }),
);

export default router;
