// The site in a real browser. Locally: the built site with /api/projects mocked (fixture-data.ts). With LIVE_URL:
// the deployed site reading real GitHub, where only shape checks apply (the data changes every day).
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fixtureData } from './fixture-data';
import { BACKLOG, BUILT, IDEAS } from '../tests/fixtures';
import { heldToReady, ideaToHeld } from '../lib/moves.mjs';
import { counts, parseBacklog, parseIdeas } from '../lib/lists.mjs';

const live = !!process.env.LIVE_URL;
const pkgVersion = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;

// The fixture's built days are 2026-11-12 … 2026-11-17; the board's clock is fixed so "last 7 days" stays stable.
const TODAY = new Date('2026-11-19T12:00:00');
const lines = (page: Page, lane: string) => page.getByTestId(`lane-${lane}`).getByTestId('board-item').locator('summary').allTextContents();
const heads = (page: Page) => page.locator('[data-testid^="lane-"] > h2').allTextContents();
const stripNumbers = (page: Page) => page.getByTestId('strip').locator('b').allTextContents();
const LANE_KEYS = ['stuck', 'next', 'waiting', 'ideas', 'done'];
const ALL_HEADS = ['Stuck – needs you 1', 'Will be built next 4', 'Waiting for your OK 1', 'Ideas 3', 'Done 4'];
const LONG = 'A very long title that keeps going well past the width of a narrow window so it has to wrap onto a second line';

