// The site in a real browser. Locally: the built site with /api/projects mocked (fixture-data.ts). With LIVE_URL:
// the deployed site reading real GitHub, where only shape checks apply (the data changes every day).
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fixtureData } from './fixture-data';

const live = !!process.env.LIVE_URL;
const pkgVersion = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;

// The fixture's built days are 2026-11-12 … 2026-11-17; the board's clock is fixed so "last 7 days" stays stable.
const TODAY = new Date('2026-11-19T12:00:00');
const lines = (page: Page, col: string) => page.getByTestId(`col-${col}`).getByTestId('board-item').locator('summary').allTextContents();

test.describe('mocked GitHub', () => {
  test.skip(live, 'local only');

  test.beforeEach(async ({ page }) => {
    const data = await fixtureData();
    await page.route('**/api/projects', (r) => r.fulfill({ json: data }));
    await page.clock.setFixedTime(TODAY);
  });

  test('board home: four columns, items in the right column, Blocked badge, counts (BL-9)', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('backlogkit · Board');
    const cols = page.locator('[data-testid^="col-"]');
    await expect.poll(() => cols.evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))).toEqual(['col-later', 'col-next', 'col-now', 'col-built']);
    const boxes = await Promise.all(['later', 'next', 'now', 'built'].map((c) => page.getByTestId(`col-${c}`).boundingBox()));
    for (let i = 1; i < boxes.length; i++) expect(boxes[i - 1]!.x + boxes[i - 1]!.width).toBeLessThanOrEqual(boxes[i]!.x); // left to right

    await expect.poll(() => lines(page, 'later')).toEqual(['unassignedU-1Orphan gadget for no repo (2026-11-18)', 'demoI-1Dark mode toggle (2026-11-01)', 'demoI-2Something long that wraps (2026-11-02)']);
    expect(await lines(page, 'next')).toEqual(['demoDM-3Later thing']);
    expect(await lines(page, 'now')).toEqual(['alphaAL-1Alpha item', 'alphaAL-2Odd estimate', 'demoDM-1First thing', 'demoDM-2Stuck thingBlocked']);
    expect(await lines(page, 'built')).toEqual(['demoDM-5Newest thing (v1.3.0)', 'demoA fix without ID (v1.2.1)', 'demov1.2.0: old style line', 'demoDM-0Older thing (v1.1.0)']); // zulu's 11-12 is older than 7 days
    await expect(page.getByTestId('col-now').locator('.is-blocked .badge.blocked')).toHaveText('Blocked');
    await expect(page.getByTestId('col-now').locator('.badge.blocked')).toHaveCSS('background-color', 'rgb(107, 31, 39)'); // red
    await expect(page.getByTestId('board-summary')).toHaveText('Now 4 · Next 1 · Later 3 · Blocked 1 · Built (7 days) 4');
    await expect(page.getByTestId('col-now').locator('h2')).toHaveText('Now 4');

    const item = page.getByTestId('col-now').getByTestId('board-item').nth(2);
    await item.locator('summary').click();
    await expect(item.getByText('Line one of the spec.')).toBeVisible();
    await item.locator('summary').click();
    await expect(item.getByText('Line one of the spec.')).toBeHidden();

    await page.getByTestId('col-built').getByRole('link', { name: 'All built' }).click();
    await expect(page).toHaveURL(/#\/built$/);
    await expect(page.getByTestId('all-built-day').last()).toContainText('ZU-1');
  });

  test('Built keeps only the last 7 days', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-22T12:00:00')); // 7 days: 11-16 … 11-22
    await page.goto('/');
    await expect.poll(() => lines(page, 'built')).toEqual(['demoDM-5Newest thing (v1.3.0)', 'demoA fix without ID (v1.2.1)', 'demov1.2.0: old style line']);
  });

  test('project chips filter the board and are remembered; cards and old URLs open it filtered', async ({ page }) => {
    await page.goto('/');
    const chips = page.getByRole('group', { name: 'Filter by project' }).getByRole('button');
    await expect(chips).toHaveText(['All', 'alpha', 'demo', 'zulu', 'broken']); // card sort order
    await chips.filter({ hasText: 'alpha' }).click();
    await expect(page.getByTestId('board-summary')).toHaveText('Now 2 · Next 0 · Later 0 · Blocked 0 · Built (7 days) 0');
    await page.reload();
    await expect(chips.filter({ hasText: 'alpha' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('board-summary')).toHaveText('Now 2 · Next 0 · Later 0 · Blocked 0 · Built (7 days) 0');
    await chips.filter({ hasText: 'All' }).click();
    await expect(page.getByTestId('board-summary')).toHaveText('Now 4 · Next 1 · Later 3 · Blocked 1 · Built (7 days) 4');

    await page.getByRole('link', { name: 'Projects', exact: true }).click();
    await expect(page).toHaveTitle('backlogkit · Projects');
    await page.getByTestId('card-demo').click({ position: { x: 200, y: 50 } });
    await expect(page).toHaveURL(/#\/$/);
    await expect(chips.filter({ hasText: 'demo' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('board-summary')).toHaveText('Now 2 · Next 1 · Later 2 · Blocked 1 · Built (7 days) 4');

    await page.goto('/#/p/ZULU'); // an old project-page URL, any spelling
    await expect(page).toHaveURL(/#\/$/);
    await expect(chips.filter({ hasText: 'zulu' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('board-summary')).toHaveText('Now 0 · Next 0 · Later 0 · Blocked 0 · Built (7 days) 0');
    await page.goto('/#/all'); // the old All repos view
    await expect(page.getByTestId('col-now')).toBeVisible();
  });

  test('copy button shows on hover of the line and copies without toggling it', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const clipboard = async () => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'); // Windows' clipboard reads back CRLF
    await page.goto('/');
    const row = page.getByTestId('col-now').getByTestId('board-item').nth(2);
    const copy = row.getByRole('button', { name: 'Copy DM-1' });
    await expect(copy).toBeHidden();
    await row.locator('summary').hover();
    await expect(copy).toBeVisible();
    await copy.click();
    await expect(copy).toHaveAttribute('data-copied', 'true');
    expect(await clipboard()).toBe('### DM-1 — First thing\nLine one of the spec.\n- a bullet\n  continued');
    await expect(row).not.toHaveAttribute('open');

    const built = page.getByTestId('col-built').getByTestId('board-item').first();
    await built.locator('summary').hover();
    await built.getByRole('button', { name: 'Copy DM-5' }).click();
    expect(await clipboard()).toBe('- DM-5 — Newest thing (v1.3.0)\n  What the owner sees now.');

    const idea = page.getByTestId('col-later').getByTestId('board-item').first();
    await idea.locator('summary').hover();
    await idea.getByRole('button', { name: 'Copy U-1' }).click();
    expect(await clipboard()).toBe('- U-1 — Orphan gadget for no repo (2026-11-18)');
  });

  test('search filters the board, from any page', async ({ page }) => {
    await page.goto('/#/projects');
    await page.getByRole('searchbox', { name: 'Search' }).fill('DM-5');
    await expect(page).toHaveTitle('backlogkit · search “DM-5”');
    await expect(page.getByTestId('board-item')).toHaveCount(1);
    await expect(page.getByTestId('col-built')).toContainText('Newest thing');
    await page.getByRole('searchbox', { name: 'Search' }).fill('ZU-1'); // older than 7 days: search looks at every day
    await expect(page.getByTestId('col-built').getByTestId('board-item')).toHaveCount(1);
    await page.getByRole('searchbox', { name: 'Search' }).fill('thing');
    await expect(page.getByTestId('board-summary')).toContainText('Now 2 · Next 1 · Later 1 · Blocked 1 · Built 3'); // DM-5, DM-0 and the 11-12 ZU-1
    await page.getByRole('searchbox', { name: 'Search' }).fill('');
    await expect(page.getByTestId('board-summary')).toHaveText('Now 4 · Next 1 · Later 3 · Blocked 1 · Built (7 days) 4');
  });

  test('compact project cards: one-line meta, links, dashes, tooltip (BL-10)', async ({ page }) => {
    await page.goto('/#/projects');
    await expect(page.getByTestId('card-broken').getByRole('alert')).toContainText('HTTP 403');
    await expect(page.getByTestId('group-nofiles').getByTestId('card-bare')).toBeVisible();
    const demo = page.getByTestId('card-demo');
    await expect(demo.getByTestId('meta-line')).toHaveText('v1.3.0 · desktop · pushed 2026-11-17 · built 2026-11-17');
    await expect(demo.getByRole('link', { name: 'demo.vercel.app' })).toHaveAttribute('href', 'https://demo.vercel.app');
    await expect(demo.getByRole('link', { name: 'repo' })).toHaveAttribute('href', 'https://github.com/AlexLCBranco/demo');
    await expect(demo).toHaveAttribute('title', 'Suite time: last 3 min · longest 9 min\nEstimated: — (no estimates yet)');
    await expect(demo).not.toContainText('Backlog changed');
    const meta = (await demo.getByTestId('meta').boundingBox())!;
    expect(meta.height).toBeLessThan(45); // a line or two, not a block of rows
    const alpha = page.getByTestId('card-alpha');
    await expect(alpha.getByTestId('meta-line')).toHaveText('— · — · pushed 2026-11-17 · built —');
    await expect(alpha.getByTestId('live-link')).toHaveText('—');
    await expect(alpha).toHaveAttribute('title', 'Suite time: —\nEstimated: build ~5 min · suite ~1 min (1 of 2 items estimated)');
  });

  test('sort dropdown reorders the cards in each group and survives a reload', async ({ page }) => {
    await page.goto('/#/projects');
    const active = page.getByTestId('group-active');
    const names = () => active.locator('.card').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.slice(5)));
    const sort = page.getByRole('combobox', { name: 'Sort projects' });
    await expect(sort).toHaveValue('backlog-desc'); // default
    await expect.poll(names).toEqual(['alpha', 'demo', 'zulu', 'broken']); // unknown date (broken) last

    await sort.selectOption('name-desc');
    await expect.poll(names).toEqual(['zulu', 'demo', 'broken', 'alpha']);
    await sort.selectOption({ label: 'Created — oldest first' });
    await expect.poll(names).toEqual(['alpha', 'demo', 'broken', 'zulu']); // broken: the mock's default 2026-01-01
    await sort.selectOption('backlog-asc');
    await expect.poll(names).toEqual(['zulu', 'demo', 'alpha', 'broken']);

    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Sort projects' })).toHaveValue('backlog-asc');
    await expect.poll(names).toEqual(['zulu', 'demo', 'alpha', 'broken']);
    await page.getByRole('link', { name: 'Board' }).click(); // the board groups by the same order
    await expect(page.getByRole('group', { name: 'Filter by project' }).getByRole('button')).toHaveText(['All', 'zulu', 'demo', 'alpha', 'broken']);
  });

  test('the tab title follows the page (BL-6)', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('backlogkit · Board');
    await page.getByRole('link', { name: 'Projects', exact: true }).click();
    await expect(page).toHaveTitle('backlogkit · Projects');
    await page.getByRole('link', { name: 'Ideas', exact: true }).click();
    await expect(page).toHaveTitle('backlogkit · Ideas');
    await page.goto('/#/built');
    await expect(page).toHaveTitle('backlogkit · Built');
    await page.getByRole('searchbox', { name: 'Search' }).fill('thing');
    await expect(page).toHaveTitle('backlogkit · search “thing”');
  });

  test('Ideas tab: Unassigned first, then repos with ideas; copy works (BL-7)', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await page.getByRole('link', { name: 'Ideas', exact: true }).click();
    await expect(page).toHaveURL(/#\/ideas$/);
    const groups = page.locator('[data-testid^="ideas-"]');
    await expect.poll(() => groups.evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))).toEqual(['ideas-unassigned', 'ideas-demo']);
    await expect(page.getByTestId('ideas-unassigned')).toContainText('U-1 Orphan gadget for no repo');
    await expect(page.getByTestId('ideas-demo')).toContainText('Dark mode toggle');
    await expect(page.getByTestId('ideas-zulu')).toHaveCount(0); // IDEAS.md with no items
    await expect(page.getByTestId('ideas-alpha')).toHaveCount(0); // no IDEAS.md

    await page.getByTestId('ideas-unassigned').getByRole('button', { name: 'Copy U-1' }).click();
    expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe('- U-1 — Orphan gadget for no repo (2026-11-18)');

    await page.getByTestId('ideas-demo').getByRole('link', { name: 'demo' }).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByRole('group', { name: 'Filter by project' }).getByRole('button', { name: 'demo' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('time estimates on the board: item badges, column totals, measured times (BL-8)', async ({ page }) => {
    await page.goto('/');
    const now = page.getByTestId('col-now');
    await expect(now.getByTestId('estimate-total')).toHaveText('Estimated: build ~5 min · suite ~1 min (1 of 4 items estimated)');
    await expect(page.getByTestId('col-next').getByTestId('estimate-total')).toHaveText('Estimated: — (no estimates yet)');
    const items = now.getByTestId('board-item');
    await items.nth(0).locator('summary').click();
    await expect(items.nth(0).getByTestId('estimate')).toHaveText('build ~5 min · suite ~1 min');
    await items.nth(1).locator('summary').click();
    await expect(items.nth(1).getByTestId('estimate')).toHaveText('estimate unreadable');

    await page.goto('/#/built');
    await expect(page.getByTestId('all-built').getByTestId('took')).toHaveText('took 25 min · suite 4 min');
    await expect(page.getByTestId('all-built')).toContainText('ZU-1 Timed thing (v0.2.0)');
    await expect(page.getByTestId('all-built')).not.toContainText('(took');
  });

  test('the token never reaches the page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('col-now')).toBeVisible();
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

test('logo: header and favicon load (BL-5)', async ({ page, request }) => {
  await page.route('**/api/projects', async (r) => (live ? r.continue() : r.fulfill({ json: await fixtureData() })));
  // Locally the logo is served slowly, as the live site sometimes is: the image is visible (it has a size) before it
  // has loaded, so the check has to wait for the load rather than read it once.
  if (!live) await page.route('**/logo.svg', async (r) => { await new Promise((ok) => setTimeout(ok, 800)); await r.continue(); });
  await page.goto('/');
  const logo = page.getByTestId('logo');
  await expect(logo).toBeVisible();
  await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const href = await page.locator('link[rel="icon"]').getAttribute('href');
  expect(href).toBe('/logo.svg');
  const res = await request.get(href!);
  expect(res.ok()).toBe(true);
  expect(res.headers()['content-type']).toContain('image/svg+xml');
  expect(await res.text()).toContain('<svg');
});

test('live: real projects load from GitHub', async ({ page }) => {
  test.skip(!live, 'live only');
  await page.goto('/');
  await expect(page.getByTestId('col-now')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('board-summary')).toHaveText(/^Now \d+ · Next \d+ · Later \d+ · Blocked \d+ · Built \(7 days\) \d+$/);
  await page.goto('/#/projects');
  await expect(page.getByTestId('card-backlogkit')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('card-backlogkit').click({ position: { x: 200, y: 50 } });
  await expect(page.getByRole('group', { name: 'Filter by project' }).getByRole('button', { name: 'backlogkit', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('group', { name: 'Filter by project' }).getByRole('button', { name: 'All' }).click(); // leave no filter behind
});
