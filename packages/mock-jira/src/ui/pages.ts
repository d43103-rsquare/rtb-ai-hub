import { Router } from 'express';
import { MockJiraStore } from '../store';

export function uiRouter(_store: MockJiraStore): Router {
  return Router();
}