test.describe('mocked GitHub', () => {
  test.skip(live, 'local only');

  test.beforeEach(async ({ page }) => {
    const data = await fixtureData();
    await page.route('**/api/projects', (r) => r.fulfill({ json: data }));
    await page.clock.setFixedTime(TODAY);
  });

  test('home: five lanes in order, full width, number strip equal to the lane counts (BL-14)', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('backlogkit · Home');
    const lanes = page.locator('[data-testid^="lane-"]');
    await expect.poll(() => lanes.evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))).toEqual(LANE_KEYS.map((k) => `lane-${k}`));
    const boxes = await Promise.all(LANE_KEYS.map((k) => page.getByTestId(`lane-${k}`).boundingBox()));
    for (let i = 1; i < boxes.length; i++) expect(boxes[i - 1]!.y + boxes[i - 1]!.height).toBeLessThanOrEqual(boxes[i]!.y); // top to bottom
    expect(boxes[0]!.width).toBeGreaterThan(page.viewportSize()!.width - 80);

    expect(await heads(page)).toEqual(ALL_HEADS);
    expect(await stripNumbers(page)).toEqual(['1', '4', '1', '3', '4']);
    await expect(page.getByTestId('strip').locator('span')).toHaveText(['Stuck – needs you', 'Will be built next', 'Waiting for your OK', 'Ideas', 'Done']);
    const strip = (await page.getByTestId('strip').boundingBox())!;
    expect(strip.y).toBeLessThan(boxes[0]!.y); // at the very top

    expect(await lines(page, 'stuck')).toEqual(['demoDM-2Stuck thing']);
    expect(await lines(page, 'next')).toEqual(['alphaAL-1Alpha item', 'alphaAL-2Odd estimate', 'demoDM-1First thing', `zuluZU-2${LONG}`]);
    expect(await lines(page, 'waiting')).toEqual(['demoDM-3Later thing']);
    await expect(page.getByTestId('lane-ideas').getByRole('link', { name: '3 ideas' })).toHaveAttribute('href', '#/ideas');
    expect(await lines(page, 'done')).toEqual(['demoDM-5Newest thing (v1.3.0)', 'demoA fix without ID (v1.2.1)', 'demov1.2.0: old style line', 'demoDM-0Older thing (v1.1.0)']); // zulu's 11-12 is older than 7 days

    // Stuck is red-tinted; its number red above 0.
    await expect(page.getByTestId('lane-stuck')).toHaveCSS('background-color', 'rgb(42, 21, 25)');
    await expect(page.getByTestId('strip-stuck')).toHaveCSS('background-color', 'rgb(122, 31, 42)');

    const row = page.getByTestId('lane-next').getByTestId('board-item').nth(2);
    await row.locator('summary').click();
    await expect(row.getByText('Line one of the spec.')).toBeVisible();
    await row.locator('summary').click();
    await expect(row.getByText('Line one of the spec.')).toBeHidden();
  });

  test('clicking a number scrolls to its lane (BL-14)', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 500 });
    await page.goto('/');
    await expect(page.getByTestId('lane-done')).toBeVisible();
    for (const k of ['done', 'ideas', 'stuck']) {
      await page.getByTestId(`strip-${k}`).click();
      // At the top of the window, or (a lane near the end) the page scrolled as far as it goes with the lane in view.
      await expect
        .poll(() => page.getByTestId(`lane-${k}`).evaluate((e) => {
          const r = e.getBoundingClientRect();
          const atEnd = Math.abs(scrollY + innerHeight - document.documentElement.scrollHeight) < 2;
          return r.top >= 0 && (r.top < 120 || (atEnd && scrollY > 0 && r.top < innerHeight));
        }))
        .toBe(true);
      await page.evaluate(() => scrollTo(0, 0));
    }
  });

  test('an empty lane shows its muted line; the Stuck number is grey at 0 (BL-14)', async ({ page }) => {
    await page.goto('/#/?q=AL-1');
    await expect(page.getByTestId('lane-stuck')).toContainText('Nothing stuck.');
    await expect(page.getByTestId('lane-waiting')).toContainText('Nothing waiting for your OK.');
    await expect(page.getByTestId('lane-done')).toContainText('Nothing built in the last 7 days.');
    await expect(page.getByTestId('lane-stuck').locator('.empty')).toHaveCSS('color', 'rgb(139, 147, 163)'); // muted
    await expect(page.getByTestId('strip-stuck')).toHaveCSS('background-color', 'rgb(42, 45, 53)');
  });

  test('a long title wraps instead of being cut off with "…" (BL-12)', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 800 });
    await page.goto('/');
    const title = page.getByTestId('lane-next').getByTestId('board-item').last().locator('summary .title');
    await expect(title).toHaveText(LONG);
    const m = await title.evaluate((e) => ({ overflow: getComputedStyle(e).textOverflow, lh: parseFloat(getComputedStyle(e).lineHeight), h: e.clientHeight, sh: e.scrollHeight, sw: e.scrollWidth, w: e.clientWidth }));
    expect(m.overflow).not.toBe('ellipsis');
    expect(m.h).toBeGreaterThan(m.lh * 1.5); // on two lines
    expect(m.sh).toBeLessThanOrEqual(m.h + 1); // nothing hidden
    expect(m.sw).toBeLessThanOrEqual(m.w + 1);
  });

  test('Done: last 7 days grouped by repo, link to everything built', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-17T12:00:00')); // 7 days: 11-11 … 11-17, so zulu's 11-12 is in
    await page.goto('/');
    await expect.poll(() => page.getByTestId('built-group').evaluateAll((els) => els.map((e) => e.getAttribute('data-repo')))).toEqual(['demo', 'zulu']);
    await page.getByTestId('lane-done').getByRole('link', { name: 'Everything built' }).click();
    await expect(page).toHaveURL(/#\/built$/);
    await expect(page.getByTestId('all-built-day').last()).toContainText('ZU-1');
  });

  test('project chips: All projects first, at least 32 px tall, filter lanes and strip, remembered; cards and old URLs open it filtered', async ({ page }) => {
    await page.goto('/');
    const chips = page.getByRole('group', { name: 'Filter by project' }).getByRole('button');
    await expect(chips).toHaveText(['All projects', 'alpha', 'demo', 'zulu', 'broken']); // card sort order
    for (const h of await chips.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(32);
    const fill = (name: string) => chips.filter({ hasText: name }).evaluate((e) => getComputedStyle(e).backgroundColor);
    const off = await fill('alpha');
    await chips.filter({ hasText: 'alpha' }).click();
    expect(await fill('alpha')).not.toBe(off);
    expect(await heads(page)).toEqual(['Stuck – needs you 0', 'Will be built next 2', 'Waiting for your OK 0', 'Ideas 0', 'Done 0']);
    expect(await stripNumbers(page)).toEqual(['0', '2', '0', '0', '0']);
    await page.reload();
    await expect(chips.filter({ hasText: 'alpha' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => stripNumbers(page)).toEqual(['0', '2', '0', '0', '0']);
    await chips.filter({ hasText: 'All projects' }).click();
    await expect.poll(() => heads(page)).toEqual(ALL_HEADS);

    await page.getByRole('link', { name: 'Projects', exact: true }).click();
    await expect(page).toHaveTitle('backlogkit · Projects');
    await page.getByTestId('card-demo').click({ position: { x: 200, y: 50 } });
    await expect(page).toHaveURL(/#\/$/);
    await expect(chips.filter({ hasText: 'demo' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => heads(page)).toEqual(['Stuck – needs you 1', 'Will be built next 1', 'Waiting for your OK 1', 'Ideas 2', 'Done 4']);

    await page.goto('/#/p/ZULU'); // an old project-page URL, any spelling
    await expect(page).toHaveURL(/#\/$/);
    await expect(chips.filter({ hasText: 'zulu' })).toHaveAttribute('aria-pressed', 'true');
    await page.goto('/#/all'); // the old All repos view
    await expect(page.getByTestId('lane-next')).toBeVisible();
  });

  test('copy button shows on hover of the line and copies without toggling it', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const clipboard = async () => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'); // Windows' clipboard reads back CRLF
    await page.goto('/');
    const row = page.getByTestId('lane-next').getByTestId('board-item').nth(2);
    const copy = row.getByRole('button', { name: 'Copy DM-1' });
    await expect(copy).toBeHidden();
    await row.locator('summary').hover();
    await expect(copy).toBeVisible();
    await copy.click();
    await expect(copy).toHaveAttribute('data-copied', 'true');
    expect(await clipboard()).toBe('### DM-1 — First thing\nLine one of the spec.\n- a bullet\n  continued');
    await expect(row).not.toHaveAttribute('open');

    const built = page.getByTestId('lane-done').getByTestId('board-item').first();
    await built.locator('summary').hover();
    await built.getByRole('button', { name: 'Copy DM-5' }).click();
    expect(await clipboard()).toBe('- DM-5 — Newest thing (v1.3.0)\n  What the owner sees now.');
  });

  test('search: "Search everything…" from any page searches every lane and the ideas', async ({ page }) => {
    await page.goto('/#/projects');
    const box = page.getByRole('searchbox', { name: 'Search' });
    await expect(box).toHaveAttribute('placeholder', 'Search everything…');
    await box.fill('DM-5');
    await expect(page).toHaveTitle('backlogkit · search “DM-5”');
    await expect(page.getByTestId('board-item')).toHaveCount(1);
    await expect(page.getByTestId('lane-done')).toContainText('Newest thing');
    await box.fill('ZU-1'); // older than 7 days: search looks at every day
    await expect(page.getByTestId('lane-done').getByTestId('board-item')).toHaveCount(1);
    await box.fill('thing');
    await expect.poll(() => heads(page)).toEqual(['Stuck – needs you 1', 'Will be built next 1', 'Waiting for your OK 1', 'Ideas 1', 'Done 3']); // "Something long" is an idea; ZU-1 is older than 7 days
    await page.goto('/#/ideas');
    await box.fill('orphan'); // an idea
    await expect(page.getByTestId('lane-ideas').getByTestId('idea')).toHaveText(['Unassigned U-1 Orphan gadget for no repo (2026-11-18)']);
    await box.fill('');
    await expect.poll(() => heads(page)).toEqual(ALL_HEADS);
  });

  test('one vocabulary: none of Now, Next, Ready, Held, Planned as labels on any page (BL-14)', async ({ page }) => {
    const data = { ...(await fixtureData()), canMove: true };
    await page.route('**/api/projects', (r) => r.fulfill({ json: data }));
    await page.route('**/api/move', (r) => r.fulfill({ json: { ok: true } }));
    await page.addInitScript(() => localStorage.setItem('backlogkit.owner', 'pw')); // unlocked: the buttons show too
    for (const hash of ['#/', '#/projects', '#/ideas', '#/built']) {
      await page.goto('/' + hash);
      await expect(page.locator('main')).not.toContainText('Reading GitHub');
      await expect(page.getByTestId('site-version')).toBeVisible();
      const words = await page.evaluate(() => {
        const root = document.body.cloneNode(true) as HTMLElement;
        root.querySelectorAll('.body').forEach((b) => b.remove()); // spec text is the owner's own words
        const attrs = [...root.querySelectorAll('[title],[aria-label],[placeholder]')].map((e) => `${e.getAttribute('title') ?? ''} ${e.getAttribute('aria-label') ?? ''} ${e.getAttribute('placeholder') ?? ''}`);
        return `${root.innerText}\n${attrs.join('\n')}\n${document.title}`;
      });
      expect(words, hash).not.toMatch(/\b(Now|Next|Ready|Held|Planned)\b/);
    }
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
    await page.getByRole('link', { name: 'Home' }).click(); // the home page groups by the same order
    await expect(page.getByRole('group', { name: 'Filter by project' }).getByRole('button')).toHaveText(['All projects', 'zulu', 'demo', 'alpha', 'broken']);
  });

  test('the tab title follows the page (BL-6)', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('backlogkit · Home');
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

  test('time estimates on the home page: item badges, lane totals only where estimated, measured times (BL-8, BL-12)', async ({ page }) => {
    await page.goto('/');
    const now = page.getByTestId('lane-next');
    await expect(now.getByTestId('estimate-total')).toHaveText('Estimated: build ~5 min · suite ~1 min (1 of 4 items estimated)');
    await expect(page.getByTestId('lane-waiting').getByTestId('estimate-total')).toHaveCount(0); // nothing estimated: no line
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

  test('one-click moves: hidden until the owner unlocks; Give OK and Plan it move items and stay unlocked (BL-11)', async ({ page }) => {
    // Moves off (the server has no OWNER_PASSWORD / GITHUB_WRITE_TOKEN): no Owner button, no move buttons.
    await page.goto('/');
    await expect(page.getByTestId('lane-next')).toBeVisible();
    await expect(page.getByTestId('owner')).toHaveCount(0);
    await expect(page.getByTestId('move')).toHaveCount(0);

    // Moves on: /api/move answered here with the real text edits; the password is checked like the server does.
    const data = { ...(await fixtureData()), canMove: true };
    const sent: unknown[] = [];
    let backlog = BACKLOG;
    let ideas = IDEAS;
    // GitHub's state as it is now (after the moves so far).
    await page.route('**/api/projects', (r) => {
      const planned = parseBacklog(backlog);
      const list = parseIdeas(ideas);
      r.fulfill({ json: { ...data, projects: data.projects.map((p) => (p.repo === 'demo' ? { ...p, planned, ideas: list, counts: counts(planned, list) } : p)) } });
    });
    await page.route('**/api/move', async (r) => {
      if (r.request().headers()['x-owner-password'] !== 'pw-e2e') return r.fulfill({ status: 401, json: { error: 'Wrong owner password' } });
      const body = r.request().postDataJSON();
      if (body.action === 'check') return r.fulfill({ json: { ok: true } });
      sent.push(body);
      if (body.action === 'ready') backlog = heldToReady({ backlog, id: body.id }).backlog;
      else ({ ideas, backlog } = ideaToHeld({ ideasText: ideas, ideaId: body.id, backlog, built: BUILT }));
      const planned = parseBacklog(backlog);
      const list = parseIdeas(ideas);
      return r.fulfill({ json: { ok: true, message: 'ok', updates: [{ repo: 'demo', planned, ideas: list, counts: counts(planned, list) }] } });
    });
    await page.reload();
    await expect(page.getByTestId('move')).toHaveCount(0); // not unlocked yet
    await page.getByTestId('owner').click();
    await page.getByLabel('Owner password').fill('wrong');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByTestId('owner-form').getByRole('alert')).toHaveText('Wrong owner password');
    await page.getByLabel('Owner password').fill('pw-e2e');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByTestId('owner')).toHaveText('Owner ✓');

    await expect(page.getByTestId('lane-next').getByTestId('move')).toHaveCount(0);
    const waiting = page.getByTestId('lane-waiting');
    await waiting.getByRole('button', { name: 'Give OK' }).click();
    await expect.poll(() => lines(page, 'next')).toContain('demoDM-3Later thing');
    expect(await lines(page, 'waiting')).toEqual([]);
    await expect(waiting).toContainText('Nothing waiting for your OK.');

    await page.reload(); // still unlocked in this browser
    await page.goto('/#/ideas');
    const demoIdeas = page.getByTestId('ideas-demo');
    await demoIdeas.getByRole('button', { name: /Plan I-1/ }).click();
    await expect(demoIdeas.getByTestId('idea')).toHaveCount(1);
    await expect(demoIdeas).not.toContainText('Dark mode toggle');
    await page.goto('/');
    await expect.poll(() => lines(page, 'waiting')).toEqual(['demoDM-6Dark mode toggleGive OK']);
    expect(sent).toEqual([{ action: 'ready', repo: 'demo', id: 'DM-3' }, { action: 'idea', repo: 'demo', id: 'I-1' }]);

    // Lock: buttons gone, and gone after a reload too.
    await page.getByTestId('owner').click();
    await expect(page.getByTestId('owner')).toHaveText('Owner');
    await expect(page.getByTestId('move')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('lane-waiting').getByTestId('board-item')).toHaveCount(1);
    await expect(page.getByTestId('owner')).toHaveText('Owner');
    await expect(page.getByTestId('move')).toHaveCount(0);
  });

  test('the token never reaches the page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('lane-next')).toBeVisible();
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
  await expect(page.getByTestId('lane-next')).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => heads(page)).toEqual([/^Stuck – needs you \d+$/, /^Will be built next \d+$/, /^Waiting for your OK \d+$/, /^Ideas \d+$/, /^Done \d+$/].map((r) => expect.stringMatching(r)));
  await expect(page.getByTestId('strip').locator('b')).toHaveCount(5);
  await page.goto('/#/projects');
  await expect(page.getByTestId('card-backlogkit')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('card-backlogkit').click({ position: { x: 200, y: 50 } });
  await expect(page.getByRole('group', { name: 'Filter by project' }).getByRole('button', { name: 'backlogkit', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('group', { name: 'Filter by project' }).getByRole('button', { name: 'All projects' }).click(); // leave no filter behind
});

test('live: moves are protected: no password, or a wrong one, writes nothing (BL-11)', async ({ request }) => {
  test.skip(!live, 'live only');
  const body = { action: 'ready', repo: 'backlogkit', id: 'BL-1' };
  const none = await request.post('/api/move', { data: body });
  expect([401, 503]).toContain(none.status()); // 503: moves not set up yet
  const wrong = await request.post('/api/move', { data: body, headers: { 'x-owner-password': 'not-the-password' } });
  expect([401, 503]).toContain(wrong.status());
});
