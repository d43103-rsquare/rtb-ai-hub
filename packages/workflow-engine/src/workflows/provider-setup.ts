/**
 * Provider Setup — Common AI provider router and debate engine initialization
 *
 * Extracts repeated adapter/router/debate-engine setup from individual workflows.
 */

import type { Environment, ProviderAdapter } from '@rtb-ai-hub/shared';
import { ClaudeAdapter } from '../clients/adapters/claude-adapter';
import { OpenAIAdapter } from '../clients/adapters/openai-adapter';
import { GeminiAdapter } from '../clients/adapters/gemini-adapter';
import { createProviderRouter, type AIProviderRouter } from '../clients/provider-router';
import { createDebateEngine } from '../debate/engine';
import type { DebateEngine } from '../debate/engine';
import { createDebateStore } from '../debate/debate-store';
import { database } from '../clients/database';

/**
 * Create a provider router with all available AI adapters, load config for env.
 */
export async function setupProviderRouter(env: Environment): Promise<AIProviderRouter> {
  const adapters: ProviderAdapter[] = [new ClaudeAdapter()];
  if (process.env.OPENAI_API_KEY) adapters.push(new OpenAIAdapter());
  if (process.env.GEMINI_API_KEY) adapters.push(new GeminiAdapter());

  const router = createProviderRouter(adapters);
  await router.loadConfig(env);
  return router;
}

/**
 * Create a debate engine backed by the given router and a DB-backed debate store.
 */
export function setupDebateEngine(router: AIProviderRouter): DebateEngine {
  const debateStore = createDebateStore(database);
  return createDebateEngine({ router, store: debateStore });
}
