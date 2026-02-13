import { createLogger } from '@rtb-ai-hub/shared';
import type { Environment, FigmaWebhookEvent } from '@rtb-ai-hub/shared';
import {
  getFigmaFile,
  getFigmaFileNodes,
  getFigmaFileComponents,
  getFigmaFileStyles,
  type McpCallResult,
  type FigmaComponentResult,
  type FigmaStyleResult,
  type FigmaFileResult,
} from '../clients/mcp-helper';

const logger = createLogger('figma-context');

// ─── Types ──────────────────────────────────────────────────────────────────

export type FigmaComponentSummary = {
  name: string;
  type: string;
  description: string;
};

export type FigmaStyleSummary = {
  name: string;
  styleType: string;
  description: string;
};

export type FigmaDesignTokens = {
  colors: string[];
  fontFamilies: string[];
  spacingPattern: string;
};

export type FigmaContext = {
  fileKey: string;
  fileUrl: string;
  nodeIds: string[];
  components: FigmaComponentSummary[];
  styles: FigmaStyleSummary[];
  nodeTreeSummary: string;
  designTokens: FigmaDesignTokens;
};

// ─── Node ID Extraction ─────────────────────────────────────────────────────

export function extractNodeIdsFromUrl(fileUrl: string): string[] {
  try {
    const url = new URL(fileUrl);
    const nodeIdParam = url.searchParams.get('node-id');
    if (!nodeIdParam) return [];
    const decoded = decodeURIComponent(nodeIdParam);
    return decoded.split(',').map((id) => id.replace(/-/g, ':'));
  } catch {
    return [];
  }
}

export function extractNodeIdsFromPayload(payload: Record<string, unknown>): string[] {
  const nodeIds: string[] = [];

  if (Array.isArray(payload.modified_components)) {
    for (const comp of payload.modified_components) {
      if (comp && typeof comp === 'object' && 'node_id' in comp && typeof comp.node_id === 'string') {
        nodeIds.push(comp.node_id);
      }
    }
  }

  if (typeof payload.node_id === 'string') {
    nodeIds.push(payload.node_id);
  }

  return nodeIds;
}

// ─── Figma MCP Data Collection ──────────────────────────────────────────────

export async function fetchFigmaDesignData(
  env: Environment,
  event: FigmaWebhookEvent
): Promise<FigmaContext | null> {
  const { fileKey, fileUrl, payload } = event;

  const urlNodeIds = extractNodeIdsFromUrl(fileUrl);
  const payloadNodeIds = extractNodeIdsFromPayload(payload);
  const nodeIds = [...new Set([...urlNodeIds, ...payloadNodeIds])];

  logger.info({ fileKey, nodeIds, nodeIdCount: nodeIds.length }, 'Extracted node IDs from event');

  const [componentsResult, stylesResult, fileResult] = await Promise.allSettled([
    getFigmaFileComponents(env, { fileKey }),
    getFigmaFileStyles(env, { fileKey }),
    getFigmaFile(env, { fileKey, depth: 2 }),
  ]);

  const components = extractComponents(componentsResult);
  const styles = extractStyles(stylesResult);
  let nodeTreeSummary = extractNodeTreeSummary(fileResult);
  const designTokens = extractDesignTokens(stylesResult);

  if (nodeIds.length > 0) {
    try {
      const nodesResult = await getFigmaFileNodes(env, { fileKey, nodeIds });
      if (nodesResult.success) {
        const detailedSummary = buildDetailedNodeSummary(nodesResult.data);
        if (detailedSummary) {
          nodeTreeSummary = detailedSummary;
        }
      }
    } catch (err) {
      logger.warn({ err, fileKey, nodeIds }, 'Failed to fetch specific Figma nodes');
    }
  }

  if (components.length === 0 && styles.length === 0 && !nodeTreeSummary) {
    logger.warn({ fileKey }, 'All Figma MCP calls failed or returned empty — returning null');
    return null;
  }

  return { fileKey, fileUrl, nodeIds, components, styles, nodeTreeSummary, designTokens };
}

// ─── Data Extraction Helpers ────────────────────────────────────────────────

