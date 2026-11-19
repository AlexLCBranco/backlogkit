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
const heads = (page: Page) => page.locator('[data-testid^="col-"] > h2').allTextContents();
const LONG = 'A very long title that keeps going well past the width of a narrow window so it has to wrap onto a second line';

test.describe('mocked GitHub', () => {
  test.skip(live, 'local only');

  test.beforeEach(async ({ page }) => {
    const data = await fixtureData();
    await page.route('**/api/projects', (r) => r.fulfill({ json: data }));
    await page.clock.setFixedTime(TODAY);
  });

  test('board home: Now, Next, Built stacked full width, no ideas, Blocked badge, counts (BL-9, BL-12)', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('backlogkit · Board');
    const cols = page.locator('[data-testid^="col-"]');
    await expect.poll(() => cols.evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))).toEqual(['col-now', 'col-next', 'col-built']);
    const boxes = await Promise.all(['now', 'next', 'built'].map((c) => page.getByTestId(`col-${c}`).boundingBox()));
    for (let i = 1; i < boxes.length; i++) expect(boxes[i - 1]!.y + boxes[i - 1]!.height).toBeLessThanOrEqual(boxes[i]!.y); // top to bottom
    const vw = page.viewportSize()!.width;
    expect(boxes[0]!.width).toBeGreaterThan(vw - 80); // the full width of the screen

    expect(await lines(page, 'now')).toEqual(['AL-1Alpha item', 'AL-2Odd estimate', 'DM-1First thing', 'DM-2Stuck thingBlocked', `ZU-2${LONG}`]);
    expect(await lines(page, 'next')).toEqual(['DM-3Later thing']);
    await expect(page.getByTestId('col-now').locator('.is-blocked .badge.blocked')).toHaveText('Blocked');
    await expect(page.getByTestId('col-now').locator('.badge.blocked')).toHaveCSS('background-color', 'rgb(107, 31, 39)'); // red
    expect(await heads(page)).toEqual(['Now 5', 'Next 1', '▸Built (7 days) 4 — demo 4']); // zulu's 11-12 is older than 7 days
    await expect(page.getByTestId('board-summary')).toHaveCount(0);
    await expect(page.getByText(/no estimates yet/)).toHaveCount(0);

    // No idea anywhere on the board, Built opened too.
    await page.getByTestId('built-toggle').click();
    const all = (await page.getByTestId('board-item').allTextContents()).join('\n');
    expect(all).not.toMatch(/\b[IU]-\d+/);
    expect(all).not.toContain('Orphan gadget');

    // Now is the most prominent section: bigger titles than Next.
    const size = (col: string) => page.getByTestId(`col-${col}`).locator('summary .title').first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    expect(await size('now')).toBeGreaterThan(await size('next'));
    // The title is the brightest text on the row; the ID is dimmed.
    const row = page.getByTestId('col-now').getByTestId('board-item').nth(2);
    const lum = (sel: string) => row.locator(sel).evaluate((e) => {
      const [r, g, b] = getComputedStyle(e).color.match(/[\d.]+/g)!.map(Number);
      return (0.2126 * r! + 0.7152 * g! + 0.0722 * b!) * Number(getComputedStyle(e).opacity);
    });
    expect(await lum('summary .title')).toBeGreaterThan(await lum('summary .id'));

    await row.locator('summary').click();
    await expect(row.getByText('Line one of the spec.')).toBeVisible();
    await row.locator('summary').click();
    await expect(row.getByText('Line one of the spec.')).toBeHidden();
  });

  test('a long title wraps instead of being cut off with "…" (BL-12)', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 800 });
    await page.goto('/');
    const title = page.getByTestId('col-now').getByTestId('board-item').last().locator('summary .title');
    await expect(title).toHaveText(LONG);
    const m = await title.evaluate((e) => ({ overflow: getComputedStyle(e).textOverflow, lh: parseFloat(getComputedStyle(e).lineHeight), h: e.clientHeight, sh: e.scrollHeight, sw: e.scrollWidth, w: e.clientWidth }));
    expect(m.overflow).not.toBe('ellipsis');
    expect(m.h).toBeGreaterThan(m.lh * 1.5); // on two lines
    expect(m.sh).toBeLessThanOrEqual(m.h + 1); // nothing hidden
    expect(m.sw).toBeLessThanOrEqual(m.w + 1);
  });

  test('Built: collapsed to one line, a click opens it grouped by repo, each repo once (BL-12)', async ({ page }) => {
    await page.goto('/#/?q=AL-1'); // nothing built matches
    await expect(page.getByTestId('col-built')).toContainText('Nothing here');
    await expect(page.getByTestId('built-toggle')).toBeDisabled();

    await page.clock.setFixedTime(new Date('2026-11-17T12:00:00')); // 7 days: 11-11 … 11-17, so zulu's 11-12 is in
    await page.goto('/');
    const toggle = page.getByTestId('built-toggle');
    await expect(toggle).toHaveText('▸Built (7 days) 5 — demo 4 · zulu 1');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('col-built').getByTestId('board-item')).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(() => page.getByTestId('built-group').evaluateAll((els) => els.map((e) => e.getAttribute('data-repo')))).toEqual(['demo', 'zulu']);
    expect(await lines(page, 'built')).toEqual(['DM-5Newest thing (v1.3.0)', 'A fix without ID (v1.2.1)', 'v1.2.0: old style line', 'DM-0Older thing (v1.1.0)', 'ZU-1Timed thing (v0.2.0)']);
    await page.getByTestId('col-built').getByRole('link', { name: 'All built' }).click();
    await expect(page).toHaveURL(/#\/built$/);
    await expect(page.getByTestId('all-built-day').last()).toContainText('ZU-1');
  });

  test('empty sections show one muted line, not an empty box (BL-12)', async ({ page }) => {
    await page.goto('/#/?q=DM-1');
    const next = page.getByTestId('col-next');
    await expect(next).toContainText('Nothing here');
    await expect(next).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(next).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
  });

  test('repo dots: one stable colour per repo, name on hover, hidden when one repo is filtered (BL-12)', async ({ page }) => {
    await page.goto('/');
    const dots = page.getByTestId('col-now').getByTestId('repo-dot');
    await expect(dots).toHaveCount(5);
    expect(await dots.evaluateAll((els) => els.map((e) => e.getAttribute('title')))).toEqual(['alpha', 'alpha', 'demo', 'demo', 'zulu']);
    const bg = (i: number) => dots.nth(i).evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(await bg(0)).toBe(await bg(1));
    expect(await bg(0)).not.toBe(await bg(2));
    await expect(page.locator('.bitem .tag')).toHaveCount(0);
    const first = await bg(2);
    await page.reload();
    expect(await bg(2)).toBe(first); // stable

    const chips = page.getByRole('group', { name: 'Filter by project' }).getByRole('button');
    await chips.filter({ hasText: 'demo' }).click();
    await expect(page.getByTestId('repo-dot')).toHaveCount(0);
    await page.getByTestId('built-toggle').click();
    await expect(page.getByTestId('built-group')).toHaveCount(1);
    await expect(page.getByTestId('repo-dot')).toHaveCount(0);
    await chips.filter({ hasText: 'alpha' }).click(); // two repos: dots again
    await expect(page.getByTestId('col-now').getByTestId('repo-dot')).toHaveCount(4);
    await chips.filter({ hasText: 'All' }).click();
  });

  test('Built keeps only the last 7 days', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-22T12:00:00')); // 7 days: 11-16 … 11-22
    await page.goto('/');
    await page.getByTestId('built-toggle').click();
    await expect.poll(() => lines(page, 'built')).toEqual(['DM-5Newest thing (v1.3.0)', 'A fix without ID (v1.2.1)', 'v1.2.0: old style line']);
  });

  test('project chips filter the board and are remembered; selected chips are filled; cards and old URLs open it filtered', async ({ page }) => {
    await page.goto('/');
    const chips = page.getByRole('group', { name: 'Filter by project' }).getByRole('button');
    await expect(chips).toHaveText(['All', 'alpha', 'demo', 'zulu', 'broken']); // card sort order
    const fill = (name: string) => chips.filter({ hasText: name }).evaluate((e) => getComputedStyle(e).backgroundColor);
    const off = await fill('alpha');
    await chips.filter({ hasText: 'alpha' }).click();
    expect(await fill('alpha')).not.toBe(off);
    expect(await fill('alpha')).toBe('rgb(122, 162, 255)'); // filled with the accent colour
    expect(await heads(page)).toEqual(['Now 2', 'Next 0', 'Built (7 days) 0']);
    await page.reload();
    await expect(chips.filter({ hasText: 'alpha' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => heads(page)).toEqual(['Now 2', 'Next 0', 'Built (7 days) 0']);
    await chips.filter({ hasText: 'All' }).click();
    await expect.poll(() => heads(page)).toEqual(['Now 5', 'Next 1', '▸Built (7 days) 4 — demo 4']);

    await page.getByRole('link', { name: 'Projects', exact: true }).click();
    await expect(page).toHaveTitle('backlogkit · Projects');
    await page.getByTestId('card-demo').click({ position: { x: 200, y: 50 } });
    await expect(page).toHaveURL(/#\/$/);
    await expect(chips.filter({ hasText: 'demo' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => heads(page)).toEqual(['Now 2', 'Next 1', '▸Built (7 days) 4 — demo 4']);

    await page.goto('/#/p/ZULU'); // an old project-page URL, any spelling
    await expect(page).toHaveURL(/#\/$/);
    await expect(chips.filter({ hasText: 'zulu' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => heads(page)).toEqual(['Now 1', 'Next 0', 'Built (7 days) 0']);
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

    await page.getByTestId('built-toggle').click();
    const built = page.getByTestId('col-built').getByTestId('board-item').first();
    await built.locator('summary').hover();
    await built.getByRole('button', { name: 'Copy DM-5' }).click();
    expect(await clipboard()).toBe('- DM-5 — Newest thing (v1.3.0)\n  What the owner sees now.');
  });

  test('search filters the board, from any page; Built opens to show matches', async ({ page }) => {
    await page.goto('/#/projects');
    await page.getByRole('searchbox', { name: 'Search' }).fill('DM-5');
    await expect(page).toHaveTitle('backlogkit · search “DM-5”');
    await expect(page.getByTestId('board-item')).toHaveCount(1);
    await expect(page.getByTestId('col-built')).toContainText('Newest thing');
    await page.getByRole('searchbox', { name: 'Search' }).fill('ZU-1'); // older than 7 days: search looks at every day
    await expect(page.getByTestId('col-built').getByTestId('board-item')).toHaveCount(1);
    await page.getByRole('searchbox', { name: 'Search' }).fill('thing');
    await expect.poll(() => heads(page)).toEqual(['Now 2', 'Next 1', '▾Built 3 — demo 2 · zulu 1']); // DM-5, DM-0 and the 11-12 ZU-1
    await page.getByRole('searchbox', { name: 'Search' }).fill('orphan'); // an idea: never on the board
    await expect(page.getByTestId('board-item')).toHaveCount(0);
    await page.getByRole('searchbox', { name: 'Search' }).fill('');
    await expect.poll(() => heads(page)).toEqual(['Now 5', 'Next 1', '▸Built (7 days) 4 — demo 4']);
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

  test('time estimates on the board: item badges, section totals only where estimated, measured times (BL-8, BL-12)', async ({ page }) => {
    await page.goto('/');
    const now = page.getByTestId('col-now');
    await expect(now.getByTestId('estimate-total')).toHaveText('Estimated: build ~5 min · suite ~1 min (1 of 5 items estimated)');
    await expect(page.getByTestId('col-next').getByTestId('estimate-total')).toHaveCount(0); // nothing estimated: no line
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
  await expect.poll(() => heads(page)).toEqual([expect.stringMatching(/^Now \d+$/), expect.stringMatching(/^Next \d+$/), expect.stringMatching(/^(▸Built \(7 days\) \d+ — .+|Built \(7 days\) 0)$/)]);
  await expect(page.getByTestId('col-later')).toHaveCount(0);
  await page.goto('/#/projects');
  await expect(page.getByTestId('card-backlogkit')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('card-backlogkit').click({ position: { x: 200, y: 50 } });
  await expect(page.getByRole('group', { name: 'Filter by project' }).getByRole('button', { name: 'backlogkit', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('group', { name: 'Filter by project' }).getByRole('button', { name: 'All' }).click(); // leave no filter behind
});
