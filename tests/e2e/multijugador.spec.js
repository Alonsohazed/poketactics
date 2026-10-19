// Multijugador: dos navegadores con cuentas distintas crean una sala, juegan y el servidor manda
const { test, expect, register } = require('./helpers');

test('dos jugadores crean sala, se unen con código y juegan', async ({ browser }) => {
  const ctxA = await browser.newContext(), ctxB = await browser.newContext();
  const A = await ctxA.newPage(), B = await ctxB.newPage();
  const errors = [];
  for (const p of [A, B]) p.on('pageerror', e => errors.push(e.message));
  const userA = await register(A, undefined, 'red');
  const userB = await register(B, undefined, 'may');

  await A.locator('#mpBtn').click();
  await A.locator('#rmCreate').click();
  await expect(A.locator('#mbox .code')).toBeVisible();
  const code = (await A.locator('#mbox .code').textContent()).trim();
  expect(code).toMatch(/^[a-z0-9]{5}$/);

  await B.locator('#mpBtn').click();
  await B.locator('#rmCode').fill(code);
  await B.locator('#rmJoin').click();
  await expect(B.locator('#mbox .code')).toHaveText(code);
  await expect(A.locator('#seats .seat:not(.bot)')).toHaveCount(2);
  await expect(A.locator('#seats')).toContainText(userB);
  await expect(B.locator('#rmStart')).toHaveCount(0); // solo el creador puede empezar

  await A.locator('#rmStart').click();
  for (const p of [A, B]) {
    await expect(p.locator('#menu')).toBeHidden();
    await expect.poll(() => p.evaluate(() => NET.mode)).toBe('client');
    await expect(p.locator('#cards .card')).toHaveCount(5);
  }
  // ambos ven a los dos humanos con su entrenador
  const names = await A.evaluate(() => G.players.map(p => [p.name, p.tr]));
  expect(names).toContainEqual([userA, 'red']);
  expect(names).toContainEqual([userB, 'may']);

  // el servidor es quien valida: en la ronda 1-1 hay 0 de oro, así que comprar no hace nada
  await expect.poll(() => A.evaluate(() => G.me.bench.filter(Boolean).length)).toBe(1); // Pokémon inicial
  const before = await A.evaluate(() => ({ g: G.me.gold, n: G.me.bench.filter(Boolean).length }));
  expect(before.g).toBe(0);
  await A.evaluate(() => { for (let i = 0; i < 5; i++) doAct({ t: 'buy', i }); doAct({ t: 'reroll' }); });
  await A.waitForTimeout(800);
  expect(await A.evaluate(() => ({ g: G.me.gold, n: G.me.bench.filter(Boolean).length }))).toEqual(before);

  // una acción imposible no rompe nada ni da oro
  await B.evaluate(() => { NET.sock.emit('act', { t: 'buy', i: 99 }); NET.sock.emit('act', { t: 'xp' }); NET.sock.emit('act', { t: 'nada' }); });

  // los dos pulsan Listo y empieza el combate en ambos
  await A.locator('#readyBtn').click();
  await B.locator('#readyBtn').click();
  for (const p of [A, B]) await expect.poll(() => p.evaluate(() => G.phase), { timeout: 30_000 }).toBe('combat');
  expect(errors).toEqual([]);
  await ctxA.close(); await ctxB.close();
});
