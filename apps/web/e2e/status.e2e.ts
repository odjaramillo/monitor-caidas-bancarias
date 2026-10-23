import { expect, test } from '@playwright/test';

test('the status screen shows the bank pairs', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Ver todos los pares').click();

  // The migration seeds 10 banks, and every bank pairs with every bank: 10 × 10.
  const pairs = page.getByRole('listitem');
  await expect(pairs).toHaveCount(100);
  await expect(pairs.filter({ hasText: 'Banco de Venezuela → Banesco' })).toHaveCount(1);
  await expect(pairs.filter({ hasText: 'Banco Plaza → Bancamiga' })).toHaveCount(1);
});
