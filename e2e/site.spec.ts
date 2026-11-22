// The site in a real browser. Locally: the built site with /api/projects mocked (fixture-data.ts). With LIVE_URL:
// the deployed site reading real GitHub, where only shape checks apply (the data changes every day).
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fixtureData } from './fixture-data';
import { BACKLOG, BUILT, IDEAS, mockGithub, projectsJson } from '../tests/fixtures';
import { loadAll } from '../lib/github.mjs';
import { answerBlocked, heldToReady, ideaToHeld, setWhy } from '../lib/moves.mjs';
import { counts, parseBacklog, parseIdeas } from '../lib/lists.mjs';

const live = !!process.env.LIVE_URL;
const pkgVersion = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;

// The fixture's built days are 2026-11-12 … 2026-11-17; the board's clock is fixed so "last 7 days" stays stable.
const TODAY = new Date('2026-11-19T12:00:00');
// A row as "label | sentence | ID"; a sentence ending in * has the "no summary yet" tag (BL-15).
const lines = (page: Page, lane: string) =>
  page.getByTestId(`lane-${lane}`).getByTestId('board-item').locator('summary').evaluateAll((els) =>
    els.map((s) => {
      const title = s.querySelector('.title')!;
      const text = (title.firstChild!.textContent ?? '') + (title.querySelector('.no-summary') ? '*' : '');
      return [s.querySelector('.tag')!.textContent, text, s.querySelector('.id')?.textContent].filter(Boolean).join(' | ');
    }),
  );
