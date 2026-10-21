// Partida contra bots: tienda, oro, tablero, rondas, combate, objetos, rasgos, aumentos y espectador
const { test, expect, register, startSolo, benchPoint, cellPoint, drag, jumpToRound } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await register(page);
  await startSolo(page);
});

const me = page => page.evaluate(() => ({ gold: G.me.gold, level: G.me.level, xp: G.me.xp, bench: G.me.bench.filter(Boolean).length, board: Object.keys(G.me.board).length, shop: G.me.shop.slice(), items: G.me.items.slice(), augs: G.me.augments.slice() }));

test('tienda: comprar resta oro, refrescar cuesta 2 y la EXP sube de nivel @rapido', async ({ page }) => {
  // Ronda 1-1: aunque haya oro, no se compra ni se vende (se juega con el Pokémon que te tocó)
  await page.evaluate(() => { G.me.gold = 50; renderUI(); });
  await expect(page.locator('#shopPanel')).toHaveClass(/\bfirst\b/);
  const r11 = await page.evaluate(() => { const b = G.me.bench.filter(Boolean).length, loc = { i: G.me.bench.findIndex(Boolean) };
    const buyR = applyAct(G.me, { t: 'buy', i: 0 }), sellR = applyAct(G.me, { t: 'sell', loc }); return { buy: buyR.ok, sell: sellR.ok, why: buyR.why, gold: G.me.gold, bench: G.me.bench.filter(Boolean).length - b }; });
  expect(r11).toEqual({ buy: false, sell: false, why: 'En la primera ronda juegas con el Pokémon que te tocó', gold: 50, bench: 0 });
  await jumpToRound(page, 1); // 1-2: la tienda ya funciona
  await expect(page.locator('#shopPanel')).not.toHaveClass(/\bfirst\b/);
  await page.evaluate(() => { G.me.gold = 50; renderUI(); });
  await expect(page.locator('#gold')).toHaveText('50');
  const before = await me(page);
  const card = page.locator('#cards .card[data-i]:not(.off)').first();
  const i = Number(await card.getAttribute('data-i'));
  const cost = await page.evaluate(i => DEF[G.me.shop[i]].cost, i);
  await card.click();
  let now = await me(page);
  expect(now.gold).toBe(before.gold - cost);
  expect(now.bench).toBe(before.bench + 1);
  expect(now.shop[i]).toBeNull();
  // refrescar
  await page.locator('#rerollBtn').click();
  const after = await me(page);
  expect(after.gold).toBe(now.gold - 2);
  expect(after.shop.every(k => k)).toBe(true);
  // comprar EXP
  await page.locator('#xpBtn').click();
  now = await me(page);
  expect(now.gold).toBe(after.gold - 4);
  expect(now.level * 100 + now.xp).toBeGreaterThan(after.level * 100 + after.xp);
  // atajos de teclado: D refresca
  await page.keyboard.press('d');
  expect((await me(page)).gold).toBe(now.gold - 2);
});

test('sin oro no se puede comprar ni refrescar', async ({ page }) => {
  await page.evaluate(() => { G.me.gold = 0; G.me.freeRerolls = 0; renderUI(); });
  await expect(page.locator('#rerollBtn')).toBeDisabled();
  await expect(page.locator('#xpBtn')).toBeDisabled();
  await expect(page.locator('#cards .card.off')).toHaveCount(5);
});

test('tablero: arrastrar del banquillo al tablero y vender arrastrando a la tienda', async ({ page }) => {
  await page.evaluate(() => { G.me.gold = 30; G.me.level = 3; G.me.board = {}; G.me.bench = Array(BENCH).fill(null); addUnitToBench(G.me, makeInst('charmander')); renderUI(); });
  await drag(page, await benchPoint(page, 0), await cellPoint(page, 3, 6));
  await expect.poll(async () => (await me(page)).board).toBe(1);
  expect(await page.evaluate(() => Object.keys(G.me.board)[0])).toBe('3,2');
  await expect(page.locator('#boardCount')).toContainText('1/3');
  // vender: arrastrarlo sobre la tienda
  const gold = (await me(page)).gold;
  const shop = await page.locator('#cards').boundingBox();
  await drag(page, await cellPoint(page, 3, 6), { x: shop.x + shop.width / 2, y: shop.y + shop.height / 2 });
  await expect.poll(async () => (await me(page)).board).toBe(0);
  expect((await me(page)).gold).toBe(gold + 1);
});

