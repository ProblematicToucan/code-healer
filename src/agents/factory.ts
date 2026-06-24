import { config } from '../config.js';
import type { AgentProvider } from './types.js';
import { cursorProvider } from './cursor.js';
import { antigravityProvider } from './antigravity.js';
import { logger } from '../utils/logger.js';

const providers: Record<string, AgentProvider> = {
  cursor: cursorProvider,
  antigravity: antigravityProvider,
};

let cached: AgentProvider | null = null;

export function resolveAgentProvider(): AgentProvider {
  if (cached) return cached;

  const name = config.agentProvider;
  const provider = providers[name];

  if (!provider) {
    const available = Object.keys(providers).join(', ');
    logger.warn(`unknown AGENT_PROVIDER "${name}", falling back to cursor`, { available });
    cached = cursorProvider;
    return cached;
  }

  logger.info(`agent provider: ${name}`);
  cached = provider;
  return cached;
}
