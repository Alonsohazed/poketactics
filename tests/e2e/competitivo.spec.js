// Modos de juego en el navegador: cola de Normal con bots, cancelar una cola, clasificatoria en posicionamiento e historial vacío
const { test, expect, register, startSolo } = require('./helpers');

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
  expect(players).toHaveLength(8); // 1 persona y 7 bots (el navegador no los distingue: lo sabe el servidor)
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

test('perfil propio desde el menú: estandarte, vitrinas, pestañas por modo e historial vacío', async ({ page }) => {
  const user = await register(page, undefined, 'squirtle');
  await page.locator('#pfBtn').click();
  await expect(page.locator('.pfHero')).toBeVisible();
  await expect(page.locator('.pfName')).toHaveText(user);
  await expect(page.locator('.pfLvlChip')).toHaveText('1');
  await expect(page.locator('.pfCase')).toHaveCount(5);
  await expect(page.locator('.pfCase').first()).toContainText('Sin clasificar');
  await expect(page.locator('.pfTabs .pxb.on')).toHaveText('Normal');
  await page.locator('.pfTabs .pxb[data-m="ranked"]').click();
  await expect(page.locator('.pfTabs .pxb.on')).toHaveText('Clasificatoria');
  await expect(page.locator('#pfStats .stats div')).toHaveCount(5);
  await expect(page.locator('.pfWrap .hEmpty')).toBeVisible();
  await page.locator('#mClose').click();
  await expect(page.locator('.pfHero')).toHaveCount(0);
});

test('pantalla de resultados: sale una vez al quedar eliminado, con los 8 y «Continuar» al menú', async ({ page }) => {
  await register(page);
  await startSolo(page);
  // equipos para todos; luego me eliminan (4 vivos)
  await page.evaluate(() => { G.timer = Infinity; const keys = UNIT_LIST.map(u => u.key);
    G.players.forEach((p, i) => { p.board = {}; for (let j = 0; j < 3; j++) p.board[j + ',0'] = makeInst(keys[(i * 5 + j) % keys.length]); });
    [G.players[7], G.players[6], G.players[5], G.players[0]].forEach((p, k) => { p.finalComp = compSnap(p); p.place = 8 - k; p.alive = false; p.hp = 0; });
    endGame(); });
  await expect(page.locator('.rsHead')).toContainText('Has quedado eliminado');
  await expect(page.locator('.rsBig b')).toHaveText('5.º');
  await expect(page.locator('.rsRow')).toHaveCount(8);
  await expect(page.locator('.rsRow.pl0')).toHaveCount(4); // los vivos, arriba y «En juego»
  await expect(page.locator('.rsRow').first()).toContainText('En juego');
  await expect(page.locator('.rsRow.me')).toHaveCount(1);
  await expect(page.locator('.rsRow.me .rsAdd')).toHaveCount(0); // a uno mismo no se le pide amistad
  await expect(page.locator('.rsRow .rsWho a, .rsRow [data-pick]')).toHaveCount(0); // desde aquí no se abre ningún perfil
  // pedir amistad desde la fila de un rival
  await page.locator('.rsRow:not(.me) .rsAdd').first().click();
  await expect(page.locator('.rsRow:not(.me) .rsTag').first()).toHaveText('Enviada');
  await page.locator('#rsGo').click();
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('.rsTable')).toHaveCount(0);
});