test('tres copias se combinan en 2 estrellas', async ({ page }) => {
  await page.evaluate(() => { G.me.bench = Array(BENCH).fill(null); G.me.board = {}; for (let i = 0; i < 3; i++) addUnitToBench(G.me, makeInst('bulbasaur')); renderUI(); });
  const units = await page.evaluate(() => allUnits(G.me).map(u => [u.defId, u.star, nameOf(DEF[u.defId], u.star)]));
  expect(units).toEqual([['bulbasaur', 2, 'Ivysaur']]);
});

test('rondas: Listo inicia el combate automático y la ronda avanza @rapido', async ({ page }) => {
  await page.evaluate(() => { G.speed = 4; });
  const r0 = await page.evaluate(() => G.roundIdx);
  await page.locator('#readyBtn').click();
  await expect.poll(() => page.evaluate(() => G.phase)).toBe('combat');
  await expect(page.locator('#phase')).toContainText('Combate');
  await expect(page.locator('#readyBtn')).toHaveText('Saltar combate');
  // el combate se resuelve solo y empieza la siguiente ronda
  await expect.poll(() => page.evaluate(() => G.roundIdx), { timeout: 60_000 }).toBeGreaterThan(r0);
  await expect(page.locator('#stage')).toContainText('Fase 1-2');
});

test('objetos: arrastrar un componente sobre un Pokémon y combinar dos', async ({ page }) => {
  await page.evaluate(() => { G.me.board = {}; G.me.bench = Array(BENCH).fill(null); G.me.board['3,2'] = makeInst('squirtle'); G.me.items = ['claw', 'claw']; renderUI(); });
  await expect(page.locator('#items .item')).toHaveCount(2);
  const target = await cellPoint(page, 3, 6);
  for (let k = 0; k < 2; k++) {
    const box = await page.locator('#items .item').first().boundingBox();
    await drag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, target);
  }
  await expect.poll(() => page.evaluate(() => G.me.board['3,2'].items)).toEqual(['band']); // Garra + Garra = Cinta Elegida
  await expect(page.locator('#items .item')).toHaveCount(0);
});

test('rasgos: colocar Pokémon activa sus sinergias en el panel', async ({ page }) => {
  await page.evaluate(() => { G.me.level = 4; G.me.board = { '1,3': makeInst('charmander'), '2,3': makeInst('growlithe') }; renderUI(); });
  const traits = await page.evaluate(() => traitCounts(G.me));
  expect(traits['Fuego']).toBe(2);
  await expect(page.locator('#traits .trait:not(.off)', { hasText: 'Fuego' })).toBeVisible();
});

test('aumentos: en la ronda 2-1 se elige uno y queda aplicado', async ({ page }) => {
  await jumpToRound(page, 3); // ROUNDS[3] = 2-1, con aumento
  await expect(page.locator('#mbox .augCard2')).toHaveCount(3);
  await expect(page.locator('#mbox .augRR')).toHaveCount(3); // un cambio por carta
  // Las cartas llegan cerradas como una ball y solo se pueden elegir cuando se abren
  await expect(page.locator('#mbox .augBox.opened')).toHaveCount(3, { timeout: 9000 });
  await page.locator('#mbox .augCard2').first().click();
  await expect(page.locator('#modal')).toBeHidden();
  expect((await me(page)).augs).toHaveLength(1);
});