const heads = (page: Page) => page.locator('[data-testid^="lane-"] > h2').allTextContents();
const stripNumbers = (page: Page) => page.getByTestId('strip').locator('b').allTextContents();
/** "Go anywhere" (Ctrl+K), type, and pick "Search everything for …". */
export async function searchAll(page: Page, words: string) {
  await page.keyboard.press('Control+k');
  await page.getByTestId('go-input').fill(words);
  await page.getByTestId('go-item').filter({ hasText: `Search everything for “${words}”` }).click();
}
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

    expect(await lines(page, 'stuck')).toEqual(['demo | Stuck thing* | DM-2']);
    expect(await lines(page, 'next')).toEqual(['alpha | Alpha gets a plain sentence. | AL-1', 'alpha | Odd estimate* | AL-2', 'demo | First thing* | DM-1', `zulu | ${LONG}* | ZU-2`]);
    expect(await lines(page, 'waiting')).toEqual(['demo | Later thing* | DM-3']);
    await expect(page.getByTestId('lane-ideas').getByTestId('ideas-row')).toHaveText(['Needs your decision 1 Orphan gadget for no repo', 'No reason yet 2 Dark mode toggle']);
    await expect(page.getByTestId('done-summary')).toHaveText('4 new since you last looked'); // first visit: zulu's 11-12 is older than 7 days
    await expect(page.getByTestId('strip-done')).toHaveCSS('background-color', 'rgb(23, 48, 31)'); // green while there is something new

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
    await expect(page.getByTestId('lane-done')).toContainText('Nothing built matches.');
    await expect(page.getByTestId('lane-stuck').locator('.empty')).toHaveCSS('color', 'rgb(139, 147, 163)'); // muted
    await expect(page.getByTestId('strip-stuck')).toHaveCSS('background-color', 'rgb(42, 45, 53)');
  });

  test('cards: project name as text, plain sentence first, ID at the right, no dots (BL-15)', async ({ page }) => {
    await page.goto('/');
    const card = page.getByTestId('lane-next').getByTestId('board-item').first();
    await expect(card).toBeVisible();
    const parts = await card.locator('summary > *').evaluateAll((els) => els.filter((e) => getComputedStyle(e).visibility !== 'hidden').map((e) => ({ cls: e.className, text: e.textContent, x: e.getBoundingClientRect().x })));
    expect(parts[0]).toMatchObject({ cls: 'tag', text: 'alpha' });
    expect(parts[1]).toMatchObject({ cls: 'title', text: 'Alpha gets a plain sentence.' });
    expect(parts.at(-1)).toMatchObject({ cls: 'id', text: 'AL-1' });
    expect(parts.at(-1)!.x).toBeGreaterThan(page.viewportSize()!.width - 150); // at the right edge
    const plain = page.getByTestId('lane-next').getByTestId('board-item').nth(2);
    await expect(plain.locator('summary .title')).toHaveText('First thingno summary yet');
    await expect(plain.getByTestId('no-summary')).toBeVisible();
    await card.locator('summary').click();
    await expect(card.locator('.spec-title')).toHaveText('Alpha item');
    for (const hash of ['/', '/#/ideas', '/#/built']) {
      await page.goto(hash);
      await expect(page.getByTestId('repo-label').first()).toBeVisible();
      await expect(page.locator('.dot, [data-testid="repo-dot"]')).toHaveCount(0);
    }
  });

  test('a long title wraps instead of being cut off with "…" (BL-12)', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 800 });
    await page.goto('/');
    const title = page.getByTestId('lane-next').getByTestId('board-item').last().locator('summary .title');
    await expect(title).toHaveText(`${LONG}no summary yet`);
    const m = await title.evaluate((e) => ({ overflow: getComputedStyle(e).textOverflow, lh: parseFloat(getComputedStyle(e).lineHeight), h: e.clientHeight, sh: e.scrollHeight, sw: e.scrollWidth, w: e.clientWidth }));
    expect(m.overflow).not.toBe('ellipsis');
    expect(m.h).toBeGreaterThan(m.lh * 1.5); // on two lines
    expect(m.sh).toBeLessThanOrEqual(m.h + 1); // nothing hidden
    expect(m.sw).toBeLessThanOrEqual(m.w + 1);
  });

  test('Done: new since your last visit, grouped by project; Mark all seen empties it and it stays empty (BL-18)', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-17T12:00:00')); // 7 days: 11-11 … 11-17, so zulu's 11-12 is in
    await page.goto('/');
    const done = page.getByTestId('lane-done');
    await expect(done.getByTestId('done-summary')).toHaveText('5 new since you last looked');
    await expect(done.locator('.done-row')).toHaveText(['▸demo 4 Newest thing (v1.3.0)', '▸zulu 1 Timed thing (v0.2.0)']); // the measured time is not part of the line
    await expect(done.getByTestId('done-item')).toHaveCount(0);
    await done.locator('.done-row').first().click();
    await expect(done.getByTestId('done-item').locator('.done-title')).toHaveText(['Newest thing (v1.3.0)', 'A fix without ID (v1.2.1)', 'v1.2.0: old style line', 'Older thing (v1.1.0)']);
    await expect(done.getByTestId('done-item').first().locator('.done-detail')).toHaveText('What the owner sees now.');
    await expect(done).not.toContainText('secret housekeeping'); // ### Internal left out
    await expect(page.getByTestId('strip-done').locator('b')).toHaveText('5');

    await page.reload(); // a reload marks nothing
    await expect(done.getByTestId('done-summary')).toHaveText('5 new since you last looked');
    await done.getByTestId('mark-seen').click();
    await expect(done.getByTestId('done-summary')).toHaveText('Nothing new · 5 built in the last 7 days');
    await expect(done.getByTestId('done-group')).toHaveCount(0);
    await expect(page.getByTestId('strip-done').locator('b')).toHaveText('0');
    await page.reload();
    await expect(done.getByTestId('done-summary')).toHaveText('Nothing new · 5 built in the last 7 days');
    await expect(done.getByTestId('done-group')).toHaveCount(0);

    await done.getByRole('link', { name: 'Everything built' }).click();
    await expect(page).toHaveURL(/#\/built$/);
    await expect(page.getByTestId('all-built-day').filter({ hasText: '2026-11-12' })).toContainText('ZU-1'); // older than 7 days
  });

  test('project chips: All projects first, at least 32 px tall, filter lanes and strip, kept in the address; cards and old URLs open it filtered', async ({ page }) => {
    await page.goto('/');
    const chips = page.getByRole('group', { name: 'Filter by project' }).getByRole('button');
    await expect(chips).toHaveText(['All projects', 'alpha', 'demo', 'zulu', 'broken']); // card sort order
    for (const h of await chips.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(32);
    const fill = (name: string) => chips.filter({ hasText: name }).evaluate((e) => getComputedStyle(e).backgroundColor);
    const off = await fill('alpha');
    await chips.filter({ hasText: 'alpha' }).click();
    await expect.poll(() => fill('alpha')).not.toBe(off);
    expect(await heads(page)).toEqual(['Stuck – needs you 0', 'Will be built next 2', 'Waiting for your OK 0', 'Ideas 0', 'Done 0']);
    expect(await stripNumbers(page)).toEqual(['0', '2', '0', '0', '0']);
    await expect(page).toHaveURL(/#\/\?p=alpha$/);
    await page.reload();
    await expect(chips.filter({ hasText: 'alpha' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => stripNumbers(page)).toEqual(['0', '2', '0', '0', '0']);
    await chips.filter({ hasText: 'All projects' }).click();
    await expect.poll(() => heads(page)).toEqual(ALL_HEADS);

    await page.getByRole('link', { name: 'Projects', exact: true }).click();
    await expect(page).toHaveTitle('backlogkit · Projects');
    await page.getByTestId('card-demo').click({ position: { x: 200, y: 50 } });
    await expect(page).toHaveURL(/#\/\?p=demo$/);
    await expect(chips.filter({ hasText: 'demo' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => heads(page)).toEqual(['Stuck – needs you 1', 'Will be built next 1', 'Waiting for your OK 1', 'Ideas 2', 'Done 4']);

    await page.goto('/#/p/ZULU'); // an old project-page URL, any spelling
    await expect(page).toHaveURL(/#\/\?p=zulu$/);
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

    await page.getByTestId('lane-done').locator('.done-row').first().click();
    const built = page.getByTestId('lane-done').getByTestId('done-item').first();
    await built.getByRole('button', { name: 'Copy DM-5' }).click();
    expect(await clipboard()).toBe('- DM-5 — Newest thing (v1.3.0)\n  What the owner sees now.');
  });

  test('search: "Go anywhere" → Search everything, from any page, searches every lane and the ideas', async ({ page }) => {
    await page.goto('/#/projects');
    await expect(page.getByTestId('card-demo')).toBeVisible();
    await searchAll(page, 'DM-5');
    const box = page.getByRole('searchbox', { name: 'Search' });
    await expect(box).toHaveValue('DM-5');
    await expect(page).toHaveTitle('backlogkit · search “DM-5”');
    await expect(page.getByTestId('board-item')).toHaveCount(1);
    await expect(page.getByTestId('lane-done')).toContainText('Newest thing');
    await box.fill('ZU-1'); // older than 7 days: search looks at every day
    await expect(page.getByTestId('lane-done').getByTestId('board-item')).toHaveCount(1);
    await box.fill('thing');
    await expect.poll(() => heads(page)).toEqual(['Stuck – needs you 1', 'Will be built next 1', 'Waiting for your OK 1', 'Ideas 1', 'Done 3']); // "Something long" is an idea; ZU-1 is older than 7 days
    await page.goto('/#/ideas');
    await expect(page.getByTestId('why-decision')).toBeVisible();
    await searchAll(page, 'orphan'); // an idea
    await expect(page.getByTestId('lane-ideas').getByTestId('idea')).toHaveText(['Unassigned U-1 Orphan gadget for no repo']);
    await page.getByTestId('search-clear').click();
    await expect(page).toHaveTitle('backlogkit · Home');
    await expect.poll(() => heads(page)).toEqual(ALL_HEADS);
  });

  test('searching a code explains it in a box at the top; an unknown code says so (BL-20)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('lane-done')).toBeVisible();
    await expect(page.getByTestId('code-box')).toHaveCount(0);
    await searchAll(page, 'ck-17');
    const box = page.getByTestId('code-box');
    await expect(box.getByTestId('code-id')).toHaveText('CK-17');
    await expect(box.getByTestId('code-title')).toHaveText('Week view');
    await expect(box.getByTestId('code-repo')).toHaveText('zulu');
    await expect(box.getByTestId('code-state')).toHaveText('Built · v0.1.0 · 2026-10-01');
    await expect(box.getByTestId('code-short')).toHaveText('The calendar shows one week at a time.');
    await expect(box.getByTestId('code-link')).toHaveAttribute('href', 'https://github.com/AlexLCBranco/zulu/blob/main/BUILT.md');
    // Above the results, which stay below with the item in them.
    const top = (await box.boundingBox())!;
    expect(top.y + top.height).toBeLessThanOrEqual((await page.getByTestId('strip').boundingBox())!.y);
    await expect(page.getByTestId('lane-done').getByTestId('board-item')).toHaveCount(1);
    await expect(page.getByTestId('lane-done')).toContainText('Week view');

    const search = page.getByRole('searchbox', { name: 'Search' });
    await search.fill('CK-999');
    await expect(page.getByTestId('code-missing')).toHaveText('No feature has the code CK-999');
    await expect(page.getByTestId('code-hit')).toHaveCount(0);
    await expect(page.locator('[data-testid^="lane-"]')).toHaveCount(5);
    await search.fill('thing'); // ordinary words: no box
    await expect(page.getByTestId('code-box')).toHaveCount(0);
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

  test('sort switches (How) reorder the cards in each group; the order is in the address and survives a reload', async ({ page }) => {
    await page.goto('/#/projects');
    const active = page.getByTestId('group-active');
    const names = () => active.locator('.card').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.slice(5)));
    const field = page.getByRole('radiogroup', { name: 'Sort projects by' });
    const dir = page.getByRole('radiogroup', { name: 'Sort direction' });
    await expect(field.getByRole('radio', { name: 'Backlog changed' })).toHaveAttribute('aria-checked', 'true'); // default
    await expect(dir.getByRole('radio', { name: 'Newest first' })).toHaveAttribute('aria-checked', 'true');
    await expect(page).toHaveURL(/#\/projects\?sort=backlog-desc$/);
    await expect.poll(names).toEqual(['alpha', 'demo', 'zulu', 'broken']); // unknown date (broken) last

    await field.getByRole('radio', { name: 'Name' }).click();
    await expect.poll(names).toEqual(['alpha', 'broken', 'demo', 'zulu']); // A–Z
    await dir.getByRole('radio', { name: 'Z–A' }).click();
    await expect.poll(names).toEqual(['zulu', 'demo', 'broken', 'alpha']);
    await field.getByRole('radio', { name: 'Created' }).click();
    await dir.getByRole('radio', { name: 'Oldest first' }).click();
    await expect.poll(names).toEqual(['alpha', 'demo', 'broken', 'zulu']); // broken: the mock's default 2026-01-01
    await field.getByRole('radio', { name: 'Backlog changed' }).click();
    await dir.getByRole('radio', { name: 'Oldest first' }).click();
    await expect.poll(names).toEqual(['zulu', 'demo', 'alpha', 'broken']);
    await expect(page).toHaveURL(/#\/projects\?sort=backlog-asc$/);

    await page.reload();
    await expect(dir.getByRole('radio', { name: 'Oldest first' })).toHaveAttribute('aria-checked', 'true');
    await expect.poll(names).toEqual(['zulu', 'demo', 'alpha', 'broken']);
    await page.getByRole('link', { name: 'Home', exact: true }).click(); // the home page groups by the same order
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
    await searchAll(page, 'thing');
    await expect(page).toHaveTitle('backlogkit · search “thing”');
  });

  test('Ideas page: grouped by reason in order with counts, notes under the idea, copy keeps the whole line (BL-7, BL-17)', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await page.getByRole('link', { name: 'Ideas', exact: true }).click();
    await expect(page).toHaveURL(/#\/ideas$/);
    await expect(page.locator('[data-testid^="why-"] h3')).toHaveText(['Needs your decision 1', 'Waiting on something 0', 'Too big, needs splitting 0', 'Not important yet 0', 'No reason yet 2', 'Maybe never 0']);
    const decision = page.getByTestId('why-decision');
    await expect(decision.locator('.idea-main')).toHaveText('Unassigned U-1 Orphan gadget for no repo');
    await expect(decision.getByTestId('idea-note')).toHaveText('2026-11-18');
    await expect(decision.getByTestId('idea-note')).toHaveCSS('font-size', '12px');
    await expect(page.getByTestId('why-none').locator('.idea-main')).toHaveText(['demo I-1 Dark mode toggle', 'demo I-2 Something long that wraps']);
    await expect(page.getByTestId('why-never')).not.toHaveAttribute('open');

    await decision.getByRole('button', { name: 'Copy U-1' }).click();
    expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe('- U-1 — Orphan gadget for no repo (2026-11-18) [why: decision]');

    // A home row opens the Ideas page at its group.
    await page.goto('/');
    await page.getByTestId('lane-ideas').getByTestId('ideas-row').last().click();
    await expect(page).toHaveURL(/#\/ideas\/none$/);
  });

  test('Ideas page: the reason dropdown (owner only) sends the right request and regroups (BL-17)', async ({ page }) => {
    const data = { ...(await fixtureData()), canMove: true };
    let ideas = IDEAS;
    const sent: unknown[] = [];
    await page.route('**/api/projects', (r) => r.fulfill({ json: data }));
    await page.route('**/api/move', async (r) => {
      const body = r.request().postDataJSON();
      if (body.action === 'check') return r.fulfill({ json: { ok: true } });
      sent.push(body);
      ideas = setWhy(ideas, body.id, body.why).ideas;
      return r.fulfill({ json: { ok: true, message: 'ok', updates: [{ repo: 'demo', ideas: parseIdeas(ideas) }] } });
    });
    await page.addInitScript(() => localStorage.setItem('backlogkit.owner', 'pw'));
    await page.goto('/#/ideas');
    const pick = page.getByLabel('Reason for I-2');
    await expect(pick).toHaveValue('none');
    await pick.selectOption({ label: 'Too big, needs splitting' });
    await expect(page.getByTestId('why-too-big').locator('.idea-main')).toContainText('Something long that wraps');
    await expect(page.locator('[data-testid^="why-"] h3')).toHaveText(['Needs your decision 1', 'Waiting on something 0', 'Too big, needs splitting 1', 'Not important yet 0', 'No reason yet 1', 'Maybe never 0']);
    expect(sent).toEqual([{ action: 'reason', repo: 'demo', id: 'I-2', why: 'too-big' }]);
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
    await expect.poll(() => lines(page, 'next')).toContain('demo | Later thing* | DM-3');
    expect(await lines(page, 'waiting')).toEqual([]);
    await expect(waiting).toContainText('Nothing waiting for your OK.');

    await page.reload(); // still unlocked in this browser
    await page.goto('/#/ideas');
    const demoIdeas = page.getByTestId('why-none');
    await demoIdeas.getByRole('button', { name: /Plan I-1/ }).click();
    await expect(demoIdeas.getByTestId('idea')).toHaveCount(1);
    await expect(demoIdeas).not.toContainText('Dark mode toggle');
    await page.goto('/');
    await expect.poll(() => lines(page, 'waiting')).toEqual(['demo | Dark mode toggle* | DM-6']);
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

  test('a stuck item naming a built ID says "can be unblocked", in green, first in Stuck (BL-21)', async ({ page }) => {
    const repos = ['alpha', 'footy', 'halftime'];
    const { fetchImpl } = mockGithub({
      repos: repos.map((name) => ({ name })),
      files: {
        alpha: { 'FEATURE_BACKLOG.md': '## Ready\n\n### AL-1 — Alpha waits for a person\nBlocked: the owner picks a colour.\n\n### AL-2 — Alpha waits for a planned thing\nBlocked: after HT-2 and HT-9.\n' },
        footy: { 'FEATURE_BACKLOG.md': '## Held\n\n### FK-61 — Whistle at half time\nBlocked: the owner unblocks it once HT-1 ships.\n' },
        halftime: { 'FEATURE_BACKLOG.md': '## Ready\n\n### HT-2 — Second half\nText.\n', 'BUILT.md': '## 2026-11-18\n- HT-1 — Half time timer (v1.0.0)\n' },
      },
      projectsJson: projectsJson(repos.map((repo) => ({ repo, description: null, url: null, status: 'active', devices: null }))),
    });
    const data = await loadAll({ token: 'e2e-secret-token-value', fetchImpl });
    await page.route('**/api/projects', (r) => r.fulfill({ json: data }));
    await page.goto('/');
    const stuck = page.getByTestId('lane-stuck');
    await expect(stuck.getByTestId('stuck-card').locator('.id')).toHaveText(['FK-61', 'AL-1', 'AL-2']); // footy is after alpha by name, yet first
    const first = stuck.getByTestId('stuck-card').first();
    await expect(first.getByTestId('waits')).toHaveText('HT-1 has shipped (halftime, 2026-11-18): this can be unblocked');
    await expect(first.getByTestId('waits')).toHaveCSS('color', 'rgb(76, 195, 138)'); // green, not the stuck red
    await expect(first).toHaveCSS('background-color', 'rgb(20, 41, 31)');
    await expect(stuck.getByTestId('stuck-card').nth(1)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(stuck.getByTestId('stuck-card').nth(1).getByTestId('waits')).toHaveCount(0);
    await expect(stuck.getByTestId('stuck-card').nth(2).locator('.waits-line')).toHaveText(['Still waiting for HT-2 (planned in halftime)', 'HT-9 was not found in any project']);
    await expect(page.getByTestId('strip-unblock')).toHaveText('1 can be unblocked');
    await expect(stuck.locator('h2')).toHaveText('Stuck – needs you 3 · 1 can be unblocked');
    await page.goto('/#/projects');
    await expect(page.getByTestId('card-footy').getByTestId('counts')).toContainText('Stuck 1 (1 can be unblocked)');
    await expect(page.getByTestId('card-alpha').getByTestId('card-unblock')).toHaveCount(0);
  });

  test('stuck items: the question shows in red; Answer, empty Save refused, Save sends it and Stuck drops (BL-16)', async ({ page }) => {
    const data = { ...(await fixtureData()), canMove: true };
    let backlog = BACKLOG;
    const sent: unknown[] = [];
    const demoWith = (b: string) => {
      const planned = parseBacklog(b);
      const list = parseIdeas(IDEAS);
      return { repo: 'demo', planned, ideas: list, counts: counts(planned, list) };
    };
    await page.route('**/api/projects', (r) => r.fulfill({ json: { ...data, projects: data.projects.map((p) => (p.repo === 'demo' ? { ...p, ...demoWith(backlog) } : p)) } }));
    await page.route('**/api/move', async (r) => {
      const body = r.request().postDataJSON();
      if (body.action === 'check') return r.fulfill({ json: { ok: true } });
      sent.push(body);
      backlog = answerBlocked({ backlog, id: body.id, answer: body.answer, date: '2026-11-19' }).backlog;
      return r.fulfill({ json: { ok: true, message: 'ok', updates: [demoWith(backlog)] } });
    });
    await page.goto('/');
    const stuck = page.getByTestId('lane-stuck');
    await expect(stuck.getByTestId('blocked-note')).toHaveText("waiting for the owner's colour choice.");
    await expect(stuck.getByTestId('blocked-note')).toHaveCSS('color', 'rgb(239, 107, 107)'); // the danger colour
    await expect(stuck.getByTestId('answer-locked')).toHaveText('Unlock as owner to answer');
    await expect(stuck.getByTestId('answer')).toHaveCount(0);

    await page.getByTestId('owner').click();
    await page.getByLabel('Owner password').fill('pw-e2e');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await stuck.getByTestId('answer').click();
    await stuck.getByRole('button', { name: 'Save' }).click();
    await expect(stuck.getByTestId('answer-error')).toHaveText('Type an answer first.');
    expect(sent).toEqual([]);
    await stuck.getByLabel('Answer for DM-2').fill('Blue, please.');
    await stuck.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('strip-stuck').locator('b')).toHaveText('0');
    await expect(stuck).toContainText('Nothing stuck.');
    expect(sent).toEqual([{ action: 'answer', repo: 'demo', id: 'DM-2', answer: 'Blue, please.' }]);
    await expect.poll(() => lines(page, 'next')).toContain('demo | Stuck thing* | DM-2'); // back in its normal lane
    await page.reload(); // the data from "GitHub" says the same
    await expect(page.getByTestId('strip-stuck').locator('b')).toHaveText('0');
  });

  test('marquee: drag selects the items it touches, Shift adds, Copy and Ctrl+C copy, Esc and empty clicks clear (BL-13)', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const clipboard = async () => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
    await page.goto('/');
    const next = page.getByTestId('lane-next');
    const rows = next.getByTestId('board-item');
    await expect(rows).toHaveCount(4);
    const lane = (await next.boundingBox())!;
    const third = (await rows.nth(2).boundingBox())!;
    const drag = async (from: { x: number; y: number }, to: { x: number; y: number }, mod?: 'Shift' | 'Control') => {
      if (mod) await page.keyboard.down(mod);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
      await page.mouse.move(to.x, to.y, { steps: 4 });
      await page.mouse.up();
      if (mod) await page.keyboard.up(mod);
    };
    const selected = () => page.locator('[data-select-key]').evaluateAll((els) => els.filter((e) => getComputedStyle(e).outlineStyle === 'solid').map((e) => e.closest('[data-repo]')?.getAttribute('data-repo') + ':' + (e.querySelector('.id')?.textContent ?? '')));

    // From the lane's empty top-left corner down to the third row: AL-1, AL-2, DM-1.
    await drag({ x: lane.x + 4, y: lane.y + 4 }, { x: lane.x + 300, y: third.y + third.height / 2 });
    await expect(page.getByTestId('selection-count')).toHaveText('3 selected');
    expect(await selected()).toEqual(['alpha:AL-1', 'alpha:AL-2', 'demo:DM-1']);
    await expect(rows.nth(0)).not.toHaveAttribute('open'); // selecting opens nothing
    const want =
      '## alpha\n\n### AL-1 — Alpha item\n**In short:** Alpha gets a plain sentence.\nText.\n**Estimate:** build ~5 min · suite ~1 min\n\n### AL-2 — Odd estimate\n**Estimate:** soon-ish\n\n' +
      '## demo\n\n### DM-1 — First thing\nLine one of the spec.\n- a bullet\n  continued\n';
    await page.getByTestId('copy-selection').click();
    await expect(page.getByTestId('copy-selection')).toHaveText('Copied');
    expect(await clipboard()).toBe(want);
    await page.evaluate(() => navigator.clipboard.writeText(''));
    await page.keyboard.press('Control+c');
    await expect.poll(clipboard).toBe(want);

    // Shift + drag over the Waiting lane adds DM-3; the copy keeps page order, grouped by project.
    const waiting = (await page.getByTestId('lane-waiting').boundingBox())!;
    await drag({ x: waiting.x + 4, y: waiting.y + 4 }, { x: waiting.x + 300, y: waiting.y + waiting.height - 4 }, 'Shift');
    await expect(page.getByTestId('selection-count')).toHaveText('4 selected');
    await page.getByTestId('copy-selection').click();
    await expect.poll(clipboard).toBe(want.replace('continued\n', 'continued\n\n### DM-3 — Later thing\nHeld text.\n'));

    // Esc clears.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('selection-bar')).toHaveCount(0);

    // A plain click on an item still opens it and selects nothing.
    await rows.nth(2).locator('summary').click();
    await expect(rows.nth(2)).toHaveAttribute('open', '');
    await expect(page.getByTestId('selection-bar')).toHaveCount(0);
    await rows.nth(2).locator('summary').click();

    // A drag that starts on an item selects without opening it; a click on empty space clears.
    const first = (await rows.nth(0).boundingBox())!;
    await drag({ x: first.x + 200, y: first.y + first.height / 2 }, { x: first.x + 220, y: third.y + 4 });
    await expect(page.getByTestId('selection-count')).toHaveText('3 selected');
    await expect(rows.nth(0)).not.toHaveAttribute('open');
    await page.mouse.click(lane.x + 4, lane.y + 4);
    await expect(page.getByTestId('selection-bar')).toHaveCount(0);

    // Chips and the number strip never start a marquee.
    await page.evaluate(() => {
      const w = window as unknown as { downs: string[] };
      w.downs = [];
      addEventListener('pointerdown', (e) => w.downs.push(`${(e.target as Element).outerHTML.slice(0, 90)} @${e.clientX},${e.clientY} scrollY=${scrollY}`), true);
    });
    const chip = (await page.getByRole('button', { name: 'All projects' }).boundingBox())!;
    await drag({ x: chip.x + chip.width / 2, y: chip.y + chip.height / 2 }, { x: lane.x + 300, y: third.y + 4 });
    const why = async () => JSON.stringify({ chip, downs: await page.evaluate(() => (window as unknown as { downs: string[] }).downs), selected: await selected() });
    await expect(page.getByTestId('selection-bar'), await why()).toHaveCount(0);
    await expect(page.getByTestId('marquee')).toBeHidden();
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
