import { describe, it, expect } from 'vitest';
import {
  extractNodeIdsFromUrl,
  extractNodeIdsFromPayload,
  serializeFigmaContext,
  parseFigmaContextFromDescription,
  summarizeNodeTree,
  type FigmaContext,
} from '../utils/figma-context';

// ─── extractNodeIdsFromUrl ──────────────────────────────────────────────────

describe('extractNodeIdsFromUrl', () => {
  it('extracts node-id from standard Figma URL with URL encoding', () => {
    const url = 'https://www.figma.com/file/abc123/MyFile?node-id=1%3A2';
    expect(extractNodeIdsFromUrl(url)).toEqual(['1:2']);
  });

  it('extracts node-id with dash format (Figma design URLs)', () => {
    const url = 'https://www.figma.com/design/abc123/MyFile?node-id=1-2';
    expect(extractNodeIdsFromUrl(url)).toEqual(['1:2']);
  });

  it('extracts node-id like 2-2950 from actual Figma URL', () => {
    const url =
      'https://www.figma.com/design/OlC9ehzH2DTbxdc9X9pXp4/04.-%EB%8D%B0%EC%9D%B4%ED%84%B0?node-id=2-2950';
    expect(extractNodeIdsFromUrl(url)).toEqual(['2:2950']);
  });

  it('handles multiple comma-separated node IDs', () => {
    const url = 'https://www.figma.com/file/abc123/MyFile?node-id=1%3A2,3%3A4';
    expect(extractNodeIdsFromUrl(url)).toEqual(['1:2', '3:4']);
  });

  it('returns empty array when no node-id param', () => {
    const url = 'https://www.figma.com/file/abc123/MyFile';
    expect(extractNodeIdsFromUrl(url)).toEqual([]);
  });

  it('returns empty array for invalid URL', () => {
    expect(extractNodeIdsFromUrl('not-a-url')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(extractNodeIdsFromUrl('')).toEqual([]);
  });
});

// ─── extractNodeIdsFromPayload ──────────────────────────────────────────────

describe('extractNodeIdsFromPayload', () => {
  it('extracts from modified_components array', () => {
    const payload = {
      modified_components: [{ node_id: '1:2' }, { node_id: '3:4' }],
    };
    expect(extractNodeIdsFromPayload(payload)).toEqual(['1:2', '3:4']);
  });

  it('extracts from top-level node_id', () => {
    expect(extractNodeIdsFromPayload({ node_id: '5:6' })).toEqual(['5:6']);
  });

  it('combines modified_components and top-level node_id', () => {
    const payload = {
      modified_components: [{ node_id: '1:2' }],
      node_id: '3:4',
    };
    expect(extractNodeIdsFromPayload(payload)).toEqual(['1:2', '3:4']);
  });

  it('skips entries without node_id in modified_components', () => {
    const payload = {
      modified_components: [{ node_id: '1:2' }, { name: 'Button' }, { node_id: '3:4' }],
    };
    expect(extractNodeIdsFromPayload(payload)).toEqual(['1:2', '3:4']);
  });

  it('returns empty for empty payload', () => {
    expect(extractNodeIdsFromPayload({})).toEqual([]);
  });

  it('returns empty when modified_components is not an array', () => {
    expect(extractNodeIdsFromPayload({ modified_components: 'not-array' })).toEqual([]);
  });
});

// ─── serializeFigmaContext / parseFigmaContextFromDescription ────────────────

describe('serializeFigmaContext / parseFigmaContextFromDescription', () => {
  const mockContext: FigmaContext = {
    fileKey: 'abc123',
    fileUrl: 'https://www.figma.com/file/abc123/Test',
    nodeIds: ['1:2'],
    components: [{ name: 'Button', type: 'COMPONENT', description: 'Primary button' }],
    styles: [{ name: 'Colors/Blue', styleType: 'FILL', description: 'Brand blue' }],
    nodeTreeSummary: 'FRAME: "Root"\n  TEXT: "Title"',
    designTokens: { colors: ['#3B82F6'], fontFamilies: ['Inter'], spacingPattern: '8px grid' },
  };

  it('roundtrips correctly', () => {
    const serialized = serializeFigmaContext(mockContext);
    const description = `Some Jira description here.\n\n---\n\n${serialized}`;
    const parsed = parseFigmaContextFromDescription(description);
    expect(parsed).toEqual(mockContext);
  });

  it('parses from description with surrounding text', () => {
    const serialized = serializeFigmaContext(mockContext);
    const description = `Epic: Implement data dashboard\n\nDetails...\n\n---\n\n${serialized}\n\nMore text after`;
    const parsed = parseFigmaContextFromDescription(description);
    expect(parsed).toEqual(mockContext);
  });

  it('returns null for description without Figma context', () => {
    expect(parseFigmaContextFromDescription('Just a normal Jira description')).toBeNull();
  });

  it('returns null for empty description', () => {
    expect(parseFigmaContextFromDescription('')).toBeNull();
  });

  it('returns null for malformed JSON in context block', () => {
    const description = '<!-- FIGMA_CONTEXT_START\n{broken json}\nFIGMA_CONTEXT_END -->';
    expect(parseFigmaContextFromDescription(description)).toBeNull();
  });

  it('serialized output contains start/end markers', () => {
    const serialized = serializeFigmaContext(mockContext);
    expect(serialized).toContain('<!-- FIGMA_CONTEXT_START');
    expect(serialized).toContain('FIGMA_CONTEXT_END -->');
    expect(serialized).toContain('"fileKey": "abc123"');
  });
});

// ─── summarizeNodeTree ──────────────────────────────────────────────────────

describe('summarizeNodeTree', () => {
  it('summarizes a simple node', () => {
    const node = { type: 'FRAME', name: 'Root' };
    expect(summarizeNodeTree(node, 0, 3)).toBe('FRAME: "Root"');
  });

  it('summarizes node with children', () => {
    const node = {
      type: 'FRAME',
      name: 'Root',
      children: [
        { type: 'TEXT', name: 'Title' },
        { type: 'RECTANGLE', name: 'Box' },
      ],
    };
    const result = summarizeNodeTree(node, 0, 3);
    expect(result).toContain('FRAME: "Root"');
    expect(result).toContain('  TEXT: "Title"');
    expect(result).toContain('  RECTANGLE: "Box"');
  });

  it('respects maxDepth', () => {
    const node = {
      type: 'FRAME',
      name: 'Root',
      children: [{ type: 'TEXT', name: 'Deep', children: [{ type: 'SPAN', name: 'Deeper' }] }],
    };
    const result = summarizeNodeTree(node, 0, 2);
    expect(result).toContain('FRAME: "Root"');
    expect(result).toContain('TEXT: "Deep"');
    expect(result).not.toContain('Deeper');
  });

  it('truncates when more than 10 children', () => {
    const children = Array.from({ length: 15 }, (_, i) => ({
      type: 'RECT',
      name: `Item${i}`,
    }));
    const node = { type: 'FRAME', name: 'Root', children };
    const result = summarizeNodeTree(node, 0, 3);
    expect(result).toContain('Item0');
    expect(result).toContain('Item9');
    expect(result).toContain('... and 5 more children');
    expect(result).not.toContain('Item10');
  });

  it('returns empty string at maxDepth', () => {
    const node = { type: 'FRAME', name: 'Root' };
    expect(summarizeNodeTree(node, 3, 3)).toBe('');
  });
});
