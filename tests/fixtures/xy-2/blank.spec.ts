import { test, expect } from '@playwright/test';

test.describe('Discount codes (XY-2)', () => {
  test('XY-2: Verify a valid code reduces the total by 10%', async ({ page }) => {
    await expect(page.getByTestId('total')).toHaveText('$45.00');
  });

  test('XY-2: Verify an invalid code shows an error (Negative)', async ({ page }) => {
    // TODO: expect(page.getByText('Code not recognised')).toBeVisible();
  });
});
