/**
 * Persona Loader — Load and validate persona definitions from YAML config files
 *
 * Reads persona YAML files from config/personas/ directory,
 * validates with Zod schema, and converts to PersonaDefinition.
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { AgentPersona, AITier } from '@rtb-ai-hub/shared';
import type { PersonaDefinition } from '@rtb-ai-hub/shared';
import { personaYamlSchema } from './persona-schema';
import { createLogger } from '@rtb-ai-hub/shared';

const logger = createLogger('persona-loader');

const CONFIG_DIR = join(__dirname, '../../config/personas');

/**
 * Load all persona YAML files and return validated PersonaDefinition map.
 * Falls back to empty map on errors (caller should handle missing personas).
 */
export function loadPersonasFromConfig(): Record<AgentPersona, PersonaDefinition> | null {
  try {
    const files = readdirSync(CONFIG_DIR).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

    if (files.length === 0) {
      logger.warn({ dir: CONFIG_DIR }, 'No persona YAML files found');
      return null;
    }

    const personas = {} as Record<AgentPersona, PersonaDefinition>;

    for (const file of files) {
      const filePath = join(CONFIG_DIR, file);
      const raw = readFileSync(filePath, 'utf-8');
      const parsed = parseYaml(raw);

      const result = personaYamlSchema.safeParse(parsed);
      if (!result.success) {
        logger.error(
          { file, errors: result.error.issues },
          'Invalid persona YAML — skipping'
        );
        continue;
      }

      const yaml = result.data;
      const persona = yaml.persona as AgentPersona;

      // handoffTriggers keys are already enum values (e.g. 'system-planner')
      const handoffTriggers: Partial<Record<AgentPersona, string>> = {};
      for (const [key, value] of Object.entries(yaml.handoffTriggers)) {
        handoffTriggers[key as AgentPersona] = String(value);
      }

      personas[persona] = {
        persona,
        codename: yaml.codename,
        role: yaml.role,
        description: yaml.description.trim(),
        traits: yaml.traits,
        vocabulary: yaml.vocabulary,
        decisionFramework: yaml.decisionFramework.trim(),
        domainExpertise: yaml.domainExpertise,
        handoffTriggers,
        aiTier: yaml.aiTier as AITier,
        maxTokensPerTurn: yaml.maxTokensPerTurn,
      };

      logger.debug({ persona, codename: yaml.codename, file }, 'Loaded persona from YAML');
    }

    const loadedCount = Object.keys(personas).length;
    if (loadedCount === 0) {
      logger.warn({ totalFiles: files.length }, 'No valid personas loaded from YAML — will use hardcoded fallback');
      return null;
    }

    logger.info({ loadedCount, totalFiles: files.length }, 'Personas loaded from YAML config');

    return personas;
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err), dir: CONFIG_DIR },
      'Failed to load persona YAML config — will use hardcoded fallback'
    );
    return null;
  }
}
