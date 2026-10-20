// Modos de juego en el navegador: cola de Normal con bots, cancelar una cola, clasificatoria en posicionamiento e historial vacío
const { test, expect, register } = require('./helpers');

test('Normal: buscar partida, entrar con bots y la partida la lleva el servidor @rapido', async ({ page }) => {
  await register(page);
  // la ficha muestra el posicionamiento y 0 caramelos (datos del servidor)
  await expect(page.locator('#rkMini')).toContainText('Posicionamiento 0/3');
  await expect(page.locator('.candyRow b')).toHaveText('0');
  await page.locator('#playBtn').click();
  await expect(page.locator('#qNormal')).toBeVisible();
  await page.locator('#qNormal').click();
  await expect(page.locator('#queueBar')).toBeVisible();
  await expect(page.locator('#queueBar')).toContainText('Buscando partida normal');
  // la cola se completa con bots (en las pruebas, a los 2 s) y empieza la partida en modo cliente
  await expect.poll(() => page.evaluate(() => NET.mode), { timeout: 20_000 }).toBe('client');
  await expect(page.locator('#menu')).toBeHidden();
  await expect(page.locator('#queueBar')).toBeHidden();
  const players = await page.evaluate(() => G.players.map(p => p.name));
  expect(players.filter(n => / \(bot\)$/.test(n))).toHaveLength(7);
});

test('cancelar la cola, ver la clasificatoria y el historial vacío', async ({ page }) => {
  await register(page);
  await page.locator('#rankedBtn').click();
  await expect(page.locator('.rkBig')).toContainText('Posicionamiento 0/3');
  await expect(page.locator('.lgItem')).toHaveCount(10);
  await page.locator('#qRanked').click();
  await expect(page.locator('#queueBar')).toContainText('Buscando clasificatoria');
  await page.locator('#qCancel').click();
  await expect(page.locator('#queueBar')).toBeHidden();
  await expect.poll(() => page.evaluate(() => NET.mode)).toBe('sp');
  await page.locator('#histBtn').click();
  await expect(page.locator('.hEmpty')).toBeVisible();
});
