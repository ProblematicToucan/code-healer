import { spawnSync } from 'node:child_process';
import type { AgentProvider, PipelineStep } from './types.js';
import { STEP_PROMPTS } from './types.js';
import { logger } from '../utils/logger.js';

export const antigravityProvider: AgentProvider = {
  name: 'antigravity',

  runStep(cwd: string, step: PipelineStep): boolean {
    const prompt = STEP_PROMPTS[step];
    const r = spawnSync('agy', ['--print', '--dangerously-skip-permissions', '--model', 'auto', prompt], {
      cwd,
      stdio: 'inherit',
      encoding: 'utf8',
    });
    if (r.status !== 0) {
      const detail =
        r.signal != null
          ? `killed by signal ${r.signal}`
          : r.error != null
            ? `spawn failed: ${r.error.message}`
            : `exit code ${r.status}`;
      logger.error(`[agent:antigravity] step "${step}" failed`, { detail });
      return false;
    }
    return true;
  },
};
