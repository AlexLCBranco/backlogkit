// The site in a real browser. Locally: the built site with /api/projects mocked (fixture-data.ts). With LIVE_URL:
// the deployed site reading real GitHub, where only shape checks apply (the data changes every day).
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fixtureData } from './fixture-data';
import { backlogMarkdown } from '../lib/lists.mjs';

const live = !!process.env.LIVE_URL;
const pkgVersion = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;

test.describe('mocked GitHub', () => {
  test.skip(live, 'local only');

  test.beforeEach(async ({ page }) => {
    const data = await fixtureData();
    await page.route('**/api/projects', (r) => r.fulfill({ json: data }));
  });

  test('home → project page → back, search from the top bar, all repos', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('card-demo')).toContainText('Planned 3 (Ready 2 / Held 1) · Blocked 1 · Ideas 2');
    await expect(page.getByTestId('card-broken').getByRole('alert')).toContainText('HTTP 403');
    await expect(page.getByTestId('group-nofiles').getByTestId('card-bare')).toBeVisible();

    await page.getByTestId('card-demo').click({ position: { x: 200, y: 60 } });
    await expect(page).toHaveURL(/#\/p\/demo$/);
    const planned = page.getByTestId('planned');
    const built = page.getByTestId('built');
    const [pb, bb] = [await planned.boundingBox(), await built.boundingBox()];
    expect(pb!.x + pb!.width).toBeLessThanOrEqual(bb!.x); // side by side
    await planned.getByText('First thing').click();
    await expect(planned.getByText('Line one of the spec.')).toBeVisible();
    await expect(planned.locator('.is-blocked')).toContainText('DM-2');
    await expect(page.getByTestId('ideas').getByText('Dark mode toggle')).toBeHidden();
    await page.getByTestId('ideas').locator('summary').click();
    await expect(page.getByTestId('ideas').getByText('Dark mode toggle')).toBeVisible();

    await page.getByRole('searchbox', { name: 'Search' }).fill('DM-5');
    await expect(page.getByTestId('hit')).toHaveCount(1);
    await expect(page.getByTestId('hit')).toContainText('Newest thing');
    await page.getByRole('searchbox', { name: 'Search' }).fill('');
    await expect(page.getByTestId('planned')).toBeVisible();

    await page.getByRole('link', { name: 'All repos' }).click();
    await expect(page.getByTestId('all-built-day').first()).toContainText('2026-11-17');
  });

  test('copy buttons: one item, a built item and the whole backlog, without toggling rows', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const clipboard = async () => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'); // Windows' clipboard reads back CRLF
    const data = await fixtureData();
    await page.goto('/#/p/demo');
    const row = page.getByTestId('planned').getByTestId('planned-item').first();
    const copy = row.getByRole('button', { name: 'Copy DM-1' });
    await expect(copy).toBeVisible(); // always visible, no hover needed

    await copy.click();
    await expect(copy).toHaveAttribute('data-copied', 'true');
    expect(await clipboard()).toBe('### DM-1 — First thing\nLine one of the spec.\n- a bullet\n  continued');
    await expect(row).not.toHaveAttribute('open');
    await expect(copy).not.toHaveAttribute('data-copied', /.*/, { timeout: 3000 }); // back to the copy icon

    await row.locator('summary').click({ position: { x: 5, y: 5 } });
    await expect(row).toHaveAttribute('open');
    await copy.click();
    await expect(row).toHaveAttribute('open'); // an open row stays open

    await page.getByTestId('built').getByRole('button', { name: 'Copy DM-5' }).click();
    expect(await clipboard()).toBe('- DM-5 — Newest thing (v1.3.0)\n  What the owner sees now.');

    await page.getByRole('button', { name: 'Copy whole backlog' }).click();
    expect(await clipboard()).toBe(backlogMarkdown(data.projects.find((p) => p.repo === 'demo')!.planned));
    expect(await clipboard()).toMatch(/^## Ready\n\n### DM-1[\s\S]*\n## Held[\s\S]*### DM-3 — Later thing\nHeld text.\n$/);
  });

  test('the token never reaches the page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('card-demo')).toBeVisible();
    expect(await page.content()).not.toContain('e2e-secret-token-value');
  });
});

test('version in the bottom-right corner, and /version.json', async ({ page, request }) => {
  await page.route('**/api/projects', async (r) => (live ? r.continue() : r.fulfill({ json: await fixtureData() })));
  await page.goto('/');
  const v = page.getByTestId('site-version');
  await expect(v).toHaveText(/^v\d+\.\d+\.\d+$/);
  const box = (await v.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(vp.width - (box.x + box.width)).toBeLessThan(20);
  expect(vp.height - (box.y + box.height)).toBeLessThan(20);
  const res = await request.get('/version.json');
  const json = (await res.json()) as { version: string; commit: string };
  if (!live) expect(json.version).toBe(pkgVersion);
  await expect(v).toHaveText(`v${json.version}`);
});

test('live: real projects load from GitHub', async ({ page }) => {
  test.skip(!live, 'live only');
  await page.goto('/');
  await expect(page.getByTestId('card-backlogkit')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('group-active')).toBeVisible();
  await page.getByTestId('card-backlogkit').click({ position: { x: 200, y: 60 } });
  await expect(page.getByTestId('planned')).toBeVisible();
});
