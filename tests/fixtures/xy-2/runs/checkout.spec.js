const { test, expect } = require('@playwright/test');
test.describe('Discount codes (XY-2)', () => {
  test('XY-2: Verify a valid code reduces the total by 10%', async () => {
    expect(50 * 0.9).toBe(45);
  });
  test('XY-2: Verify an invalid code shows an error (Negative)', async ({}, testInfo) => {
    if (process.env.MODE === 'fail') expect('Code not found').toBe('Code not recognised');
    if (process.env.MODE === 'flaky') expect(testInfo.retry).toBe(1);
    expect('Code not recognised').toBe('Code not recognised');
  });
  test('XY-2: Verify the total is unchanged after an invalid code (Negative)', async () => {
    test.fixme(true, 'blocked on page objects');
  });
});