test('PvP: barras visibles, posibles rivales y ver el combate de otro entrenador', async ({ page }) => {
  await jumpToRound(page, 4); // 2-2, PvP
  await page.evaluate(() => {
    for (const p of G.players) { p.level = 4; p.board = {}; p.bench = Array(BENCH).fill(null); for (let i = 0; i < 4; i++) giveUnitTo(p, drawUnitOfCost(1)); autoFill(p); }
    renderUI();
  });
  // fuera del combate se marcan los posibles rivales
  await expect(page.locator('#players .poTag').first()).toBeVisible();
  await page.locator('#readyBtn').click();
  await expect.poll(() => page.evaluate(() => G.phase)).toBe('combat');
  // tocar a un entrenador que no es tu rival
  const pid = await page.evaluate(() => { const f = G.fights.find(f => f.a !== G.me && f.b !== G.me); return f.a.id; });
  await page.locator(`#players .pl[data-pid="${pid}"]`).click();
  await expect(page.locator('#viewInfo')).toBeVisible();
  await expect(page.locator('#viewInfo')).toContainText('Viendo');
  const sync = await page.evaluate(() => Math.abs(G.view.cb.t - G.combat.t));
  expect(sync).toBeLessThan(0.11); // va al mismo segundo que tu combate
  await page.locator('#viewBack').click();
  await expect(page.locator('#viewInfo')).toBeHidden();
});

test('tu minileyenda es la de tu cuenta', async ({ page }) => {
  // la minileyenda de la partida es la elegida en el menú (al registrarse: bulbasaur)
  expect(await page.evaluate(() => G.me.tac)).toBe('bulbasaur');
});

test('planificador de fases: título, rondas, reloj y jugadores vivos @rapido', async ({ page }) => {
  await expect(page.locator('#stage')).toContainText('Fase 1-1');
  await expect(page.locator('#stage')).toContainText('Magikarp');
  await expect(page.locator('#pills .pill')).toHaveCount(3);
  await expect(page.locator('#pills .pill.cur img')).toHaveCount(1); // retrato del Pokémon salvaje
  await expect(page.locator('#rbAlive')).toHaveText('👤 8/8');
  await expect(page.locator('#rbPhase')).toHaveText('Planificación');
  await jumpToRound(page, 6); // 2-4: carrusel
  await expect(page.locator('#stage')).toContainText('Carrusel');
  await expect(page.locator('#pills .pill')).toHaveCount(7);
});

// Regresión: con intereses ganados (cristales visibles) al empezar el carrusel el juego dejaba de enviar los intereses y el dibujo lanzaba
// un error en cada fotograma (pantalla gris). El escenario por capas debe seguir activo y el decorado 3D antiguo no debe construirse.
test('con intereses, el carrusel no rompe el dibujo y el escenario por capas sigue activo', async ({ page }) => {
  const errs = []; page.on('console', m => { if (m.type() === 'error' && !/401|createImageData/.test(m.text())) errs.push(m.text().slice(0, 160)); });
  await page.evaluate(() => { G.me.gold = 60; renderUI(); });
  await page.waitForTimeout(1500); // los cristales ganados brotan
  await jumpToRound(page, 6); // 2-4: carrusel (con 50+ de oro: 5 de interés)
  await page.evaluate(() => { G.me.gold = 60; renderUI(); });
  await expect(page.locator('#stage')).toContainText('Carrusel');
  await page.waitForTimeout(2500);
  await page.evaluate(() => { G.carousel.t = 40; });
  await expect.poll(() => page.evaluate(() => G.phase), { timeout: 30_000 }).not.toBe('carousel');
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => { const d = [...document.querySelectorAll('#boardStack > div')].find(e => e.querySelector('video')); return { capas: !!d && !d.hidden, encaje: !!d && !!d.style.transform, mallas3D: B3.debugInfo().escenario, errores: frameErr.n || 0 }; });
  expect(r.capas, 'escenario por capas visible tras el carrusel').toBe(true);
  expect(r.encaje).toBe(true);
  expect(r.mallas3D, 'solo la plaza del carrusel (≈30 mallas); con el decorado 3D antiguo serían más de 55').toBeLessThan(45);
  expect(r.errores).toBe(0);
  expect(errs).toEqual([]);
});