function extractComponents(
  result: PromiseSettledResult<McpCallResult<FigmaComponentResult>>
): FigmaComponentSummary[] {
  if (result.status !== 'fulfilled' || !result.value.success) return [];
  const meta = result.value.data?.meta;
  if (!meta?.components) return [];
  return meta.components.slice(0, 30).map((c) => ({
    name: c.name,
    type: 'COMPONENT',
    description: c.description || `Component in ${c.containing_frame?.name || 'root'}`,
  }));
}

function extractStyles(
  result: PromiseSettledResult<McpCallResult<FigmaStyleResult>>
): FigmaStyleSummary[] {
  if (result.status !== 'fulfilled' || !result.value.success) return [];
  const meta = result.value.data?.meta;
  if (!meta?.styles) return [];
  return meta.styles.slice(0, 30).map((s) => ({
    name: s.name,
    styleType: s.style_type,
    description: s.description || s.name,
  }));
}

function extractNodeTreeSummary(
  result: PromiseSettledResult<McpCallResult<FigmaFileResult>>
): string {
  if (result.status !== 'fulfilled' || !result.value.success) return '';
  const doc = result.value.data?.document;
  if (!doc) return '';
  return summarizeNodeTree(doc as Record<string, unknown>, 0, 3);
}

export function summarizeNodeTree(
  node: Record<string, unknown>,
  depth: number,
  maxDepth: number
): string {
  if (depth >= maxDepth || !node) return '';
  const indent = '  '.repeat(depth);
  const type = (node.type as string) || 'UNKNOWN';
  const name = (node.name as string) || '';
  let line = `${indent}${type}: "${name}"`;

  const children = node.children as Record<string, unknown>[] | undefined;
  if (Array.isArray(children)) {
    const childSummaries = children
      .slice(0, 10)
      .map((child) => summarizeNodeTree(child, depth + 1, maxDepth))
      .filter(Boolean);
    if (childSummaries.length > 0) {
      line += '\n' + childSummaries.join('\n');
    }
    if (children.length > 10) {
      line += `\n${indent}  ... and ${children.length - 10} more children`;
    }
  }

  return line;
}

function extractDesignTokens(
  stylesResult: PromiseSettledResult<McpCallResult<FigmaStyleResult>>
): FigmaDesignTokens {
  const tokens: FigmaDesignTokens = { colors: [], fontFamilies: [], spacingPattern: '8px grid' };

  if (stylesResult.status === 'fulfilled' && stylesResult.value.success) {
    const styles = stylesResult.value.data?.meta?.styles || [];
    for (const s of styles) {
      if (s.style_type === 'FILL') tokens.colors.push(s.name);
      if (s.style_type === 'TEXT') tokens.fontFamilies.push(s.name);
    }
  }

  return tokens;
}

function buildDetailedNodeSummary(data: { nodes: Record<string, unknown> }): string {
  if (!data?.nodes) return '';
  const parts: string[] = [];
  for (const [nodeId, nodeData] of Object.entries(data.nodes)) {
    const doc = (nodeData as Record<string, unknown>)?.document;
    if (doc) {
      parts.push(`Node ${nodeId}:\n${summarizeNodeTree(doc as Record<string, unknown>, 1, 4)}`);
    }
  }
  return parts.join('\n\n');
}

// ─── Jira Description Serialization ─────────────────────────────────────────

const FIGMA_CONTEXT_START = '<!-- FIGMA_CONTEXT_START';
const FIGMA_CONTEXT_END = 'FIGMA_CONTEXT_END -->';

export function serializeFigmaContext(context: FigmaContext): string {
  const json = JSON.stringify(context, null, 2);
  return `${FIGMA_CONTEXT_START}\n${json}\n${FIGMA_CONTEXT_END}`;
}

export function parseFigmaContextFromDescription(description: string): FigmaContext | null {
  if (!description) return null;

  const regex = /<!-- FIGMA_CONTEXT_START\n([\s\S]*?)\nFIGMA_CONTEXT_END -->/;
  const match = description.match(regex);
  if (!match?.[1]) return null;

  try {
    return JSON.parse(match[1]) as FigmaContext;
  } catch (err) {
    logger.warn({ err }, 'Failed to parse Figma context from Jira description');
    return null;
  }
}
