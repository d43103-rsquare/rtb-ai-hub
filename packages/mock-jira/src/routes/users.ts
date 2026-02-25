import { Router, Request, Response } from 'express';

export function usersRouter(): Router {
  const router = Router();

  // GET /user/search — return fixed mock user list
  router.get('/user/search', (_req: Request, res: Response) => {
    res.json([
      {
        accountId: 'mock-user-001',
        emailAddress: 'mock@rtb-ai-hub.local',
        displayName: 'Mock User',
        active: true,
      },
    ]);
  });

  return router;
}
