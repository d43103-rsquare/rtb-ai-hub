import express from 'express';
import cors from 'cors';
import { MockJiraStore } from './store';
import { issuesRouter } from './routes/issues';
import { searchRouter } from './routes/search';
import { usersRouter } from './routes/users';
import { webhookTriggerRouter } from './routes/webhook-trigger';
import { uiRouter } from './ui/pages';

export function createApp(store: MockJiraStore): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use('/rest/api/3', issuesRouter(store));
  app.use('/rest/api/3', searchRouter(store));
  app.use('/rest/api/3', usersRouter());
  app.use('/mock', webhookTriggerRouter(store));
  app.use('/', uiRouter(store));

  return app;
}
