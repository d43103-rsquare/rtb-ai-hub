import { describe, it, expect } from 'vitest';
import { mapToolName, mapToolCall } from '../tool-name-mapper';
import type { ComplexMapping } from '../tool-name-mapper';

describe('mapToolName', () => {
  describe('GitHub (simple mappings)', () => {
    it.each([
      ['createBranch', 'create_branch'],
      ['createPullRequest', 'create_pull_request'],
      ['getPullRequest', 'get_pull_request'],
      ['getPullRequestDiff', 'get_pull_request_files'],
      ['createReview', 'create_pull_request_review'],
      ['mergePullRequest', 'merge_pull_request'],
      ['createCommit', 'push_files'],
      ['createReviewComment', 'create_pull_request_review'],
      ['createIssueComment', 'add_issue_comment'],
      ['searchIssues', 'search_issues'],
    ])('maps %s → %s', (from, to) => {
      expect(mapToolName('GITHUB', from)).toBe(to);
    });
  });

  describe('Jira (complex mappings)', () => {
    it('maps getIssue to jira_get with pathTemplate', () => {
      const mapping = mapToolName('JIRA', 'getIssue') as ComplexMapping;
      expect(mapping.tool).toBe('jira_get');
      expect(mapping.pathTemplate).toBe('/rest/api/3/issue/{issueKey}');
    });

    it('maps searchIssues to jira_get with pathTemplate', () => {
      const mapping = mapToolName('JIRA', 'searchIssues') as ComplexMapping;
      expect(mapping.tool).toBe('jira_get');
      expect(mapping.pathTemplate).toBe('/rest/api/3/search/jql');
    });

    it('maps createIssue to jira_post with static path', () => {
      const mapping = mapToolName('JIRA', 'createIssue') as ComplexMapping;
      expect(mapping.tool).toBe('jira_post');
      expect(mapping.path).toBe('/rest/api/3/issue');
    });

    it('maps createEpic to jira_post with static path', () => {
      const mapping = mapToolName('JIRA', 'createEpic') as ComplexMapping;
      expect(mapping.tool).toBe('jira_post');
      expect(mapping.path).toBe('/rest/api/3/issue');
    });

    it('maps createSubtask to jira_post with static path', () => {
      const mapping = mapToolName('JIRA', 'createSubtask') as ComplexMapping;
      expect(mapping.tool).toBe('jira_post');
      expect(mapping.path).toBe('/rest/api/3/issue');
    });

    it('maps updateIssue to jira_put with pathTemplate', () => {
      const mapping = mapToolName('JIRA', 'updateIssue') as ComplexMapping;
      expect(mapping.tool).toBe('jira_put');
      expect(mapping.pathTemplate).toBe('/rest/api/3/issue/{issueKey}');
    });

    it('maps transitionIssue to jira_post with pathTemplate', () => {
      const mapping = mapToolName('JIRA', 'transitionIssue') as ComplexMapping;
      expect(mapping.tool).toBe('jira_post');
      expect(mapping.pathTemplate).toBe('/rest/api/3/issue/{issueKey}/transitions');
    });

    it('maps addComment to jira_post with pathTemplate', () => {
      const mapping = mapToolName('JIRA', 'addComment') as ComplexMapping;
      expect(mapping.tool).toBe('jira_post');
      expect(mapping.pathTemplate).toBe('/rest/api/3/issue/{issueKey}/comment');
    });
  });

  describe('Figma (simple mappings)', () => {
    it.each([
      ['getFile', 'get_metadata'],
      ['getFileNodes', 'get_design_context'],
      ['getFileComponents', 'get_code_connect_map'],
      ['getFileStyles', 'get_variable_defs'],
      ['getFileVariables', 'get_variable_defs'],
    ])('maps %s → %s', (from, to) => {
      expect(mapToolName('FIGMA', from)).toBe(to);
    });

    it('throws for UNSUPPORTED tool getComments', () => {
      expect(() => mapToolName('FIGMA', 'getComments')).toThrow(
        'not supported by the native FIGMA MCP server'
      );
    });
  });

  describe('Datadog (simple mappings)', () => {
    it.each([
      ['getLogs', 'get_logs'],
      ['queryMetrics', 'query_metrics'],
      ['getTraces', 'list_traces'],
      ['getAlerts', 'list_incidents'],
      ['getMonitors', 'get_monitors'],
    ])('maps %s → %s', (from, to) => {
      expect(mapToolName('DATADOG', from)).toBe(to);
    });

    it('throws for CUSTOM_EXTENSION tool createMonitor', () => {
      expect(() => mapToolName('DATADOG', 'createMonitor')).toThrow('requires a custom extension');
    });
  });

  describe('error handling', () => {
    it('throws for unknown tool name', () => {
      expect(() => mapToolName('GITHUB', 'nonExistentTool')).toThrow(
        'Unknown tool "nonExistentTool" for service GITHUB'
      );
    });

    it('throws for unknown tool on JIRA', () => {
      expect(() => mapToolName('JIRA', 'deleteSprint')).toThrow(
        'Unknown tool "deleteSprint" for service JIRA'
      );
    });
  });
});

