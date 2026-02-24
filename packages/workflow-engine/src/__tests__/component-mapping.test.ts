import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  findComponentMapping,
  formatMappedComponents,
  loadComponentMapping,
  _resetCache,
  type ComponentMappingEntry,
} from '../utils/component-mapping';

// Mock fs/promises for loadComponentMapping tests
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

const sampleMappings: ComponentMappingEntry[] = [
  {
    figmaPattern: 'DesignSystem/Button',
    matchType: 'prefix',
    component: {
      name: 'RtbButton',
      importPath: '@rtb/ui/components/Button',
      props: { variant: 'primary | secondary', size: 'sm | md | lg' },
      usage: '<RtbButton variant="primary">Label</RtbButton>',
      notes: 'RTB themed button',
    },
  },
  {
    figmaPattern: 'DesignSystem/Button/Primary',
    matchType: 'exact',
    component: {
      name: 'RtbPrimaryButton',
      importPath: '@rtb/ui/components/PrimaryButton',
      props: { size: 'sm | md | lg' },
      usage: '<RtbPrimaryButton>Label</RtbPrimaryButton>',
    },
  },
  {
    figmaPattern: 'DesignSystem/Input',
    matchType: 'prefix',
    component: {
      name: 'RtbInput',
      importPath: '@rtb/ui/components/Input',
      props: { type: 'text | number' },
      usage: '<RtbInput type="text" />',
    },
  },
];

describe('findComponentMapping', () => {
  it('returns exact match when available', () => {
    const result = findComponentMapping('DesignSystem/Button/Primary', sampleMappings);
    expect(result).not.toBeNull();
    expect(result!.component.name).toBe('RtbPrimaryButton');
  });

  it('returns prefix match when no exact match', () => {
    const result = findComponentMapping('DesignSystem/Button/Secondary', sampleMappings);
    expect(result).not.toBeNull();
    expect(result!.component.name).toBe('RtbButton');
  });

  it('returns longest prefix match', () => {
    // Add a shorter prefix that also matches
    const mappings: ComponentMappingEntry[] = [
      {
        figmaPattern: 'DesignSystem',
        matchType: 'prefix',
        component: {
          name: 'Generic',
          importPath: '@rtb/ui/Generic',
          props: {},
          usage: '<Generic />',
        },
      },
      ...sampleMappings,
    ];

    const result = findComponentMapping('DesignSystem/Input/Text', mappings);
    expect(result).not.toBeNull();
    expect(result!.component.name).toBe('RtbInput');
  });

  it('returns null when no match found', () => {
    const result = findComponentMapping('CustomWidget/Unknown', sampleMappings);
    expect(result).toBeNull();
  });

  it('exact match takes priority over prefix match', () => {
    const result = findComponentMapping('DesignSystem/Button/Primary', sampleMappings);
    expect(result!.matchType).toBe('exact');
    expect(result!.component.name).toBe('RtbPrimaryButton');
  });
});

describe('formatMappedComponents', () => {
  it('formats matched components as markdown', () => {
    const components = [
      { name: 'DesignSystem/Button/Ghost', type: 'COMPONENT', description: 'A button' },
      { name: 'DesignSystem/Input/Text', type: 'COMPONENT', description: 'An input' },
    ];

    const result = formatMappedComponents(components, sampleMappings);

    expect(result).toContain('Team Component Mappings (2 matched)');
    expect(result).toContain('`RtbButton`');
    expect(result).toContain('`RtbInput`');
    expect(result).toContain('@rtb/ui/components/Button');
    expect(result).toContain('@rtb/ui/components/Input');
  });

  it('includes unmapped components section', () => {
    const components = [
      { name: 'DesignSystem/Button/Ghost', type: 'COMPONENT', description: '' },
      { name: 'CustomWidget/Chart', type: 'COMPONENT', description: '' },
    ];

    const result = formatMappedComponents(components, sampleMappings);

    expect(result).toContain('Team Component Mappings (1 matched)');
    expect(result).toContain('Unmapped Figma Components (1)');
    expect(result).toContain('CustomWidget/Chart');
    expect(result).toContain('_no team component mapping_');
  });

  it('returns empty string for empty component list', () => {
    const result = formatMappedComponents([], sampleMappings);
    expect(result).toBe('');
  });

  it('includes notes when present', () => {
    const components = [
      { name: 'DesignSystem/Button/Ghost', type: 'COMPONENT', description: '' },
    ];

    const result = formatMappedComponents(components, sampleMappings);
    expect(result).toContain('RTB themed button');
  });
});

describe('loadComponentMapping', () => {
  beforeEach(() => {
    _resetCache();
    vi.clearAllMocks();
  });

  it('returns null when file does not exist', async () => {
    const { readFile } = await import('node:fs/promises');
    (readFile as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    );

    const result = await loadComponentMapping();
    expect(result).toBeNull();
  });

  it('parses valid JSON and caches result', async () => {
    const mockConfig = {
      version: '1.0',
      description: 'test',
      mappings: [sampleMappings[0]],
    };
    const { readFile } = await import('node:fs/promises');
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(JSON.stringify(mockConfig));

    const result1 = await loadComponentMapping();
    expect(result1).toEqual(mockConfig);

    // Second call should use cache (readFile not called again)
    const result2 = await loadComponentMapping();
    expect(result2).toEqual(mockConfig);
    expect(readFile).toHaveBeenCalledTimes(1);
  });
});
