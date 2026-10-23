import { expect, test, type Page } from '@playwright/test';
import { API_URL } from './env.js';

interface StatusAnswer {
  updatedAt: string;
  pairs: { origin: string; destination: string; reports: number }[];
}

// Opens the status screen and returns the GET /status answer that the screen shows.
// The screen asks for the status once per load, so the answer and the screen agree.
async function openStatusScreen(page: Page): Promise<StatusAnswer> {
  const answer = page.waitForResponse(
    (response) => response.url() === `${API_URL}/status` && response.request().method() === 'GET'
  );
  await page.goto('/');
  const response = await answer;
  expect(response.status()).toBe(200);
  return (await response.json()) as StatusAnswer;
}

test('a report sent from /reportar appears on the status screen', async ({ page }) => {
  await page.goto('/reportar');
  await page.getByLabel('¿De qué banco sale el pago?').selectOption('Bancamiga');
  await page.getByLabel('¿A qué banco llega el pago?').selectOption('Banco Plaza');
  await page.getByLabel('El pago no sale').check();
  const saved = page.waitForResponse(
    (response) => response.url() === `${API_URL}/reports` && response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Enviar reporte' }).click();
  expect((await saved).status()).toBe(201);
  // The API answers after the report is in the database. A count that starts later reads it.
  const savedAt = Date.now();
  await expect(page.getByRole('status')).toHaveText('Gracias, recibimos tu reporte.');

  // The window of 15 minutes can drop older reports at any moment, so the total is not fixed.
  // So the test waits for a count that started after the report was saved: it holds the report.
  // The worker counts again every second. Each attempt reloads the screen to ask for the status.
  await expect(async () => {
    const status = await openStatusScreen(page);
    expect(Date.parse(status.updatedAt)).toBeGreaterThanOrEqual(savedAt);
    const pair = status.pairs.find((p) => p.origin === 'bancamiga' && p.destination === 'plaza');
    expect(pair?.reports).toBeGreaterThanOrEqual(1);
    const reports = pair?.reports ?? 0;
    const who = reports === 1 ? '1 persona reporta' : `${reports} personas reportan`;

    await page.getByText('Ver todos los pares').click();
    const item = page.getByRole('listitem').filter({ hasText: 'Bancamiga → Banco Plaza' });
    // An exact match, so "2 personas reportan" never matches "12 personas reportan".
    await expect(
      item.getByText(
        `${who} problemas con pagos de Bancamiga a Banco Plaza en los últimos 15 minutos`,
        { exact: true }
      )
    ).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
});

test('answers chosen before the JavaScript arrives are kept', async ({ page }) => {
  // Hold every script of the app. The page shows only its prerendered HTML until release().
  let release = () => {};
  const scriptsArrive = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/_app/**/*.js', async (route) => {
    await scriptsArrive;
    await route.continue();
  });

  await page.goto('/reportar', { waitUntil: 'domcontentloaded' });
  const origin = page.getByLabel('¿De qué banco sale el pago?');
  const destination = page.getByLabel('¿A qué banco llega el pago?');
  const type = page.getByLabel('La app da error');
  const send = page.getByRole('button', { name: 'Enviar reporte' });
  await origin.selectOption('Banesco');
  await destination.selectOption('Mercantil');
  await type.check();
  // The three answers are chosen, but the button is still off: the JavaScript has not run.
  await expect(send).toBeDisabled();

  release();

  // The button turns on only after hydration, and only when the three answers survive it.
  await expect(send).toBeEnabled();
  await expect(origin).toHaveValue('banesco');
  await expect(destination).toHaveValue('mercantil');
  await expect(type).toBeChecked();
});
