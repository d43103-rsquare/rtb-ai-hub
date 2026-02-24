/**
 * Component Mapping — Figma design system → team React component mapper
 *
 * Loads a local JSON mapping table and matches Figma component names
 * to the team's actual React components for accurate code generation.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createLogger } from '@rtb-ai-hub/shared';

const logger = createLogger('component-mapping');

// ─── Types ──────────────────────────────────────────────────────────────────────

export type ComponentMappingEntry = {
  figmaPattern: string;
  matchType: 'exact' | 'prefix';
  component: {
    name: string;
    importPath: string;
    props: Record<string, string>;
    usage: string;
    notes?: string;
  };
};

export type ComponentMappingConfig = {
  version: string;
  description: string;
  mappings: ComponentMappingEntry[];
};

// ─── Module-level cache ─────────────────────────────────────────────────────────

let cachedMapping: ComponentMappingConfig | null | undefined;

// ─── Functions ──────────────────────────────────────────────────────────────────

/**
 * Load component mapping from JSON file.
 * Returns null if the file doesn't exist (graceful degradation).
 * Results are cached at module level.
 */
export async function loadComponentMapping(): Promise<ComponentMappingConfig | null> {
  if (cachedMapping !== undefined) return cachedMapping;

  const mappingPath = resolve(__dirname, '../../component-mapping.json');

  try {
    const raw = await readFile(mappingPath, 'utf-8');
    cachedMapping = JSON.parse(raw) as ComponentMappingConfig;
    logger.info(
      { version: cachedMapping!.version, count: cachedMapping!.mappings.length },
      'Component mapping loaded'
    );
    return cachedMapping;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.debug('component-mapping.json not found — skipping');
    } else {
      logger.warn({ error: err instanceof Error ? err.message : String(err) }, 'Failed to load component mapping');
    }
    cachedMapping = null;
    return null;
  }
}

/**
 * Find the best matching component mapping for a Figma component name.
 * Exact matches take priority, then longest prefix match wins.
 */
export function findComponentMapping(
  figmaName: string,
  mappings: ComponentMappingEntry[]
): ComponentMappingEntry | null {
  // Exact match first
  const exact = mappings.find(
    (m) => m.matchType === 'exact' && m.figmaPattern === figmaName
  );
  if (exact) return exact;

  // Prefix match — longest prefix wins
  let bestMatch: ComponentMappingEntry | null = null;
  let bestLength = 0;

  for (const m of mappings) {
    if (m.matchType === 'prefix' && figmaName.startsWith(m.figmaPattern)) {
      if (m.figmaPattern.length > bestLength) {
        bestMatch = m;
        bestLength = m.figmaPattern.length;
      }
    }
  }

  return bestMatch;
}

/**
 * Format matched and unmatched Figma components as a markdown section.
 * Returns empty string if there are no components to format.
 */
export function formatMappedComponents(
  figmaComponents: Array<{ name: string; type?: string; description?: string }>,
  mappings: ComponentMappingEntry[]
): string {
  if (!figmaComponents.length) return '';

  const matched: Array<{ figmaName: string; entry: ComponentMappingEntry }> = [];
  const unmatched: string[] = [];

  for (const fc of figmaComponents) {
    const entry = findComponentMapping(fc.name, mappings);
    if (entry) {
      matched.push({ figmaName: fc.name, entry });
    } else {
      unmatched.push(fc.name);
    }
  }

  if (matched.length === 0 && unmatched.length === 0) return '';

  const lines: string[] = [];

  if (matched.length > 0) {
    lines.push(`### Team Component Mappings (${matched.length} matched):`);
    for (const { figmaName, entry } of matched) {
      const { component } = entry;
      lines.push(`- **${figmaName}** → \`${component.name}\``);
      lines.push(`  - Import: \`${component.importPath}\``);
      const propsStr = Object.entries(component.props)
        .map(([k, v]) => `\`${k}: ${v}\``)
        .join(', ');
      lines.push(`  - Props: ${propsStr}`);
      lines.push(`  - Usage: \`${component.usage}\``);
      if (component.notes) {
        lines.push(`  - Notes: ${component.notes}`);
      }
    }
  }

  if (unmatched.length > 0) {
    lines.push(`### Unmapped Figma Components (${unmatched.length}):`);
    for (const name of unmatched) {
      lines.push(`- **${name}** — _no team component mapping_`);
    }
  }

  return lines.join('\n');
}

/** Reset the module cache (for testing) */
export function _resetCache(): void {
  cachedMapping = undefined;
}
