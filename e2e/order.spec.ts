// BL-23: the Build order page, against the built site with GitHub mocked.
import { expect, test } from '@playwright/test';
import { orderData } from '../tests/order-fixtures';

const live = !!process.env.LIVE_URL;

test.describe('Build order (BL-23)', () => {
  test.skip(live, 'local only');

  test('opens from the header, shows "Build these now", and Copy order copies the order on screen', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const data = await orderData();
    await page.route('**/api/projects', (r) => r.fulfill({ json: data }));
    await page.goto('/');
    await page.getByTestId('where-order').click();
    await expect(page).toHaveURL(/#\/order$/);
    await expect(page).toHaveTitle('backlogkit · Build order');
    await expect(page.getByTestId('where-order')).toHaveAttribute('aria-current', 'page');

    const rounds = page.getByTestId('order-round');
    await expect(rounds).toHaveCount(3);
    await expect(rounds.first().locator('h3')).toContainText('Build these now');
    await expect(rounds.nth(1).locator('h3')).toContainText('Build these after round 1');

    // What is on screen, row by row, as the copied text would say it.
    const onScreen = await rounds.evaluateAll((els) =>
      els.flatMap((el, n) =>
        [...el.querySelectorAll<HTMLElement>('[data-testid="order-row"]')].map((r) => `Round ${n + 1} · ${r.dataset.id} · ${r.dataset.repo} · ${r.querySelector('.order-title')!.textContent}`),
      ),
    );
    expect(onScreen).toHaveLength(12);
    expect(onScreen[0]).toBe('Round 1 · AL-1 · alpha · Base');
    await page.getByTestId('copy-order').click();
    await expect(page.getByTestId('copy-order')).toHaveText('Copied');
    const copied = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
    expect(copied.split('\n')).toEqual(onScreen);

    // The piles; an indented row really sits to the right of the one it waits for.
    await expect(page.getByTestId('order-needs-you').locator('h2')).toContainText('Needs you');
    await expect(page.getByTestId('order-held').locator('h2')).toContainText('Waiting for your go');
    const x = async (id: string) => (await page.locator(`[data-testid="order-row"][data-id="${id}"]`).boundingBox())!.x;
    expect(await x('AL-5')).toBeGreaterThan(await x('AL-4'));
    expect(await x('BE-7')).toBeGreaterThan(await x('AL-20'));

    await page.screenshot({ path: 'test-results/screens/order-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 800 });
    await page.screenshot({ path: 'test-results/screens/order-390.png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll at 390 px').toBe(true);
    await page.setViewportSize({ width: 1440, height: 900 });

    // The chips keep the round numbers; a reload shows the same; the ID opens the item as elsewhere.
    await page.getByRole('group', { name: 'Filter by project' }).getByRole('button', { name: 'alpha', exact: true }).click();
    await expect(page).toHaveURL(/#\/order\?p=alpha$/);
    await expect(rounds).toHaveCount(3);
    await page.reload();
    await expect(rounds.nth(2).getByTestId('order-row')).toHaveAttribute('data-id', 'AL-3');
    await rounds.first().getByTestId('order-id').click();
    await expect(page).toHaveURL(/#\/\?q=AL-1$/);
  });
});

test('live: the Build order page opens with real data', async ({ page }) => {
  test.skip(!live, 'live only');
  await page.goto('/#/order');
  await expect(page.getByTestId('order-page')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('where-order')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('order-held').locator('h2')).toContainText('Waiting for your go');
});
