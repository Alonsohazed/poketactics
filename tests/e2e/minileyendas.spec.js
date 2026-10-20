// Minileyendas en directo: dos personas en la misma sala se ven moverse en el tablero en el que estén.
// Graba vídeo de los dos navegadores y guarda capturas en test-results/minileyendas/ para poder revisarlas.
const path = require('path');
const { test, expect, register } = require('./helpers');
const OUT = path.join(__dirname, '..', '..', 'test-results', 'minileyendas');

// Punto de la pantalla de una casilla del tablero (clic derecho = mover la minileyenda)
const cellScreen = (p, c, r) => p.evaluate(([c, r]) => { const [x, y] = cellXY(c, r), [sx, sy] = B3.project(x, y, 0), b = cv.getBoundingClientRect(); return [b.left + sx * b.width / view.W, b.top + sy * b.height / view.H]; }, [c, r]);
const rightClickCell = async (p, c, r) => { const [x, y] = await cellScreen(p, c, r); await p.mouse.click(x, y, { button: 'right' }); };
// Minileyendas ajenas que dibuja un navegador, en casillas (para comparar entre pantallas)
const others = p => p.evaluate(() => tacOthers.map(o => ({ name: o.p.name, x: +((o.x - geo.ox) / geo.R).toFixed(1), y: +((o.y - geo.pad) / geo.R).toFixed(1) })));
const destOf = (p, c, r) => p.evaluate(([c, r]) => { const [x, y] = cellXY(c, r); return { x: +((x - geo.ox) / geo.R).toFixed(1), y: +((y - geo.pad) / geo.R).toFixed(1) }; }, [c, r]);
const near = (a, b) => a && Math.abs(a.x - b.x) < .3 && Math.abs(a.y - b.y) < .3;

test('las minileyendas se ven moverse en directo en el tablero donde están', async ({ browser }) => {
  test.setTimeout(180_000);
  const opts = { viewport: { width: 1280, height: 800 }, recordVideo: { dir: OUT, size: { width: 1280, height: 800 } } };
  const ctxA = await browser.newContext(opts), ctxB = await browser.newContext(opts);
  const A = await ctxA.newPage(), B = await ctxB.newPage();
  const errors = []; for (const p of [A, B]) p.on('pageerror', e => errors.push(e.message));
  const userA = await register(A, undefined, 'charmander'), userB = await register(B, undefined, 'squirtle');

  await A.locator('#playBtn').click(); await A.locator('#rmCreate').click();
  const code = (await A.locator('#mbox .code').textContent()).trim();
  await B.locator('#playBtn').click(); await B.locator('#rmCode').fill(code); await B.locator('#rmJoin').click();
  await expect(A.locator('#seats .seat:not(.wait)')).toHaveCount(2);
  await A.evaluate(() => { S.timer = 90; }); // planificación larga: da tiempo a moverse
  await A.locator('#rmStart').click();
  for (const p of [A, B]) { await expect(p.locator('#cards .card')).toHaveCount(5); await expect.poll(() => p.evaluate(() => G.phase)).toBe('planning'); }
  const idA = await A.evaluate(() => G.me.id), idB = await B.evaluate(() => G.me.id);
  await A.waitForTimeout(1500);

  // 1. B va a mirar el tablero de A y camina por él: A lo ve llegar y moverse en directo
  await B.evaluate(id => spectate(id), idA);
  await rightClickCell(B, 1, 5); const d1 = await destOf(B, 1, 5);
  await expect.poll(async () => near((await others(A)).find(o => o.name === userB), d1), { timeout: 10_000 }).toBe(true);
  await rightClickCell(B, 5, 2); const d2 = await destOf(B, 5, 2);
  await A.waitForTimeout(500);
  const mid = (await others(A)).find(o => o.name === userB);
  expect(near(mid, d1) || near(mid, d2), 'a mitad de camino, ni en el origen ni en el destino').toBe(false); // se ve caminar, no teletransportarse
  await A.screenshot({ path: path.join(OUT, '1-A-ve-a-B-caminando-en-su-tablero.png') });
  await expect.poll(async () => near((await others(A)).find(o => o.name === userB), d2), { timeout: 10_000 }).toBe(true);
  await A.screenshot({ path: path.join(OUT, '2-A-ve-a-B-llegar.png') });
  await B.screenshot({ path: path.join(OUT, '2-B-en-el-tablero-de-A.png') });

  // 2. A va al tablero de B mientras B sigue en el de A: allí no debe haber una minileyenda de B parada
  await A.evaluate(id => spectate(id), idB);
  await A.waitForTimeout(800);
  expect((await others(A)).map(o => o.name), 'B está en el campo de A, no en el suyo').not.toContain(userB);
  await A.screenshot({ path: path.join(OUT, '3-A-en-el-tablero-de-B-vacio.png') });

  // 3. B vuelve a su tablero y se mueve: A, que está allí, lo ve caminar; y B ve a A de visita
  await B.evaluate(id => spectate(id), idB);
  await rightClickCell(B, 3, 6); const d3 = await destOf(B, 3, 6);
  await expect.poll(async () => near((await others(A)).find(o => o.name === userB), d3), { timeout: 10_000 }).toBe(true);
  await expect.poll(async () => (await others(B)).map(o => o.name), { timeout: 10_000 }).toContain(userA);
  await A.screenshot({ path: path.join(OUT, '4-A-ve-a-B-volver-a-su-tablero.png') });
  await B.screenshot({ path: path.join(OUT, '4-B-ve-a-A-de-visita.png') });

  // 4. A vuelve a casa: en el tablero de B ya no aparece
  await A.evaluate(id => spectate(id), idA);
  await expect.poll(async () => (await others(B)).map(o => o.name), { timeout: 10_000 }).not.toContain(userA);

  expect(errors).toEqual([]);
  const vA = A.video(), vB = B.video();
  await ctxA.close(); await ctxB.close(); // cierra los vídeos
  await vA.saveAs(path.join(OUT, 'video-jugador-A.webm')); await vB.saveAs(path.join(OUT, 'video-jugador-B.webm'));
  await vA.delete(); await vB.delete();
});
