import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import path from 'path';
import { MockJiraStore } from '../store';

const TEST_DATA_DIR = path.join(__dirname, '../../data/test');

describe('MockJiraStore', () => {
  let store: MockJiraStore;

  beforeEach(() => {
    store = new MockJiraStore(TEST_DATA_DIR);
    store.reset();
  });

  afterAll(() => {
    const cleanup = new MockJiraStore(TEST_DATA_DIR);
    cleanup.reset();
  });

  describe('createIssue', () => {
    it('auto-increments key and sets correct initial fields', () => {
      const issue = store.createIssue({
        project: 'PROJ',
        summary: 'First issue',
        description: 'Description of first issue',
        issuetype: 'Task',
      });

      expect(issue.key).toBe('PROJ-1');
      expect(issue.id).toBe('10001');
      expect(issue.fields.status.name).toBe('Open');
      expect(issue.fields.summary).toBe('First issue');
      expect(issue.fields.description).toBe('Description of first issue');
      expect(issue.fields.issuetype.name).toBe('Task');
      expect(issue.fields.project.key).toBe('PROJ');
      expect(issue.fields.labels).toEqual([]);
      expect(issue.fields.priority.name).toBe('Medium');
      expect(issue.fields.comment.comments).toEqual([]);
      expect(issue.fields.created).toBeDefined();
      expect(issue.fields.updated).toBeDefined();
    });

    it('increments key per project', () => {
      const a1 = store.createIssue({ project: 'AAA', summary: 'A1', issuetype: 'Task' });
      const b1 = store.createIssue({ project: 'BBB', summary: 'B1', issuetype: 'Bug' });
      const a2 = store.createIssue({ project: 'AAA', summary: 'A2', issuetype: 'Story' });

      expect(a1.key).toBe('AAA-1');
      expect(b1.key).toBe('BBB-1');
      expect(a2.key).toBe('AAA-2');
      // id should auto-increment globally
      expect(a1.id).toBe('10001');
      expect(b1.id).toBe('10002');
      expect(a2.id).toBe('10003');
    });
  });

  describe('getIssue', () => {
    it('returns issue by key', () => {
      store.createIssue({ project: 'GET', summary: 'Get me', issuetype: 'Task' });
      const found = store.getIssue('GET-1');

      expect(found).not.toBeNull();
      expect(found!.key).toBe('GET-1');
      expect(found!.fields.summary).toBe('Get me');
    });

    it('returns null for non-existent key', () => {
      const found = store.getIssue('NOPE-999');
      expect(found).toBeNull();
    });
  });

  describe('updateIssue', () => {
    it('updates fields', () => {
      store.createIssue({ project: 'UPD', summary: 'Original', issuetype: 'Task' });
      const updated = store.updateIssue('UPD-1', {
        summary: 'Updated summary',
        description: 'New description',
        labels: ['backend', 'urgent'],
        priority: 'High',
      });

      expect(updated).not.toBeNull();
      expect(updated!.fields.summary).toBe('Updated summary');
      expect(updated!.fields.description).toBe('New description');
      expect(updated!.fields.labels).toEqual(['backend', 'urgent']);
      expect(updated!.fields.priority.name).toBe('High');
      expect(updated!.fields.updated).toBeDefined();
    });
  });

  describe('getTransitions', () => {
    it('returns available transitions for current status', () => {
      store.createIssue({ project: 'TRN', summary: 'Transitions', issuetype: 'Task' });
      const transitions = store.getTransitions('TRN-1');

      expect(transitions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: '11', name: 'In Progress' }),
          expect.objectContaining({ id: '51', name: 'Closed' }),
        ])
      );
      expect(transitions).toHaveLength(2);
    });
  });

  describe('transitionIssue', () => {
    it('changes status via transition', () => {
      store.createIssue({ project: 'TRN', summary: 'To move', issuetype: 'Task' });
      store.transitionIssue('TRN-1', '11'); // Open → In Progress

      const issue = store.getIssue('TRN-1');
      expect(issue!.fields.status.name).toBe('In Progress');

      store.transitionIssue('TRN-1', '21'); // In Progress → In Review
      const issue2 = store.getIssue('TRN-1');
      expect(issue2!.fields.status.name).toBe('In Review');
    });
  });

  describe('addComment', () => {
    it('adds comment to issue', () => {
      store.createIssue({ project: 'CMT', summary: 'Commentable', issuetype: 'Task' });
      const comment = store.addComment('CMT-1', 'This is a comment');

      expect(comment).not.toBeNull();
      expect(comment!.body).toBe('This is a comment');
      expect(comment!.id).toBeDefined();
      expect(comment!.author).toBeDefined();
      expect(comment!.created).toBeDefined();

      const issue = store.getIssue('CMT-1');
      expect(issue!.fields.comment.comments).toHaveLength(1);
      expect(issue!.fields.comment.comments[0].body).toBe('This is a comment');
    });
  });

  describe('search', () => {
    beforeEach(() => {
      store.createIssue({ project: 'ALPHA', summary: 'Alpha task', issuetype: 'Task' });
      store.createIssue({ project: 'ALPHA', summary: 'Alpha bug', issuetype: 'Bug' });
      store.createIssue({ project: 'BETA', summary: 'Beta task', issuetype: 'Task' });
    });

    it('finds by project', () => {
      const results = store.search({ project: 'ALPHA' });
      expect(results).toHaveLength(2);
      results.forEach((r) => expect(r.fields.project.key).toBe('ALPHA'));
    });

    it('finds by status', () => {
      store.transitionIssue('ALPHA-1', '11'); // Open → In Progress
      const results = store.search({ status: 'In Progress' });
      expect(results).toHaveLength(1);
      expect(results[0].key).toBe('ALPHA-1');
    });

    it('finds by issuetype', () => {
      const results = store.search({ issuetype: 'Bug' });
      expect(results).toHaveLength(1);
      expect(results[0].key).toBe('ALPHA-2');
    });
  });

  describe('listAll', () => {
    it('returns all issues', () => {
      store.createIssue({ project: 'ALL', summary: 'One', issuetype: 'Task' });
      store.createIssue({ project: 'ALL', summary: 'Two', issuetype: 'Bug' });

      const all = store.listAll();
      expect(all).toHaveLength(2);
    });
  });

  describe('persistence', () => {
    it('new store instance loads same data', () => {
      store.createIssue({ project: 'PST', summary: 'Persisted', issuetype: 'Task' });

      // Create a new store instance pointing to the same data dir
      const store2 = new MockJiraStore(TEST_DATA_DIR);
      const issue = store2.getIssue('PST-1');

      expect(issue).not.toBeNull();
      expect(issue!.fields.summary).toBe('Persisted');
    });
  });
});
