import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { unzipSync, strFromU8 } from 'fflate';

const FIXTURE = 'apps/server/test/fixtures/week40-sample.xlsx';

async function login(page: import('@playwright/test').Page, week: string) {
  const user = `e2e${Date.now()}${Math.floor(Math.random() * 1000)}`;
  await page.goto(`/auth/login?user=${user}&returnTo=${encodeURIComponent(`/?uke=${week}`)}`);
  await expect(page.getByRole('heading', { name: /^Uke / })).toBeVisible();
}

test('shows the login screen when not signed in', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Logg inn med Microsoft' })).toBeVisible();
});

test('add a line, register hours with the keyboard and add a comment', async ({ page }) => {
  await login(page, '2026-40');
  await page.getByRole('button', { name: 'Legg til linje' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Prosjektnummer').fill('266411');
  await dialog.getByLabel('Prosjektnavn').fill('Internt');
  await dialog.getByLabel('Oppgavenummer').fill('4');
  await dialog.getByLabel('Oppgavenavn').fill('Lunch');
  await dialog.getByRole('button', { name: 'Legg til' }).click();

  const monday = page.locator('[data-cell="0:0"]');
  await monday.click();
  await monday.fill('7,5');
  await monday.press('ArrowRight');
  await expect(page.locator('[data-cell="0:1"]')).toBeFocused();
  await page.keyboard.type('8');
  await page.keyboard.press('Enter');

  await expect(page.getByRole('row', { name: /Sum per dag/ })).toContainText('15,5');
  await expect(page.getByText('Lagret')).toBeVisible();

  await page.locator('[data-cell="0:0"]').focus();
  await page.keyboard.press('Shift+Enter');
  const popover = page.getByRole('dialog', { name: /Detaljer/ });
  await popover.getByLabel('Kommentar').fill('Planlegging\nMøte');
  await popover.getByRole('button', { name: 'Lagre' }).click();
  await expect(page.getByText('Lagret')).toBeVisible();

  await page.reload();
  await expect(page.locator('[data-cell="0:0"]')).toHaveValue('7,5');
  await expect(page.locator('[data-cell="0:0"]')).toHaveAttribute('title', 'Planlegging\nMøte');
});

test('import, export, copy to next week and flag edits after export', async ({ page }) => {
  await login(page, '2026-40');
  await page.getByRole('button', { name: 'Importer' }).first().click();
  await page.setInputFiles('input[type=file]', FIXTURE);
  await expect(page.getByRole('dialog').getByText('Ny uke')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: /^Importer/ }).click();

  const totals = page.getByRole('row', { name: /Sum per dag/ });
  await expect(totals).toContainText('32');
  await expect(page.getByRole('row', { name: /Fleks/ })).toContainText('+2,5');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Eksporter uke 40' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^week40_\d{14}\.xlsx$/);
  const exported = unzipSync(new Uint8Array(readFileSync(await download.path())));
  const original = unzipSync(new Uint8Array(readFileSync(FIXTURE)));
  const sheetData = (files: Record<string, Uint8Array>) => {
    const xml = strFromU8(files['xl/worksheets/sheet1.xml']!);
    return xml.slice(xml.indexOf('<sheetData>'), xml.indexOf('</sheetData>'));
  };
  expect(sheetData(exported)).toBe(sheetData(original));

  await expect(page.getByText(/Lastet ned week40_\d{14}\.xlsx/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Eksporter på nytt' })).toBeVisible();

  await page.getByRole('button', { name: 'Neste uke', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Uke 41', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Kopier fra forrige uke' }).first().click();
  await expect(page.getByText('Kopierte 21 linjer fra forrige uke')).toBeVisible();
  await expect(page.getByRole('row', { name: /Sum per dag/ })).toContainText('0');

  await page.getByRole('button', { name: 'Forrige uke', exact: true }).click();
  await page.locator('[data-cell="0:0"]').fill('1');
  await page.locator('[data-cell="0:0"]').press('Enter');
  await expect(page.getByText('Endret etter eksport').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Eksporter uke 40 på nytt' })).toBeVisible();
});
