import { Router } from 'express';
import { randomUUID } from 'crypto';
import { createLogger, queryRaw } from '@rtb-ai-hub/shared';
import { JiraClient } from '../utils/jira-client';
import { internalAuth } from '../middleware/internal-auth';

const logger = createLogger('workflows-api');
const jiraClient = new JiraClient();

export function createWorkflowsRouter() {
  const router = Router();

  router.get('/api/workflows', async (_req, res) => {
    try {
      const workflows = await queryRaw<{
        id: string;
        jira_key: string;
        summary: string;
        status: string;
        progress: number;
        assignee: string;
        created_at: string;
        updated_at: string;
      }>(
        'SELECT id, jira_key, summary, status, progress, assignee, created_at, updated_at FROM workflow_executions WHERE jira_key IS NOT NULL ORDER BY created_at DESC LIMIT 100'
      );

      const formatted = workflows.map((wf) => ({
        id: wf.id,
        key: wf.jira_key,
        summary: wf.summary,
        status: wf.status,
        progress: wf.progress || 0,
        assignee: wf.assignee,
        created: wf.created_at,
        updated: wf.updated_at,
      }));

      res.json(formatted);
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to fetch workflows'
      );
      res.status(500).json({ error: 'Failed to fetch workflows' });
    }
  });

  router.post('/api/workflows', internalAuth, async (req, res) => {
    try {
      const { jiraKey, summary, type, env } = req.body;

      if (!summary || typeof summary !== 'string') {
        res.status(400).json({ error: 'summary string is required' });
        return;
      }

      const id = `wf-${randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();

      await queryRaw(
        `INSERT INTO workflow_executions (id, type, status, input, jira_key, summary, env, progress, assignee, timeline, artifacts, gate_decisions, started_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          id,
          type || 'agent-chat',
          'IN_PROGRESS',
          JSON.stringify({ source: 'agent-chat', jiraKey }),
          jiraKey || null,
          summary,
          env || 'int',
          0,
          'pm-agent',
          JSON.stringify([]),
          JSON.stringify({}),
          JSON.stringify({}),
          now,
          now,
          now,
        ]
      );

      logger.info({ id, jiraKey, summary }, 'Workflow created');
      res.status(201).json({ id, jiraKey, summary, status: 'IN_PROGRESS' });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to create workflow'
      );
      res.status(500).json({ error: 'Failed to create workflow' });
    }
  });

  router.post('/api/workflows/:id/timeline', internalAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const isJiraKey = /^[A-Z]+-\d+$/.test(id);
      const { agent, action, detail, result, statusChange, artifacts, gate, progress } = req.body;

      if (!agent || typeof agent !== 'string') {
        res.status(400).json({ error: 'agent string is required' });
        return;
      }
      if (!action || typeof action !== 'string') {
        res.status(400).json({ error: 'action string is required' });
        return;
      }

      const workflows = await queryRaw<{
        id: string;
        timeline: unknown;
        artifacts: unknown;
        gate_decisions: unknown;
      }>(
        isJiraKey
          ? 'SELECT id, timeline, artifacts, gate_decisions FROM workflow_executions WHERE jira_key = $1 ORDER BY created_at DESC LIMIT 1'
          : 'SELECT id, timeline, artifacts, gate_decisions FROM workflow_executions WHERE id = $1 LIMIT 1',
        [id]
      );

      if (workflows.length === 0) {
        res.status(404).json({ error: `Workflow ${id} not found` });
        return;
      }

      const workflowId = workflows[0].id;
      const currentTimeline = (workflows[0].timeline as unknown[]) || [];
      const currentArtifacts = (workflows[0].artifacts as Record<string, unknown>) || {};
      const currentGates = (workflows[0].gate_decisions as Record<string, unknown>) || {};

      const entry = {
        step: currentTimeline.length + 1,
        agent,
        action,
        detail: detail || '',
        result: result || '',
        statusChange: statusChange || '',
        timestamp: new Date().toISOString(),
      };

      const newTimeline = [...currentTimeline, entry];

      const mergedArtifacts = artifacts ? { ...currentArtifacts, ...artifacts } : currentArtifacts;

      const mergedGates = gate ? { ...currentGates, [gate.name]: gate.decision } : currentGates;

      const updates: string[] = [
        'timeline = $2',
        'artifacts = $3',
        'gate_decisions = $4',
        'updated_at = NOW()',
      ];
      const params: unknown[] = [
        workflowId,
        JSON.stringify(newTimeline),
        JSON.stringify(mergedArtifacts),
        JSON.stringify(mergedGates),
      ];

      if (statusChange) {
        updates.push(`status = $${params.length + 1}`);
        params.push(statusChange);
      }
      if (typeof progress === 'number') {
        updates.push(`progress = $${params.length + 1}`);
        params.push(progress);
      }
      if (agent) {
        updates.push(`assignee = $${params.length + 1}`);
        params.push(agent);
      }

      await queryRaw(`UPDATE workflow_executions SET ${updates.join(', ')} WHERE id = $1`, params);

      logger.info({ id: workflowId, agent, action, step: entry.step }, 'Timeline entry added');
      res.json({ success: true, step: entry.step });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to add timeline entry'
      );
      res.status(500).json({ error: 'Failed to add timeline entry' });
    }
  });

  router.get('/api/workflows/:id/stream', (req, res) => {
    const { id } = req.params;
    const isJiraKey = /^[A-Z]+-\d+$/.test(id);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendUpdate = async () => {
      try {
        const workflow = await queryRaw<{
          id: string;
          jira_key: string;
          summary: string;
          status: string;
          progress: number;
          assignee: string;
          timeline: unknown;
          artifacts: unknown;
          gate_decisions: unknown;
          created_at: string;
          updated_at: string;
        }>(
          isJiraKey
            ? 'SELECT id, jira_key, summary, status, progress, assignee, timeline, artifacts, gate_decisions, created_at, updated_at FROM workflow_executions WHERE jira_key = $1 ORDER BY created_at DESC LIMIT 1'
            : 'SELECT id, jira_key, summary, status, progress, assignee, timeline, artifacts, gate_decisions, created_at, updated_at FROM workflow_executions WHERE id = $1 LIMIT 1',
          [id]
        );

        if (workflow.length > 0) {
          const wf = workflow[0];
          const data = {
            id: wf.id,
            key: wf.jira_key,
            summary: wf.summary,
            status: wf.status,
            progress: wf.progress || 0,
            assignee: wf.assignee,
            timeline: wf.timeline,
            artifacts: wf.artifacts,
            gates: wf.gate_decisions,
            created: wf.created_at,
            updated: wf.updated_at,
          };
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        }
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.message : String(error), id },
          'SSE update error'
        );
      }
    };

    sendUpdate();

    const interval = setInterval(sendUpdate, 3000);

    req.on('close', () => {
      clearInterval(interval);
      res.end();
    });
  });

  router.get('/api/workflows/:id', async (req, res) => {
    const { id } = req.params;
    const isJiraKey = /^[A-Z]+-\d+$/.test(id);

    try {
      let workflows = await queryRaw<{
        id: string;
        jira_key: string;
        summary: string;
        input: unknown;
        status: string;
        progress: number;
        assignee: string;
        timeline: unknown;
        artifacts: unknown;
        gate_decisions: unknown;
        created_at: string;
        updated_at: string;
      }>(
        isJiraKey
          ? 'SELECT id, jira_key, summary, input, status, progress, assignee, timeline, artifacts, gate_decisions, created_at, updated_at FROM workflow_executions WHERE jira_key = $1 ORDER BY created_at DESC LIMIT 1'
          : 'SELECT id, jira_key, summary, input, status, progress, assignee, timeline, artifacts, gate_decisions, created_at, updated_at FROM workflow_executions WHERE id = $1 LIMIT 1',
        [id]
      );

      if (workflows.length === 0 && isJiraKey) {
        const newId = `wf-${randomUUID().slice(0, 8)}`;
        const now = new Date().toISOString();
        await queryRaw(
          `INSERT INTO workflow_executions (id, type, status, input, jira_key, summary, env, progress, assignee, timeline, artifacts, gate_decisions, started_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            newId,
            'agent-chat',
            'IN_PROGRESS',
            JSON.stringify({ source: 'auto-created', jiraKey: id }),
            id,
            `${id} 워크플로우`,
            'int',
            0,
            'pm-agent',
            JSON.stringify([]),
            JSON.stringify({}),
            JSON.stringify({}),
            now,
            now,
            now,
          ]
        );
        logger.info({ id: newId, jiraKey: id }, 'Auto-created workflow for Jira key');
        workflows = await queryRaw(
          'SELECT id, jira_key, summary, input, status, progress, assignee, timeline, artifacts, gate_decisions, created_at, updated_at FROM workflow_executions WHERE id = $1 LIMIT 1',
          [newId]
        );
      }

      if (workflows.length === 0) {
        res.status(404).json({ error: `Workflow ${id} not found` });
        return;
      }

      const wf = workflows[0];
      const data = {
        id: wf.id,
        key: wf.jira_key,
        summary: wf.summary,
        description: (wf.input as any)?.issue?.fields?.description || '',
        status: wf.status,
        progress: wf.progress || 0,
        assignee: wf.assignee,
        timeline: wf.timeline,
        artifacts: wf.artifacts,
        gates: wf.gate_decisions,
        created: wf.created_at,
        updated: wf.updated_at,
      };

      res.json(data);
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error), id },
        'Failed to fetch workflow'
      );
      res.status(500).json({ error: 'Failed to fetch workflow' });
    }
  });

  router.post('/api/workflows/:id/verify', async (req, res) => {
    const { id } = req.params;

    try {
      const workflows = await queryRaw<{
        jira_key: string;
      }>('SELECT jira_key FROM workflow_executions WHERE id = $1 LIMIT 1', [id]);

      if (workflows.length === 0) {
        res.status(404).json({ error: `Workflow ${id} not found` });
        return;
      }

      const jiraKey = workflows[0].jira_key;
      if (!jiraKey) {
        res.status(400).json({ error: 'Workflow has no associated Jira issue' });
        return;
      }

      const success = await jiraClient.transitionToStatus(jiraKey, 'INT 검증');

      if (!success) {
        res.status(400).json({ error: 'Target status "INT 검증" not available for this issue' });
        return;
      }

      await queryRaw(
        'UPDATE workflow_executions SET status = $1, updated_at = NOW() WHERE id = $2',
        ['VERIFIED', id]
      );

      res.json({ success: true, message: `Issue ${jiraKey} transitioned to INT 검증` });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error), id },
        'Failed to verify workflow'
      );
      res.status(500).json({ error: 'Failed to verify workflow' });
    }
  });

  return router;
}
