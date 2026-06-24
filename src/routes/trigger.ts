import { Router } from 'express';
import type { Request, Response } from 'express';
import { getQueueStats } from '../queue/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.post(
  '/trigger',
  asyncHandler(async (_req: Request, res: Response) => {
    const stats = getQueueStats();
    const hasWork = stats.pending > 0 || stats.processing > 0;
    if (!hasWork) {
      res.json({
        triggered: false,
        message: 'Queue is empty or already finished (no pending or processing jobs)',
      });
      return;
    }
    // The caller (index.ts) can provide startWorker callback via a mutable ref
    const { triggerStartWorker } = _req.app.locals as { triggerStartWorker?: () => void };
    if (triggerStartWorker) {
      triggerStartWorker();
    }
    res.json({
      triggered: true,
      message: 'Worker triggered to process next job',
      stats,
    });
  }),
);

export default router;
