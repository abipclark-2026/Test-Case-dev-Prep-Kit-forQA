import { test, expect } from '@playwright/test';

test.describe('Discount codes (XY-2)', () => {
  // A line comment with a URL in a string must not confuse the checker.
  const url = 'https://example.test/cart';

  test('XY-2: Verify a valid code reduces the total by 10%', async ({ page }) => {
    await page.goto(url);
    await expect(page.getByTestId('total')).toHaveText('$45.00');
  });

  test('XY-2: Verify an invalid code shows an error (Negative)', async ({ page }) => {
    await test.step('Enter an invalid code', async () => {});
    test.fixme(true, 'blocked on selectors');
  });
});
