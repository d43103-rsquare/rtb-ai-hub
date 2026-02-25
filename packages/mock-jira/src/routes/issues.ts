import { Router, Request, Response } from 'express';
import { MockJiraStore } from '../store';

export function issuesRouter(store: MockJiraStore): Router {
  const router = Router();

  // POST /issue — create issue
  router.post('/issue', (req: Request, res: Response) => {
    const { fields } = req.body ?? {};
    if (!fields || !fields.project?.key || !fields.issuetype?.name || !fields.summary) {
      res.status(400).json({ errorMessages: ['Missing required fields'] });
      return;
    }

    const issue = store.createIssue({
      project: fields.project.key,
      issuetype: fields.issuetype.name,
      summary: fields.summary,
      description: fields.description,
      labels: fields.labels,
      priority: fields.priority?.name,
      parent: fields.parent?.key,
      components: fields.components,
    });

    res.status(201).json({
      id: issue.id,
      key: issue.key,
      self: `/rest/api/3/issue/${issue.key}`,
    });
  });

  // GET /issue/:issueKey — get issue
  router.get('/issue/:issueKey', (req: Request, res: Response) => {
    const issue = store.getIssue(req.params.issueKey);
    if (!issue) {
      res.status(404).json({ errorMessages: [`Issue ${req.params.issueKey} not found`] });
      return;
    }
    res.json(issue);
  });

  // PUT /issue/:issueKey — update issue
  router.put('/issue/:issueKey', (req: Request, res: Response) => {
    const { fields } = req.body ?? {};
    if (!fields) {
      res.status(400).json({ errorMessages: ['Missing fields'] });
      return;
    }

    const updated = store.updateIssue(req.params.issueKey, {
      summary: fields.summary,
      description: fields.description,
      labels: fields.labels,
      priority: fields.priority?.name,
    });

    if (!updated) {
      res.status(404).json({ errorMessages: [`Issue ${req.params.issueKey} not found`] });
      return;
    }

    res.status(204).send();
  });

  // GET /issue/:issueKey/transitions — get available transitions
  router.get('/issue/:issueKey/transitions', (req: Request, res: Response) => {
    const issue = store.getIssue(req.params.issueKey);
    if (!issue) {
      res.status(404).json({ errorMessages: [`Issue ${req.params.issueKey} not found`] });
      return;
    }

    const transitions = store.getTransitions(req.params.issueKey);
    res.json({ transitions });
  });

  // POST /issue/:issueKey/transitions — transition issue
  router.post('/issue/:issueKey/transitions', (req: Request, res: Response) => {
    const { transition } = req.body ?? {};
    if (!transition?.id) {
      res.status(400).json({ errorMessages: ['Missing transition.id'] });
      return;
    }

    const result = store.transitionIssue(req.params.issueKey, transition.id);
    if (!result) {
      res.status(400).json({ errorMessages: ['Invalid transition'] });
      return;
    }

    res.status(204).send();
  });

  // POST /issue/:issueKey/comment — add comment
  router.post('/issue/:issueKey/comment', (req: Request, res: Response) => {
    const { body: commentBody } = req.body ?? {};
    if (!commentBody) {
      res.status(400).json({ errorMessages: ['Missing comment body'] });
      return;
    }

    const comment = store.addComment(req.params.issueKey, commentBody);
    if (!comment) {
      res.status(404).json({ errorMessages: [`Issue ${req.params.issueKey} not found`] });
      return;
    }

    res.status(201).json(comment);
  });

  return router;
}