describe('mapToolCall', () => {
  describe('GitHub (simple — passes input through)', () => {
    it('maps createBranch call', () => {
      const result = mapToolCall('GITHUB', 'createBranch', {
        owner: 'org',
        repo: 'repo',
        branch: 'feature/test',
      });
      expect(result.toolName).toBe('create_branch');
      expect(result.input).toEqual({ owner: 'org', repo: 'repo', branch: 'feature/test' });
    });

    it('maps createPullRequest call', () => {
      const result = mapToolCall('GITHUB', 'createPullRequest', {
        owner: 'org',
        repo: 'repo',
        title: 'PR title',
        body: 'PR body',
        head: 'feature/test',
        base: 'main',
      });
      expect(result.toolName).toBe('create_pull_request');
      expect(result.input.title).toBe('PR title');
    });
  });

  describe('Jira getIssue', () => {
    it('resolves path template and strips input', () => {
      const result = mapToolCall('JIRA', 'getIssue', { issueKey: 'PROJ-123' });
      expect(result.toolName).toBe('jira_get');
      expect(result.input).toEqual({ path: '/rest/api/3/issue/PROJ-123' });
    });

    it('throws when issueKey is missing', () => {
      expect(() => mapToolCall('JIRA', 'getIssue', {})).toThrow(
        'Missing required path parameter "issueKey"'
      );
    });
  });

  describe('Jira searchIssues', () => {
    it('restructures into queryParams', () => {
      const result = mapToolCall('JIRA', 'searchIssues', {
        jql: 'project=PROJ',
        maxResults: 50,
      });
      expect(result.toolName).toBe('jira_get');
      expect(result.input).toEqual({
        path: '/rest/api/3/search/jql',
        queryParams: { jql: 'project=PROJ', maxResults: 50 },
      });
    });
  });

  describe('Jira createIssue', () => {
    it('restructures into fields body', () => {
      const result = mapToolCall('JIRA', 'createIssue', {
        projectKey: 'PROJ',
        issueType: 'Story',
        summary: 'Test story',
        description: 'A description',
        labels: ['RTB-AI-HUB'],
      });
      expect(result.toolName).toBe('jira_post');
      expect(result.input).toEqual({
        path: '/rest/api/3/issue',
        body: {
          fields: {
            project: { key: 'PROJ' },
            issuetype: { name: 'Story' },
            summary: 'Test story',
            description: 'A description',
            labels: ['RTB-AI-HUB'],
          },
        },
      });
    });

    it('defaults issueType to Task when not provided', () => {
      const result = mapToolCall('JIRA', 'createIssue', {
        projectKey: 'PROJ',
        summary: 'Test task',
      });
      const fields = (result.input.body as Record<string, unknown>).fields as Record<
        string,
        unknown
      >;
      expect(fields.issuetype).toEqual({ name: 'Task' });
    });

    it('includes parentKey when provided', () => {
      const result = mapToolCall('JIRA', 'createIssue', {
        projectKey: 'PROJ',
        issueType: 'Task',
        summary: 'Child task',
        parentKey: 'PROJ-100',
      });
      const fields = (result.input.body as Record<string, unknown>).fields as Record<
        string,
        unknown
      >;
      expect(fields.parent).toEqual({ key: 'PROJ-100' });
    });
  });

  describe('Jira createEpic', () => {
    it('forces issuetype to Epic', () => {
      const result = mapToolCall('JIRA', 'createEpic', {
        projectKey: 'PROJ',
        summary: 'Epic summary',
        description: 'Epic desc',
      });
      expect(result.toolName).toBe('jira_post');
      const fields = (result.input.body as Record<string, unknown>).fields as Record<
        string,
        unknown
      >;
      expect(fields.issuetype).toEqual({ name: 'Epic' });
      expect(fields.project).toEqual({ key: 'PROJ' });
      expect(fields.summary).toBe('Epic summary');
    });
  });

  describe('Jira createSubtask', () => {
    it('includes parent field and sets issuetype to Sub-task', () => {
      const result = mapToolCall('JIRA', 'createSubtask', {
        parentKey: 'PROJ-100',
        summary: 'Subtask summary',
        projectKey: 'PROJ',
      });
      expect(result.toolName).toBe('jira_post');
      const fields = (result.input.body as Record<string, unknown>).fields as Record<
        string,
        unknown
      >;
      expect(fields.issuetype).toEqual({ name: 'Sub-task' });
      expect(fields.parent).toEqual({ key: 'PROJ-100' });
      expect(fields.project).toEqual({ key: 'PROJ' });
    });
  });

  describe('Jira updateIssue', () => {
    it('resolves path and puts remaining fields in body', () => {
      const result = mapToolCall('JIRA', 'updateIssue', {
        issueKey: 'PROJ-123',
        summary: 'Updated summary',
        status: 'Done',
      });
      expect(result.toolName).toBe('jira_put');
      expect(result.input).toEqual({
        path: '/rest/api/3/issue/PROJ-123',
        body: { fields: { summary: 'Updated summary', status: 'Done' } },
      });
    });
  });

  describe('Jira transitionIssue', () => {
    it('resolves path and structures transition body', () => {
      const result = mapToolCall('JIRA', 'transitionIssue', {
        issueKey: 'PROJ-123',
        transitionId: '31',
      });
      expect(result.toolName).toBe('jira_post');
      expect(result.input).toEqual({
        path: '/rest/api/3/issue/PROJ-123/transitions',
        body: { transition: { id: '31' } },
      });
    });
  });

  describe('Jira addComment', () => {
    it('resolves path and structures comment body', () => {
      const result = mapToolCall('JIRA', 'addComment', {
        issueKey: 'PROJ-123',
        body: 'This is a comment',
      });
      expect(result.toolName).toBe('jira_post');
      expect(result.input).toEqual({
        path: '/rest/api/3/issue/PROJ-123/comment',
        body: { body: 'This is a comment' },
      });
    });
  });

  describe('Figma (simple — passes input through)', () => {
    it('maps getFile call', () => {
      const result = mapToolCall('FIGMA', 'getFile', { fileKey: 'abc123' });
      expect(result.toolName).toBe('get_metadata');
      expect(result.input).toEqual({ fileKey: 'abc123' });
    });
  });

  describe('Datadog (simple — passes input through)', () => {
    it('maps getLogs call', () => {
      const result = mapToolCall('DATADOG', 'getLogs', { query: 'service:web' });
      expect(result.toolName).toBe('get_logs');
      expect(result.input).toEqual({ query: 'service:web' });
    });
  });

  describe('error propagation', () => {
    it('throws for UNSUPPORTED tool via mapToolCall', () => {
      expect(() => mapToolCall('FIGMA', 'getComments', {})).toThrow('not supported');
    });

    it('throws for CUSTOM_EXTENSION tool via mapToolCall', () => {
      expect(() => mapToolCall('DATADOG', 'createMonitor', {})).toThrow('custom extension');
    });

    it('throws for unknown tool via mapToolCall', () => {
      expect(() => mapToolCall('GITHUB', 'unknownTool', {})).toThrow('Unknown tool');
    });
  });
});