// Regresión: con el escenario por capas el temblor de los golpes fuertes movía solo la cámara 3D; la torre, los cristales y los Pokémon bailaban
// sobre su base pintada. Ahora tiembla el bloque entero: imagen, lienzo 3D y capa 2D se desplazan juntos y al acabar vuelve todo a su sitio.
test('el temblor mueve imagen, 3D y capa 2D a la vez (la torre no baila sobre su base)', async ({ page }) => {
  await page.evaluate(() => { G.me.gold = 60; renderUI(); });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(async () => {
    const st = document.getElementById('boardStack'), img = [...st.children].find(e => e.querySelector && e.querySelector('video')), gl = document.getElementById('gl'), cv = document.getElementById('cv');
    const rel = () => { const a = img.getBoundingClientRect(), g = gl.getBoundingClientRect(), c = cv.getBoundingClientRect(); return { gx: g.left - a.left, gy: g.top - a.top, cx: c.left - a.left, cy: c.top - a.top, bx: st.getBoundingClientRect().left, by: st.getBoundingClientRect().top }; };
    const sin = rel(); const m = []; let movio = 0;
    for (let i = 0; i < 30; i++) { B3.debugShake(.16); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); const x = rel(); m.push(x); movio = Math.max(movio, Math.abs(x.bx - sin.bx), Math.abs(x.by - sin.by)); }
    const dif = Math.max(...m.map(x => Math.max(Math.abs(x.gx - sin.gx), Math.abs(x.gy - sin.gy), Math.abs(x.cx - sin.cx), Math.abs(x.cy - sin.cy))));
    await new Promise(r => setTimeout(r, 2500)); const fin = rel();
    return { movio: +movio.toFixed(1), difRelativa: +dif.toFixed(2), vuelve: Math.abs(fin.bx - sin.bx) < .6 && Math.abs(fin.by - sin.by) < .6, transform: st.style.transform };
  });
  expect(r.movio, 'el bloque sí tiembla').toBeGreaterThan(.5);
  expect(r.difRelativa, 'imagen, 3D y 2D se mueven juntos (sin diferencia entre ellos)').toBeLessThan(.6);
  expect(r.vuelve, 'al acabar el temblor vuelve a su sitio').toBe(true);
  expect(r.transform).toBe('');
});

test('Llamada al Caos: se elige y aparece una ventana con el resultado', async ({ page }) => {
  await page.evaluate(() => { applyAugment(G.me, AUG_BY.llamada_caos); renderUI(); });
  await expect(page.locator('#mbox h1')).toHaveText('Llamada al Caos');
  await page.locator('#mbox .choice').first().click(); // aceptar el Caos
  await expect(page.locator('#mbox .reveal')).toBeVisible();
  await expect(page.locator('#mbox .reveal h1')).not.toBeEmpty();
  await page.locator('#rvOk').click();
  await expect(page.locator('#modal')).toBeHidden();
  // también queda en el registro de la partida (sin pestaña visible)
  await expect(page.locator('#log')).toContainText('Llamada al Caos');
});

test('Pokémon favorito: su vida extra se ve en la ficha antes del combate', async ({ page }) => {
  const r = await page.evaluate(() => {
    G.me.board = { '3,2': makeInst('charmander') }; G.me.bench = Array(BENCH).fill(null);
    const u = G.me.board['3,2'], base = makeCombatUnit(u, G.me, traitTiers(G.me), 0).maxHp;
    applyAugment(G.me, AUG_BY.favorito); const pk = G.me.picks[0]; resolvePick(G.me, pk.id, 0);
    for (let i = 0; i < 4; i++) augFire(G.me, 'roundStart', {});
    closeModal(); selected = u; renderUI();
    return { base: Math.round(base), shown: Math.round(prepUnit(u).maxHp) };
  });
  expect(r.shown).toBeGreaterThan(r.base);
  await expect(page.locator('#ucard')).toContainText(String(r.shown));
});
