// Multijugador: dos navegadores con cuentas distintas crean una sala, juegan y el servidor manda
const { test, expect, register } = require('./helpers');

test('dos jugadores crean sala, se unen con código y juegan', async ({ browser }) => {
  test.setTimeout(180_000); // dos navegadores con el campo 3D sin GPU tardan más de los 90 s por defecto
  const ctxA = await browser.newContext(), ctxB = await browser.newContext();
  const A = await ctxA.newPage(), B = await ctxB.newPage();
  const errors = [];
  for (const p of [A, B]) p.on('pageerror', e => errors.push(e.message));
  const userA = await register(A, undefined, 'charmander');
  const userB = await register(B, undefined, 'squirtle');

  await A.locator('#playBtn').click();
  await A.locator('#rmCreate').click();
  await expect(A.locator('#mbox .code')).toBeVisible();
  const code = (await A.locator('#mbox .code').textContent()).trim();
  expect(code).toMatch(/^[a-z0-9]{5}$/);

  await B.locator('#playBtn').click();
  await B.locator('#rmCode').fill(code);
  await B.locator('#rmJoin').click();
  await expect(B.locator('#mbox .code')).toHaveText(code);
  await expect(A.locator('#seats .seat:not(.wait)')).toHaveCount(2);
  await expect(A.locator('#seats')).toContainText(userB);
  await expect(B.locator('#rmStart')).toHaveCount(0); // solo el creador puede empezar

  await A.locator('#rmStart').click();
  for (const p of [A, B]) {
    await expect(p.locator('#menu')).toBeHidden();
    await expect.poll(() => p.evaluate(() => NET.mode)).toBe('client');
    await expect(p.locator('#cards .card')).toHaveCount(5);
  }
  // ambos ven a los dos humanos con la minileyenda de su cuenta
  const names = await A.evaluate(() => G.players.map(p => [p.name, p.tac]));
  expect(names).toContainEqual([userA, 'charmander']);
  expect(names).toContainEqual([userB, 'squirtle']);

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

// Corte de conexión a mitad de partida: aviso con el motivo, vuelta automática al asiento, botón en el menú y Atrás bloqueado
test('un corte de red no te saca de la partida: vuelve solo, o con el botón del menú', async ({ browser }) => {
  test.setTimeout(240_000);
  const ctxA = await browser.newContext(), ctxB = await browser.newContext(), A = await ctxA.newPage(), B = await ctxB.newPage();
  const errors = []; for (const p of [A, B]) p.on('pageerror', e => errors.push(e.message));
  await register(A, undefined, 'charmander'); await register(B, undefined, 'squirtle');
  await A.locator('#playBtn').click(); await A.locator('#rmCreate').click();
  const code = (await A.locator('#mbox .code').textContent()).trim();
  await B.locator('#playBtn').click(); await B.locator('#rmCode').fill(code); await B.locator('#rmJoin').click();
  await expect(A.locator('#seats .seat:not(.wait)')).toHaveCount(2);
  await A.locator('#rmStart').click();
  for (const p of [A, B]) { await expect(p.locator('#menu')).toBeHidden(); await expect.poll(() => p.evaluate(() => NET.mode)).toBe('client'); await expect(p.locator('#cards .card')).toHaveCount(5); }
  const idB = await B.evaluate(() => G.me.id);

  // 1) El botón Atrás del navegador no saca de la partida
  await B.evaluate(() => history.back()); await B.waitForTimeout(600);
  expect(await B.evaluate(() => ({ vivo: liveGame(), modo: NET.mode, menu: document.getElementById('menu').classList.contains('hidden') }))).toEqual({ vivo: true, modo: 'client', menu: true });

  // 2) Corte de transporte: sale el aviso con el motivo y, al volver la red, B recupera su asiento sin hacer nada
  await B.evaluate(() => { window.__cut = []; NET.sock.on('disconnect', r => window.__cut.push(r)); NET.sock.io.engine.close(); });
  await expect(B.locator('#lostBar')).toBeVisible(); await expect(B.locator('#lostBar')).toContainText('Conexión perdida');
  await expect(B.locator('#lostBar')).toBeHidden({ timeout: 30_000 });
  const tras = await B.evaluate(() => ({ modo: NET.mode, mismoJugador: G.me.id, cartas: document.querySelectorAll('#cards .card').length, motivo: window.__cut[0] }));
  expect(tras.modo).toBe('client'); expect(tras.mismoJugador).toBe(idB); expect(tras.cartas).toBe(5); expect(tras.motivo).toBeTruthy();
  await expect.poll(() => B.evaluate(() => G.players.length)).toBe(8);

  // 2b) El botón «Volver a mi partida» de la barra recupera el asiento al momento (antes no hacía nada con la conexión a medias)
  await B.evaluate(() => { NET.sock.io.reconnection(false); NET.sock.io.engine.close(); });
  await expect(B.locator('#lostBar')).toBeVisible(); await B.waitForTimeout(500);
  await B.evaluate(() => NET.sock.io.reconnection(true)); await B.locator('#lostBar button[data-a="back"]').click();
  await expect(B.locator('#lostBar')).toBeHidden({ timeout: 15_000 });
  await expect.poll(() => B.evaluate(() => NET.mode + ':' + G.me.id)).toBe('client:' + idB);

  // 3) «Salir al menú» tras otro corte y volver con el botón «Volver a tu partida»
  await B.evaluate(() => NET.sock.io.engine.close());
  await expect(B.locator('#lostBar')).toBeVisible();
  await B.locator('#lostBar button[data-a="menu"]').click();
  await expect(B.locator('#menu')).toBeVisible();
  await expect(B.locator('#resumeBtn')).toBeVisible({ timeout: 15_000 });
  await B.locator('#resumeBtn').click();
  await expect(B.locator('#menu')).toBeHidden({ timeout: 20_000 });
  await expect.poll(() => B.evaluate(() => NET.mode + ':' + G.me.id)).toBe('client:' + idB);
  await expect.poll(() => B.evaluate(() => G.players.length)).toBe(8);
  expect(errors).toEqual([]);
  await ctxA.close(); await ctxB.close();
});
