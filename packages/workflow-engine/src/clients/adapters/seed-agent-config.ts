// 이 파일은 최초 1회 실행 후 삭제 가능
import { db } from '../../utils/database';
import { agentModelConfig, generateId } from '@rtb-ai-hub/shared';

const DEFAULT_CONFIGS = [
  { persona: 'pm',                provider: 'claude', model: 'claude-sonnet-4-20250514' },
  { persona: 'system-planner',    provider: 'claude', model: 'claude-sonnet-4-20250514' },
  { persona: 'ux-designer',       provider: 'openai', model: 'gpt-4o' },
  { persona: 'ui-developer',      provider: 'openai', model: 'gpt-4o' },
  { persona: 'backend-developer', provider: 'claude', model: 'claude-sonnet-4-20250514' },
  { persona: 'qa',                provider: 'gemini', model: 'gemini-2.0-flash' },
  { persona: 'devops',            provider: 'gemini', model: 'gemini-2.0-flash' },
] as const;

async function seed(): Promise<void> {
  for (const config of DEFAULT_CONFIGS) {
    await db.insert(agentModelConfig).values({
      id: generateId('amc'),
      ...config,
      env: 'all',
      enabled: true,
    }).onConflictDoNothing();
  }
  console.log('Seeded agent_model_config');
  process.exit(0);
}

seed().catch((err) => { console.error(err); process.exit(1); });
