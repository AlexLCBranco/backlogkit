// BL-19: the shared layout's checks (NAV_PATTERN.md §6), against the built site with GitHub mocked.
import { expect, test, type Page } from '@playwright/test';
import { fixtureData } from './fixture-data';

const live = !!process.env.LIVE_URL;
const PAGES = ['#/', '#/projects', '#/ideas', '#/built', '#/order'];
const TODAY = new Date('2026-11-19T12:00:00');
const heads = (page: Page) => page.locator('[data-testid^="lane-"] > h2').allTextContents();
const header = (page: Page) => page.getByTestId('top-bar');
/** Waits until the page's data is on screen. */
const ready = (page: Page) => expect(page.getByTestId('page-rows')).toBeVisible();

test.describe('shared layout (BL-19)', () => {
  test.skip(live, 'local only');

  test.beforeEach(async ({ page }) => {
    const data = await fixtureData();
    await page.route('**/api/projects', (r) => r.fulfill({ json: data }));
    await page.clock.setFixedTime(TODAY);
  });

  test('the header is on every page, the same height, and stays at the top after scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 400 });
    const heights: number[] = [];
    for (const hash of PAGES) {
      await page.goto('/' + hash);
      const before = (await header(page).boundingBox())!.height; // while GitHub is still being read
      await ready(page);
      const h = (await header(page).boundingBox())!.height;
      expect(h, hash).toBe(before);
      heights.push(h);
      await expect(header(page).getByTestId('where-tabs').getByRole('link')).toHaveText(['Home', 'Projects', 'Ideas', 'Built', 'Build order']);
      await expect(header(page).getByTestId('go-anywhere')).toBeVisible();
      await page.mouse.wheel(0, 2000);
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
      const box = (await header(page).boundingBox())!;
      expect(box.y, hash).toBe(0);
      await expect(header(page).getByTestId('where-board')).toBeInViewport();
    }
    expect(new Set(heights).size).toBe(1);
  });

  test('every Where tab, What chip, How option and breadcrumb part navigates; the address round-trips', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    const tabs: [string, string, RegExp][] = [
      ['projects', 'backlogkit · Projects', /#\/projects\?sort=backlog-desc$/],
      ['ideas', 'backlogkit · Ideas', /#\/ideas$/],
      ['built', 'backlogkit · Built', /#\/built$/],
      ['board', 'backlogkit · Home', /#\/$/],
    ];
    for (const [w, title, url] of tabs) {
      await page.getByTestId(`where-${w}`).click();
      await expect(page).toHaveTitle(title);
      await expect(page).toHaveURL(url);
      await expect(page.getByTestId(`where-${w}`)).toHaveAttribute('aria-current', 'page');
      await expect(page.getByTestId('breadcrumb').getByTestId('crumb-btn').first()).toHaveText(title.replace('backlogkit · ', ''));
    }

    // What chips: each one navigates and the reload shows the same screen.
    const chips = page.getByRole('group', { name: 'Filter by project' }).getByRole('button');
    for (const name of ['alpha', 'demo', 'zulu', 'broken']) {
      await chips.filter({ hasText: new RegExp(`^${name}$`) }).click();
      await expect(page).toHaveURL(new RegExp(`#/\\?p=${name}$`));
      const before = await heads(page);
      await page.reload();
      await expect(chips.filter({ hasText: new RegExp(`^${name}$`) })).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => heads(page)).toEqual(before);
      await expect(page.getByTestId('crumb-btn')).toHaveText(['Home', name]);
      await chips.filter({ hasText: new RegExp(`^${name}$`) }).click(); // off again
      await expect(page).toHaveURL(/#\/$/);
    }

    // Breadcrumb: the place opens its siblings; the project part jumps sideways and keeps the place.
    await page.goto('/#/ideas/later?p=demo');
    await ready(page);
    await expect(page.getByTestId('crumb-btn')).toHaveText(['Ideas', 'demo', 'Not important yet']);
    await page.getByTestId('crumb-btn').nth(1).click();
    await expect(page.getByTestId('crumb-menu').getByRole('menuitem')).toHaveText(['All projects', 'alpha', 'demo', 'zulu', 'broken']);
    await page.getByTestId('crumb-menu').getByRole('menuitem', { name: 'alpha' }).click();
    await expect(page).toHaveURL(/#\/ideas\/later\?p=alpha$/);
    await page.getByTestId('crumb-btn').nth(2).click();
    await page.getByTestId('crumb-menu').getByRole('menuitem', { name: 'Needs your decision' }).click();
    await expect(page).toHaveURL(/#\/ideas\/decision\?p=alpha$/);
    await page.getByTestId('crumb-btn').first().click();
    await expect(page.getByTestId('crumb-menu').getByRole('menuitem')).toHaveText(['Home', 'Projects', 'Ideas', 'Built', 'Build order']);
    await page.getByTestId('crumb-menu').getByRole('menuitem', { name: 'Built' }).click();
    await expect(page).toHaveURL(/#\/built\?p=alpha$/);
    await page.keyboard.press('Escape');

    // How: every option navigates and is in the address.
    await page.getByTestId('where-projects').click();
    for (const [field, dirs] of [['Backlog changed', ['Newest first', 'Oldest first']], ['Last change', ['Newest first', 'Oldest first']], ['Created', ['Newest first', 'Oldest first']], ['Name', ['A–Z', 'Z–A']]] as const) {
      await page.getByRole('radiogroup', { name: 'Sort projects by' }).getByRole('radio', { name: field }).click();
      for (const d of dirs) {
        await page.getByRole('radiogroup', { name: 'Sort direction' }).getByRole('radio', { name: d }).click();
        const url = page.url();
        await page.reload();
        await expect(page.getByRole('radiogroup', { name: 'Sort projects by' }).getByRole('radio', { name: field })).toHaveAttribute('aria-checked', 'true');
        await expect(page.getByRole('radiogroup', { name: 'Sort direction' }).getByRole('radio', { name: d })).toHaveAttribute('aria-checked', 'true');
        expect(page.url()).toBe(url);
      }
    }
  });

  test('back / forward: the header buttons and the browser walk the same trail', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await expect(page.getByTestId('back')).toBeDisabled();
    await page.getByTestId('where-ideas').click();
    await page.getByRole('group', { name: 'Filter by project' }).getByRole('button', { name: 'demo', exact: true }).click();
    await expect(page).toHaveURL(/#\/ideas\?p=demo$/);
    await expect(page.getByTestId('back')).toHaveAttribute('title', 'Back to Ideas');
    await page.getByTestId('back').click();
    await expect(page).toHaveURL(/#\/ideas$/);
    await expect(page.getByTestId('forward')).toHaveAttribute('title', 'Forward to Ideas › demo');
    await page.getByTestId('back').click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByTestId('back')).toBeDisabled();
    await page.getByTestId('forward').click();
    await expect(page).toHaveURL(/#\/ideas$/);
    await page.goForward(); // the browser's own button
    await expect(page).toHaveURL(/#\/ideas\?p=demo$/);
    await expect(page.getByRole('group', { name: 'Filter by project' }).getByRole('button', { name: 'demo', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.goBack();
    await expect(page).toHaveTitle('backlogkit · Ideas');
    await page.reload(); // the trail survives a reload
    await expect(page.getByTestId('back')).toHaveAttribute('title', 'Back to Home');
    await expect(page.getByTestId('forward')).toHaveAttribute('title', 'Forward to Ideas › demo');
  });

  test('Go anywhere: Ctrl+K, a project, an ID, a page; Esc closes', async ({ page }) => {
    await page.goto('/#/built');
    await ready(page);
    await page.keyboard.press('Control+k');
    const input = page.getByTestId('go-input');
    await expect(input).toBeFocused();
    await input.fill('zulu');
    await expect(page.getByTestId('go-item').first()).toContainText('zulu');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/\?p=zulu$/);
    await page.getByTestId('go-anywhere').click();
    await input.fill('dm-1');
    await expect(page.getByTestId('go-item').first()).toContainText('DM-1 — First thing');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('board-item')).toHaveCount(1);
    await page.keyboard.press('Control+k');
    await input.fill('ideas');
    await page.getByTestId('go-item').filter({ hasText: /^Ideas\s*Page$/ }).click();
    await expect(page).toHaveTitle('backlogkit · Ideas');
    await page.keyboard.press('Control+k');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('go-dialog')).toBeHidden();
  });

  test('a click updates the heaviest page (Home) in under 100 ms', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    const times = await page.evaluate(async () => {
      const out: number[] = [];
      const chips = [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Filter by project"] button')];
      for (const c of [...chips.slice(1), chips[0]!, ...document.querySelectorAll<HTMLAnchorElement>('[data-testid^="where-"]')]) {
        const t = performance.now();
        c.click();
        await new Promise((ok) => requestAnimationFrame(() => setTimeout(ok)));
        out.push(performance.now() - t);
      }
      return out;
    });
    for (const t of times) expect(t).toBeLessThan(100);
  });

  test('no layout shift on load or after navigating', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { cls: number }).cls = 0;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) (window as unknown as { cls: number }).cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    const cls = () => page.evaluate(() => (window as unknown as { cls: number }).cls);
    for (const hash of PAGES) {
      await page.goto('/' + hash);
      await ready(page);
      await page.waitForTimeout(300);
      expect(await cls(), hash).toBeLessThan(0.01);
    }
    for (const w of ['projects', 'ideas', 'built', 'board']) {
      await page.getByTestId(`where-${w}`).click();
      await page.waitForTimeout(200);
      // layout-shift entries right after a click count as "recent input" and are left out by the browser; anything
      // that moves later (a late image, a font) is not
      expect(await cls(), w).toBeLessThan(0.01);
    }
  });

  test('no dropdown picks what is shown; every icon-only control has a name', async ({ page }) => {
    await page.route('**/api/projects', async (r) => r.fulfill({ json: { ...(await fixtureData()), canMove: true } }));
    for (const hash of PAGES) {
      await page.goto('/' + hash);
      await ready(page);
      await expect(page.locator('header select, [data-testid="page-rows"] select, .board-page select, .home select')).toHaveCount(0);
      const unnamed = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('button, a[href], [role="radio"], [role="option"], [role="menuitem"]')]
          .filter((e) => e.offsetParent !== null && !(e.innerText || '').trim().match(/[A-Za-z0-9]/) && !e.getAttribute('aria-label') && !e.getAttribute('title'))
          .map((e) => e.outerHTML.slice(0, 120)),
      );
      expect(unnamed, hash).toEqual([]);
    }
  });

  test('390 px wide: the header fits, every place visible, no hamburger, no sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    for (const hash of [...PAGES, '#/ideas/later?p=demo']) {
      await page.goto('/' + hash);
      await ready(page);
      for (const w of ['board', 'projects', 'ideas', 'built']) await expect(page.getByTestId(`where-${w}`)).toBeInViewport({ ratio: 1 });
      await expect(page.getByTestId('go-anywhere')).toBeInViewport({ ratio: 1 });
      await expect(page.getByTestId('back')).toBeInViewport({ ratio: 1 });
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(wide, hash).toBeLessThanOrEqual(0);
      const box = (await header(page).boundingBox())!;
      expect(box.width).toBeLessThanOrEqual(390);
      await expect(page.getByRole('button', { name: /menu/i })).toHaveCount(0);
    }
    // the breadcrumb shows its last two parts
    await expect(page.locator('[data-testid="crumb"]:visible')).toHaveCount(2);
  });

  test('screenshots of each main page for the build report', async ({ page }) => {
    for (const [hash, name] of [['#/', 'home'], ['#/projects', 'projects'], ['#/ideas', 'ideas'], ['#/built', 'built']]) {
      await page.goto('/' + hash);
      await ready(page);
      await page.screenshot({ path: `test-results/screens/${name}-desktop.png` });
      await page.setViewportSize({ width: 390, height: 800 });
      await page.screenshot({ path: `test-results/screens/${name}-390.png` });
      await page.setViewportSize({ width: 1440, height: 900 });
    }
  });
});
