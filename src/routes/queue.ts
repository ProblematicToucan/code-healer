import { Router } from 'express';
import type { Request, Response } from 'express';
import { getQueueStats, listQueueJobs } from '../queue/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const stats = getQueueStats();
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const statusFilter = req.query.status as 'pending' | 'processing' | 'done' | 'failed' | undefined;
    const jobs = listQueueJobs({
      limit,
      ...(statusFilter && ['pending', 'processing', 'done', 'failed'].includes(statusFilter)
        ? { status: statusFilter }
        : {}),
    });
    const finished = stats.pending === 0 && stats.processing === 0;
    res.json({ stats, finished, jobs });
  }),
);

export default router;
