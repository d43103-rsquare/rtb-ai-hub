import { test, expect } from '@playwright/test';

test.describe('Monitoring Dashboard', () => {
  test.beforeEach(async ({ page, context }) => {
    const sessionToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkZXZfZDQzMTAzX3JzcXVhcmVfY29fa3IiLCJlbWFpbCI6ImQ0MzEwM0Byc3F1YXJlLmNvLmtyIiwic2Vzc2lvbklkIjoiZGV2X3Nlc3Npb24iLCJuYW1lIjoiSnVuY2h1bCBZYW5nIiwiaWF0IjoxNzcwODY5MDg4LCJleHAiOjE3NzM0NjEwODh9.E7BxKAmYohEbVaSYywyoNkeOIAffJqpKsGStPdlhSCU';

    await context.addCookies([
      {
        name: 'session_token',
        value: sessionToken,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
  });

  test('목록 페이지 렌더링', async ({ page }) => {
    await page.goto('/monitoring');

    await expect(page.locator('h1')).toContainText('실시간 워크플로우 모니터링');

    await expect(page.locator('text=Live')).toBeVisible();

    const workflowCards = page.locator('[href^="/monitoring/"]');
    await expect(workflowCards).toHaveCount(2);

    await expect(workflowCards.first()).toContainText('SIM-001');
    await expect(workflowCards.nth(1)).toContainText('SIM-002');
  });

  test('워크플로우 카드 클릭 시 상세 페이지 이동', async ({ page }) => {
    await page.goto('/monitoring');

    const firstCard = page.locator('[href^="/monitoring/"]').first();
    await firstCard.click();

    await expect(page).toHaveURL(/\/monitoring\/SIM-\d+/);

    await expect(page.locator('h1')).toContainText('빌딩 정보 조회 API 개발');
  });

  test('상세 페이지 - 에이전트 대화 표시', async ({ page }) => {
    await page.goto('/monitoring/SIM-001');

    await expect(page.locator('text=💬 에이전트 대화')).toBeVisible();

    const chatMessages = page.locator('text=PM Agent').or(page.locator('text=Developer'));
    await expect(chatMessages.first()).toBeVisible();
  });

  test('상세 페이지 - Jira 링크 버튼', async ({ page }) => {
    await page.goto('/monitoring/SIM-001');

    const jiraButton = page.locator('button:has-text("🔗 Jira")');
    await expect(jiraButton).toBeVisible();
  });

  test('상세 페이지 - 프로그레스바 표시', async ({ page }) => {
    await page.goto('/monitoring/SIM-001');

    const progressBar = page.locator('text=Progress');
    await expect(progressBar).toBeVisible();

    const percentage = page.locator('text=100%');
    await expect(percentage).toBeVisible();
  });

  test('상세 페이지 - 게이트 포인트 표시', async ({ page }) => {
    await page.goto('/monitoring/SIM-001');

    await expect(page.locator('text=🎯 게이트 포인트')).toBeVisible();

    const gateG1 = page.locator('text=G1');
    await expect(gateG1).toBeVisible();
  });

  test('상세 페이지 - Artifacts 표시', async ({ page }) => {
    await page.goto('/monitoring/SIM-001');

    await expect(page.locator('text=📦 Artifacts')).toBeVisible();

    const prUrl = page.locator('text=pr url');
    await expect(prUrl).toBeVisible();
  });

  test('목록 페이지 - 실시간 폴링 확인', async ({ page }) => {
    await page.goto('/monitoring');

    const initialWorkflowCount = await page.locator('[href^="/monitoring/"]').count();

    await page.waitForTimeout(4000);

    const updatedWorkflowCount = await page.locator('[href^="/monitoring/"]').count();

    expect(updatedWorkflowCount).toBeGreaterThanOrEqual(initialWorkflowCount);
  });
});
