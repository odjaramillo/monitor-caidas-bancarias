import { expect, test, type APIRequestContext } from '@playwright/test';
import { API_URL } from './env.js';

// The reports of a pair in the current window, as GET /status counts them.
async function reportsOf(request: APIRequestContext, origin: string, destination: string) {
  const response = await request.get(`${API_URL}/status`);
  expect(response.status()).toBe(200);
  const { pairs } = (await response.json()) as {
    pairs: { origin: string; destination: string; reports: number }[];
  };
  const pair = pairs.find((p) => p.origin === origin && p.destination === destination);
  if (!pair) throw new Error(`GET /status has no pair ${origin} -> ${destination}.`);
  return pair.reports;
}

test('a report sent from /reportar appears on the status screen', async ({ page, request }) => {
  // The database can hold reports from earlier runs, so the test counts from the current value.
  const after = (await reportsOf(request, 'bancamiga', 'plaza')) + 1;
  const who = after === 1 ? '1 persona reporta' : `${after} personas reportan`;

  await page.goto('/reportar');
  await page.getByLabel('¿De qué banco sale el pago?').selectOption('Bancamiga');
  await page.getByLabel('¿A qué banco llega el pago?').selectOption('Banco Plaza');
  await page.getByLabel('El pago no sale').check();
  await page.getByRole('button', { name: 'Enviar reporte' }).click();
  await expect(page.getByRole('status')).toHaveText('Gracias, recibimos tu reporte.');

  // The worker counts again every second. Each attempt reloads the screen to ask for the status.
  await expect(async () => {
    await page.goto('/');
    await page.getByText('Ver todos los pares').click();
    const pair = page.getByRole('listitem').filter({ hasText: 'Bancamiga → Banco Plaza' });
    await expect(pair).toContainText(`${who} problemas con pagos de Bancamiga a Banco Plaza`, {
      timeout: 1000
    });
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
