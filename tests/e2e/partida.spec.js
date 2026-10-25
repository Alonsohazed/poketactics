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
  // el panel azul noche tapa la tienda, sin texto, y recibe los clics (no se puede tocar nada de debajo)
  const cover = await page.evaluate(() => { const m = document.getElementById('sellMsg'), cs = getComputedStyle(m), r = document.getElementById('cards').getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { disp: cs.display, txt: parseFloat(cs.fontSize), top: top && top.id }; });
  expect(cover).toEqual({ disp: 'grid', txt: 0, top: 'sellMsg' });
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
  await jumpToRound(page, 1); // en la 1-1 no se puede vender
  await page.evaluate(() => { G.me.gold = 30; G.me.level = 3; G.me.board = {}; G.me.bench = Array(BENCH).fill(null); addUnitToBench(G.me, makeInst('charmander')); renderUI(); });
  await drag(page, await benchPoint(page, 0), await cellPoint(page, 3, 6));
  await expect.poll(async () => (await me(page)).board).toBe(1);
  expect(await page.evaluate(() => Object.keys(G.me.board)[0])).toBe('3,2');
  expect(await page.evaluate(() => boardUnits(G.me).length + '/' + maxBoard(G.me))).toBe('1/3'); // el contador #boardCount ya no existe en la interfaz
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

test('rondas: sin «¡Listo!» ni «Saltar combate»: al acabar el tiempo empieza el combate y la ronda avanza @rapido', async ({ page }) => {
  // en la partida ya no hay botones para adelantar la ronda, saltar el combate, cambiar la velocidad, la sala, la Pokédex, las recetas ni el volumen
  for (const id of ['readyBtn', 'speedBtn', 'netTag', 'dexBtn', 'recBtn', 'muteBtn', 'rbPhase']) await expect(page.locator('#' + id)).toHaveCount(0);
  expect(await page.evaluate(() => [G.speed, document.querySelectorAll('.top > button').length])).toEqual([1, 2]); // velocidad x1 y solo pantalla completa y ☰
  await page.evaluate(() => { G.speed = 4; });
  const r0 = await page.evaluate(() => G.roundIdx);
  await page.evaluate(() => { G.timer = .3; });
  await expect.poll(() => page.evaluate(() => G.phase)).toBe('combat');
  await expect(page.locator('#phase')).toContainText('Combate');
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

// Algunos aumentos (emblemas, héroes…) abren una elección pendiente al elegirlos: se acepta la primera opción hasta que no queden
async function resolverElecciones(page) { for (let i = 0; i < 6; i++) { if (await page.locator('#mbox .choice, #mbox .coCard').count()) await page.locator('#mbox .choice, #mbox .coCard').first().click(); else if (await page.locator('#rvOk').count()) await page.locator('#rvOk').click(); else return; await page.waitForTimeout(400); } } // elecciones pendientes y ventanas de resultado (p. ej. la Llamada al Caos) hasta que no quede ninguna

test('aumentos: en la ronda 2-1 se elige uno y queda aplicado', async ({ page }) => {
  await jumpToRound(page, 3); // ROUNDS[3] = 2-1, con aumento
  await expect(page.locator('#mbox .augCard3')).toHaveCount(3);
  await expect(page.locator('#mbox .augRR')).toHaveCount(3); // un cambio por carta
  // Cartas nuevas: marco pintado de su rareza, icono propio (o silueta del color de la rareza en los de héroe), sin apertura de Poké Ball; título y descripción caben siempre
  await expect(page.locator('#mbox .augCard3 .ac3Ico img')).toHaveCount(3, { timeout: 15000 });
  const c = await page.evaluate(() => ({ ball: document.querySelectorAll('#mbox .augBox,#mbox .lidT').length, sale: [...document.querySelectorAll('#mbox .augCard3')].filter(el => { const b = el.querySelector('.ac3Name'), s = b.firstElementChild, d = el.querySelector('.ac3Desc'); return s.offsetHeight > b.clientHeight + 1 || s.offsetWidth > b.clientWidth + 1 || d.scrollHeight > d.clientHeight + 1; }).length }));
  expect(c).toEqual({ ball: 0, sale: 0 });
  // cada carta lleva el marco pintado de su rareza (img/aug-carta-S|G|P.webp)
  const marcos = await page.evaluate(() => [...document.querySelectorAll('#mbox .augCard3')].map(e => getComputedStyle(e).backgroundImage.includes('aug-carta-' + [...e.classList].find(k => /^t[SGP]$/.test(k)).slice(1))));
  expect(marcos).toEqual([true, true, true]);
  // aparición: empiezan transparentes y escalonadas, y en menos de 1,5 s están todas visibles
  const ap = await page.evaluate(() => [...document.querySelectorAll('#mbox .augCard3')].map(e => e.classList.contains('nuevo') && getComputedStyle(e).animationName));
  expect(ap).toEqual(['augIn', 'augIn', 'augIn']);
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('#mbox .augCard3')].every(e => getComputedStyle(e).opacity === '1')), { timeout: 3000 }).toBe(true);
  await page.locator('#mbox .augCard3').first().click();
  await page.waitForTimeout(500); await resolverElecciones(page);
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
  await page.evaluate(() => startCombat()); // ya no hay «¡Listo!»: el combate empieza al acabar el tiempo
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
  await expect(page.locator('#stage')).toHaveText('Fase 1-1');          // solo la fase, sin «Combate PvP», «Carrusel»…
  await expect(page.locator('#pills .pill')).toHaveCount(3);
  await expect(page.locator('#pills .pill.cur img')).toHaveCount(1); // retrato del Pokémon salvaje
  await expect(page.locator('#pills .pill.cur')).toHaveAttribute('title', /Magikarp/);
  await expect(page.locator('#rbAlive')).toHaveText('👤 8/8');
  await jumpToRound(page, 6); // 2-4: carrusel
  await expect(page.locator('#pills .pill.cur.rt-carousel')).toHaveCount(1);
  await expect(page.locator('#pills .pill')).toHaveCount(7);
  // iconos sin círculo: cartas verdes en 2-1 (ronda con aumento, ganada), espadas rojas en 2-2 (perdida), espadas neutras en 2-3 (por jugar),
  // el carrusel actual en dorado y, en 2-7, solo el sprite del Pokémon salvaje
  await page.evaluate(() => { G.me.rres = { 3: 'W', 4: 'L' }; renderUI(); });
  const ic = await page.evaluate(() => [...document.querySelectorAll('#pills .pill img')].map(i => i.getAttribute('src').split('/').pop().split('?')[0]));
  expect(ic.slice(0, 4)).toEqual(['cartas-gana.webp', 'espadas-pierde.webp', 'espadas-neutra.webp', 'carrusel-oro.webp']);
  expect(ic[6]).toMatch(/\.png$/);
  const fondo = await page.evaluate(() => ['.pill.rt-pvp', '.pill.rt-pve', '.pill.rt-carousel'].map(q => { const s = getComputedStyle(document.querySelector('#pills ' + q)); return s.backgroundImage + '|' + s.borderTopWidth; }));
  expect(fondo).toEqual(['none|0px', 'none|0px', 'none|0px']);
  // la barra superior no lleva franja y sus dos botones son redondos
  const top = await page.evaluate(() => { const t = getComputedStyle(document.querySelector('.top')), b = getComputedStyle(document.getElementById('menuBtn')); return [t.backgroundImage, t.borderBottomWidth, b.borderRadius, document.querySelectorAll('.top > button').length]; });
  expect(top).toEqual(['none', '0px', '50%', 2]);
  // el engranaje abre la ventana de configuración; Rendirse está deshabilitado antes de la fase 3-1
  await page.locator('#menuBtn').click(); await expect(page.locator('#modal h1')).toHaveText('Configuración'); await expect(page.locator('#optVol')).toBeVisible();
  await expect(page.locator('#surrBtn')).toBeDisabled(); await page.locator('#mClose').click(); await expect(page.locator('#modal')).toBeHidden();
  // desde 3-1 se puede rendir: queda eliminado en el último puesto y la partida termina para ti
  await jumpToRound(page, 10); // 3-1
  await page.locator('#menuBtn').click(); await expect(page.locator('#surrBtn')).toBeEnabled(); await page.locator('#surrBtn').click();
  await expect(page.locator('#modal h1')).toHaveText('¿Rendirse?'); await page.locator('#srYes').click();
  expect(await page.evaluate(() => [G.me.alive, G.me.place])).toEqual([false, 8]);
  await expect.poll(() => page.evaluate(() => G.over), { timeout: 5000 }).toBe(true);
});

// Regresión: con intereses ganados (cristales visibles) al empezar el carrusel el juego dejaba de enviar los intereses y el dibujo lanzaba
// un error en cada fotograma (pantalla gris). El escenario por capas debe seguir activo y el decorado 3D antiguo no debe construirse.
test('con intereses, el carrusel no rompe el dibujo y el escenario por capas sigue activo', async ({ page }) => {
  const errs = []; page.on('console', m => { if (m.type() === 'error' && !/401|createImageData/.test(m.text())) errs.push(m.text().slice(0, 160)); });
  await page.evaluate(() => { G.me.gold = 60; renderUI(); });
  await page.waitForTimeout(1500); // los cristales ganados brotan
  await jumpToRound(page, 6); // 2-4: carrusel (con 50+ de oro: 5 de interés)
  await page.evaluate(() => { G.me.gold = 60; renderUI(); });
  await expect(page.locator('#pills .pill.cur.rt-carousel')).toHaveCount(1);
  await page.waitForTimeout(2500);
  await page.evaluate(() => { G.carousel.t = 40; });
  await expect.poll(() => page.evaluate(() => G.phase), { timeout: 30_000 }).not.toBe('carousel');
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => { const d = document.getElementById('flatBg'); return { capas: !!d && !d.hidden, encaje: !!d && !!d.style.transform, mallas3D: B3.debugInfo().escenario, errores: frameErr.n || 0 }; });
  expect(r.capas, 'escenario por capas visible tras el carrusel').toBe(true);
  expect(r.encaje).toBe(true);
  expect(r.mallas3D, 'solo la plaza del carrusel (≈30 mallas); con el decorado 3D antiguo serían más de 55').toBeLessThan(45);
  expect(r.errores).toBe(0);
  expect(errs).toEqual([]);
});

// Sin temblor: nunca se mueve la pantalla ni el escenario ni la torre ni los cristales, ni siquiera en los golpes fuertes (terremotos, impactos, explosiones).
test('en combate nada tiembla: bloque, 3D, imagen, torre y cristales quedan quietos', async ({ page }) => {
  await page.evaluate(() => { G.me.gold = 60; G.me.level = 7; const put = (k, c) => { const u = makeInst(k); G.me.board[c] = u; }; G.me.board = {};
    [['rhyhorn', '3,2'], ['geodude', '2,3'], ['golem', '4,3'], ['onix', '1,3'], ['machop', '5,3']].forEach(([k, c]) => { if (DEF[k]) put(k, c); }); renderUI(); });
  await page.waitForTimeout(2000);
  const r = await page.evaluate(async () => {
    const st = document.getElementById('boardStack'), img = document.getElementById('flatBg'), gl = document.getElementById('gl'), cv = document.getElementById('cv');
    const pos = () => { const b = e => { const q = e.getBoundingClientRect(); return [q.left, q.top, q.width, q.height].map(v => +v.toFixed(2)).join(','); }; return b(st) + '|' + b(img) + '|' + b(gl) + '|' + b(cv) + '|' + st.style.transform + '|' + (B3.flatInfo.t || '') + '|' + JSON.stringify(B3.flatInfo.totem) + JSON.stringify(B3.flatInfo.crys); };
    const base = pos(); const vistos = new Set([base]); G.speed = 4; G.timer = .2;
    const t0 = performance.now(); let combate = 0;
    while (performance.now() - t0 < 14000) { await new Promise(r => requestAnimationFrame(r)); if (G.phase === 'combat') combate++; vistos.add(pos()); }
    return { distintas: vistos.size, fotogramasEnCombate: combate, ejemplo: [...vistos].slice(0, 3) };
  });
  expect(r.fotogramasEnCombate, 'hubo combate').toBeGreaterThan(30);
  expect(r.distintas, 'ninguna posición cambia durante el combate: ' + JSON.stringify(r.ejemplo)).toBe(1);
});

// Regresión: en multijugador cada mensaje del carrusel (cada 160 ms) creaba objetos nuevos y los Pokémon del carrusel se recreaban sin parar (se «reiniciaban»)
test('carrusel multijugador: los Pokémon no se recrean con cada mensaje del servidor', async ({ page }) => {
  await jumpToRound(page, 6); await expect(page.locator('#pills .pill.cur.rt-carousel')).toHaveCount(1); await page.waitForTimeout(2500);
  const r = await page.evaluate(async () => { const C = G.carousel, msg = () => ({ rot: C.rot, t: C.t, opts: C.opts.map(o => [o.key, o.item, -1]), av: C.order.map(p => [p.id, null, null, 0, 0, '', -1]) });
    const m0 = B3.made; for (let i = 0; i < 14; i++) { applyCar(msg()); await new Promise(r => setTimeout(r, 160)); } return { nuevos: B3.made - m0, opciones: C.opts.length }; });
  expect(r.opciones).toBeGreaterThan(5);
  expect(r.nuevos, 'ningún modelo nuevo mientras llegan mensajes iguales').toBeLessThanOrEqual(1);
});

// Regresión: en multijugador los mensajes del carrusel llegan con retrasos variables; los Pokémon se paraban y volvían a arrancar
// (la animación de correr se reiniciaba). Se simula un cliente: el carrusel real corre aparte y solo llegan sus mensajes, cada 120-420 ms y con 0-250 ms de retraso
test('carrusel multijugador: con retrasos de red las animaciones no se reinician', async ({ page }) => {
  await jumpToRound(page, 6); await expect(page.locator('#pills .pill.cur.rt-carousel')).toHaveCount(1); await page.waitForTimeout(1500);
  const r = await page.evaluate(async () => {
    const H = G.carousel; H.t = 7; let last = performance.now(), stop = false, s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const msg = () => { const { cx, cy, rr } = carGeo(), nx = x => +((x - cx) / rr).toFixed(3), ny = y => +((y - cy) / rr).toFixed(3);
      return { rot: +H.rot.toFixed(3), t: +H.t.toFixed(2), opts: H.opts.map(o => [o.key, o.item, o.taken ? o.taken.id : -1]), av: H.order.map(p => { const a = H.av[p.id] || {}; return [p.id, a.x == null ? null : nx(a.x), a.y == null ? null : ny(a.y), a.rel ? 1 : 0, a.done ? 1 : 0, a.carry ? a.carry.key : '', a.target == null ? -1 : a.target]; }) }; };
    (async () => { while (!stop && !H.finished) { const now = performance.now(), save = G.carousel; G.carousel = H; updateCarousel((now - last) / 1000); G.carousel = save; last = now; const m = msg(); setTimeout(() => { if (!stop) applyCar(m); }, rnd() * 250); await new Promise(r => setTimeout(r, 120 + rnd() * 300)); } })();
    const sw = {}, prev = {}, m0 = B3.made, t0 = performance.now();
    await new Promise(res => { (function f() { const info = B3.smInfo; for (const d in info) for (const o of info[d]) { if (prev[o.key] !== undefined && prev[o.key] !== o.estado) sw[o.key] = (sw[o.key] || 0) + 1; prev[o.key] = o.estado; } if (performance.now() - t0 < 7000) requestAnimationFrame(f); else res(); })(); });
    stop = true; const e = Object.entries(sw).map(([k, v]) => [String(k), v]);
    return { nuevos: B3.made - m0, opts: e.filter(([k]) => k.startsWith('co')).reduce((a, [, v]) => a + v, 0), tacMax: Math.max(0, ...e.filter(([k]) => k.startsWith('tac')).map(([, v]) => v)) };
  });
  expect(r.nuevos, 'ningún modelo se recrea').toBeLessThanOrEqual(1);
  expect(r.opts, 'los Pokémon del carrusel no se paran y arrancan').toBe(0);
  expect(r.tacMax, 'cada minileyenda solo cambia al arrancar y al pararse').toBeLessThanOrEqual(3);
});

// Ficha: el retrato es el de la forma de su estrella (Charmeleon a 2★, Charizard a 3★); la tienda sigue con la primera forma.
// Recetas: clic derecho en un componente abre sus 9 combinaciones, resalta las posibles con tu banca y «Crear objeto» combina
test('ficha con el retrato de su forma y recetas de objetos con clic derecho', async ({ page }) => {
  const fs = require('fs'), path = require('path');
  const r = await page.evaluate(async () => { const me = G.me; me.board = {}; const a = makeInst('charmander'); a.star = 2; const c = makeInst('charmander'); c.star = 3; me.board['3,0'] = a; me.board['5,0'] = c; me.items = ['spoon', 'water', 'claw', 'spoon', 'coat']; renderUI();
    const card = () => [document.querySelector('#ucard .ucShopCard img').getAttribute('src'), document.querySelector('#ucard .ucShopCard .cn').textContent];
    selected = a; renderCard(); const c2 = card(); selected = c; renderCard(); const c3 = card(); selected = null; renderCard();
    return { c2, c3, formas: [...FORM_ART].sort((x, y) => x - y) }; });
  expect(r.c2).toEqual(['art/f/5.avif?v=' + (await page.evaluate(() => ART_V)), 'Charmeleon']);
  expect(r.c3[1]).toBe('Charizard'); expect(r.c3[0]).toContain('art/f/6.');
  const dir = path.join(__dirname, '../../public/art/f'), files = fs.readdirSync(dir).filter(f => f.endsWith('.avif')).map(f => +f.split('.')[0]).sort((x, y) => x - y);
  expect(r.formas, 'FORM_ART coincide con public/art/f').toEqual(files);
  for (const n of files) expect(fs.existsSync(path.join(dir, n + '.webp')), 'respaldo WebP de ' + n).toBe(true);
  await page.locator('#items .item[data-i="0"]').click({ button: 'right' });
  await expect(page.locator('#recipeBox .rbRow')).toHaveCount(9);
  await expect(page.locator('#recipeBox .rbRow.ok')).toHaveCount(4); // Garra, la otra Cuchara, Agua y Revestimiento
  await page.locator('#recipeBox .rbRow.ok').first().hover(); await expect(page.locator('#recipeBox .rbMake')).toBeVisible();
  await page.locator('#recipeBox .rbMake').click();
  await expect(page.locator('#recipeBox')).toHaveCount(0);
  expect(await page.evaluate(() => G.me.items.slice())).toEqual(['water', 'shellbell', 'spoon', 'coat']);
  // un clic derecho abre y un clic fuera cierra
  await page.locator('#items .item[data-i="2"]').click({ button: 'right' }); await expect(page.locator('#recipeBox')).toHaveCount(1);
  await page.mouse.click(800, 300); await expect(page.locator('#recipeBox')).toHaveCount(0);
});

// Arena espejo: en un combate PvP la banca del rival se ve en sus losas y sus cristales de intereses se encienden en sus rombos (misma regla: 1 por cada 10 de oro)
test('en combate se ven la banca y los cristales de intereses del rival', async ({ page }) => {
  await page.evaluate(() => { G.me.gold = 55; renderUI(); });
  await expect.poll(() => page.evaluate(() => B3.flatInfo.crys.length), { timeout: 10_000 }).toBe(5); // en planificación, solo los tuyos
  await jumpToRound(page, 5); // 2-3: PvP
  await page.evaluate(() => { closeModal(); G.timer = .1; });
  await expect.poll(() => page.evaluate(() => G.phase), { timeout: 20_000 }).toBe('combat');
  const r = await page.evaluate(async () => { const o = combatOpp(); o.gold = 38; o.bench = Array(BENCH).fill(null); o.bench[0] = makeInst('gastly'); o.bench[8] = makeInst('meowth'); G.me.gold = 55;
    await new Promise(r => setTimeout(r, 1500)); return { cris: B3.flatInfo.crys.length, banca: sceneActors().filter(a => String(a.key).startsWith('ob' + o.id + ':')).map(a => a.x > geo.W / 2 ? 'der' : 'izq') }; });
  expect(r.cris, 'tus 5 cristales y 3 del rival (38 de oro)').toBe(8);
  expect(r.banca, 'la casilla 0 del rival queda a su izquierda (a tu derecha) y la 8 al otro lado').toEqual(['der', 'izq']);
});

// El carrusel espera 8 s antes de soltar a la primera pareja: tiempo para ver todos los Pokémon y objetos
test('carrusel: la primera pareja sale a los 8 s', async ({ page }) => {
  await jumpToRound(page, 6); await expect(page.locator('#pills .pill.cur.rt-carousel')).toHaveCount(1);
  const r = await page.evaluate(() => ({ s0: releaseAt(0), s1: releaseAt(1), s2: releaseAt(2) }));
  expect(r).toEqual({ s0: 8, s1: 8, s2: 11.5 });
});

// Carrusel: la vista gira para que tu puesto quede abajo, las barreras son azul claro (sin cúpula) y tras coger tu Pokémon sigues caminando
test('carrusel: tu puesto abajo, barreras azul claro y libertad tras coger un Pokémon', async ({ page }) => {
  await jumpToRound(page, 6); await expect(page.locator('#pills .pill.cur.rt-carousel')).toHaveCount(1);
  const r = await page.evaluate(async () => {
    // sin cosméticos de barrera, todas azul claro (con uno equipado, cada barrera lleva su color: ver la prueba del catálogo)
    G.players.forEach(p => { p.cs = String(p.cs || '').split('|').filter(k => !k.startsWith('br:')).join('|'); });
    await new Promise(r => setTimeout(r, 800)); const C = G.carousel, me = G.me, a = C.av[me.id], { cx, cy } = carGeo();
    const bars = B3.bars, an = carAng(C.order.indexOf(me), C.order.length), [px, py] = carV(cx + Math.cos(an), cy + Math.sin(an));
    C.t = Math.max(C.t, releaseAt(C.order.indexOf(me))); await new Promise(r => setTimeout(r, 200));
    doAct({ t: 'car', i: C.opts.findIndex(o => !o.taken) }); for (let n = 0; n < 120 && !a.done; n++) await new Promise(r => setTimeout(r, 100));
    const x0 = a.x, y0 = a.y; doAct({ t: 'carmove', x: -.8, y: .2 }); await new Promise(r => setTimeout(r, 600));
    return { abajo: Math.abs(px - cx) < 1e-6 && py > cy, bars: bars.length, col: [...new Set(bars.map(b => b.col))], piezas: Math.max(...bars.map(b => b.piezas)), done: a.done, movido: Math.hypot(a.x - x0, a.y - y0), invalido: applyAct(me, { t: 'carmove', x: NaN, y: 0 }).ok };
  });
  expect(r.abajo, 'tu puesto queda abajo en pantalla').toBe(true);
  expect(r.bars).toBeGreaterThan(0); expect(r.col).toEqual(['#8fdcff']); expect(r.piezas, 'pared y aro, sin cúpula ni halo').toBe(2);
  expect(r.done).toBe(true); expect(r.movido, 'con el Pokémon cogido se sigue moviendo').toBeGreaterThan(5); expect(r.invalido).toBe(false);
});

// La burla de Charmander (H) de otro jugador sube su contador en pub; quien mira su mismo tablero ve su animación de lanzamiento y la bola de fuego
test('la burla de otro jugador se anima en tu pantalla', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const o = G.players[1]; o.tp = [G.me.id, 3, 6]; o.alive = true;
    const act = () => sceneActors().find(a => a.key === 'tac:' + o.id);
    await new Promise(r => setTimeout(r, 400)); const antes = act();
    o.tn = 1; await new Promise(r => setTimeout(r, 300)); const durante = act();
    await new Promise(r => setTimeout(r, 1300)); const despues = act();
    return { existe: !!antes, castAntes: antes.cast, castDurante: durante.cast, apuntaDurante: durante.tx != null, apuntaDespues: despues.tx != null };
  });
  expect(r.existe).toBe(true); expect(r.castAntes).toBe(0); expect(r.castDurante).toBe(1);
  expect(r.apuntaDurante).toBe(true); expect(r.apuntaDespues).toBe(false);
});

test('Llamada al Caos: se elige y aparece una ventana con el resultado', async ({ page }) => {
  // Ya no hay oferta de aceptar o rechazar: el premio sale directamente (y algunos piden elegir un objeto o emblema)
  await page.evaluate(() => { applyAugment(G.me, AUG_BY.llamada_caos); renderUI(); });
  for (let i = 0; i < 6 && !(await page.locator('#mbox .reveal').isVisible()); i++) {
    const ch = page.locator('#mbox .choice, #mbox .coCard').first(); if (await ch.isVisible()) await ch.click(); else await page.waitForTimeout(300);
  }
  await expect(page.locator('#mbox .reveal')).toBeVisible();
  await expect(page.locator('#mbox .reveal h1')).not.toBeEmpty();
  await page.locator('#rvOk').click();
  for (let i = 0; i < 6 && await page.locator('#mbox .choice, #mbox .coCard').first().isVisible(); i++) await page.locator('#mbox .choice, #mbox .coCard').first().click();
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

test('minimapa: no se puede arrastrar ni mover la minileyenda desde él, y un clic sigue llevando al tablero', async ({ page }) => {
  const cell = page.locator('#islands .isleCell').nth(1), box = await cell.boundingBox(), isl = await page.locator('#islands').boundingBox();
  // el arrastre nativo de la imagen y el menú del clic derecho quedan anulados
  const nat = await page.evaluate(() => { const im = document.querySelector('#islands img'); const ev = new DragEvent('dragstart', { bubbles: true, cancelable: true }); im.dispatchEvent(ev);
    const cm = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); document.querySelector('#islands .isleCell').dispatchEvent(cm); return { drag: ev.defaultPrevented, menu: cm.defaultPrevented, sel: getComputedStyle(document.getElementById('islands')).userSelect }; });
  expect(nat).toEqual({ drag: true, menu: true, sel: 'none' });
  // clic derecho sostenido sobre el minimapa: la minileyenda no se mueve
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down({ button: 'right' }); await page.mouse.move(isl.x + 20, isl.y + 20, { steps: 6 }); await page.mouse.up({ button: 'right' });
  expect(await page.evaluate(() => TAC.tx)).toBeNull();
  // clic derecho sostenido en el tablero que entra en el minimapa: deja de seguir al puntero
  await page.mouse.move(600, 500); await page.mouse.down({ button: 'right' }); await page.mouse.move(isl.x + 30, isl.y + 30, { steps: 12 });
  const t1 = await page.evaluate(() => [TAC.tx, TAC.ty]); await page.mouse.move(isl.x + 70, isl.y + 70, { steps: 6 }); await page.mouse.up({ button: 'right' });
  expect(await page.evaluate(() => [TAC.tx, TAC.ty])).toEqual(t1);
  // un clic izquierdo normal sigue funcionando
  await page.locator('#islands .isleCell:not(.me)').first().click(); expect(await page.evaluate(() => !!G.view && G.view.pid !== G.me.id)).toBe(true);
});

test('pokédex: usa sprites 2D ligeros y no carga ningún modelo 3D', async ({ page }) => {
  const glb = []; page.on('request', r => { if (/\.glb|\/anims\//.test(r.url())) glb.push(r.url()); });
  await page.evaluate(() => { performance.clearResourceTimings(); showDex(0); });
  await expect(page.locator('.dexGrid .dexCard')).toHaveCount(await page.evaluate(() => UNIT_LIST.length));
  const info = await page.evaluate(() => { const im = [...document.querySelectorAll('.dexGrid img')]; return { n: im.length, bad: im.filter(i => !/\/dex\/\d+\.png(\?v=\d+)?$/.test(i.src)).length }; });
  expect(info.n).toBeGreaterThan(100); expect(info.bad).toBe(0);
  await page.evaluate(() => document.querySelector('#mbox').scrollTo(0, 1e6)); await page.waitForTimeout(1500);
  expect(await page.evaluate(() => [...document.querySelectorAll('.dexGrid img')].filter(i => i.complete && i.naturalWidth === 0).length)).toBe(0); // ningún sprite roto
  // cada forma con su propio número (en los costes 4 de 3 formas dexOf desplaza una)
  expect(await page.evaluate(() => { const c = [...document.querySelectorAll('.dexCard')].find(x => x.dataset.tip === 'unit:hatenna'); return [...c.querySelectorAll('img')].map(i => i.src.match(/(\d+)\.png/)[1]).join(); })).toBe('856,857,858');
  await page.waitForTimeout(1500); expect(glb).toEqual([]);
});

test('en la partida el clic derecho no abre el menú del navegador en ninguna zona', async ({ page }) => {
  const r = await page.evaluate(() => { const sel = ['#shopPanel', '#cards', '#odds', '#items', '#traits', '.top', '#players', '#log', '#ucard', '#islands', '#boardWrap', '#cv', '.center', 'body'];
    const out = {}; for (const s of sel) { const el = document.querySelector(s); if (!el) { out[s] = 'no existe'; continue; } const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); el.dispatchEvent(ev); out[s] = ev.defaultPrevented; } return out; });
  for (const [s, v] of Object.entries(r)) expect(v === true || v === 'no existe', s + ' → ' + v).toBe(true);
  // la ventana de selección de aumentos (y cualquier ventana) tampoco
  await page.evaluate(() => { openModal('<h1>prueba</h1><button id="mx">x</button>', { closable: true }); });
  expect(await page.evaluate(() => { const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); document.getElementById('mx').dispatchEvent(ev); return ev.defaultPrevented; })).toBe(true);
});

test('ficha de la tienda: puño en cuerpo a cuerpo y diana en los de más de 2 hexágonos', async ({ page }) => {
  const r = await page.evaluate(() => Object.fromEntries(Object.keys(DEF).map(k => { const h = shopTip(k), m = /class="stRange" title="([^"]+)"/.exec(h); return [k, [baseCombatUnit(DEF[k], 0, 1).range, m && m[1]]]; })));
  const bad = Object.entries(r).filter(([k, [rg, t]]) => !t || (rg > 2) !== /^A distancia/.test(t));
  expect(bad).toEqual([]);
  expect(r.sableye[1]).toBe('Cuerpo a cuerpo'); expect(r.abra[1]).toMatch(/^A distancia/);
});

test('habilidades: el daño se ve siempre con los 3 niveles de estrellas, aunque la habilidad cambie con la estrella', async ({ page }) => {
  const bad = await page.evaluate(() => { const out = [];
    for (const k of Object.keys(DEF)) { const d = DEF[k]; if (!d.names) continue;
      const rowsOf = view => [...abHTML(abOf(d, view), baseCombatUnit(d, 0, view), view).matchAll(/<div class="abv"><span>(Da[^<]*)<\/span><span>(.*?)<\/span>/g)].map(r => r[2].split(' / '));
      // estrellas cuya propia habilidad hace daño (tiene fila «Daño»): su número debe verse desde cualquier vista
      const dmg = [1, 2, 3].filter(s => rowsOf(s).some(c => c[s - 1] && !/—/.test(c[s - 1])));
      for (const view of [1, 2, 3]) { const cells = rowsOf(view); for (const s of dmg) if (!cells.some(c => c[s - 1] && !/—/.test(c[s - 1]))) out.push(k + ' vista ' + view + '★: sin daño de ' + s + '★'); } }
    return out; });
  expect(bad).toEqual([]);
});

test('orbes de botín: salen volando desde la casilla del salvaje, aterrizan y solo entonces se pueden recoger', async ({ page }) => {
  await page.evaluate(() => { G.phase = 'planning'; dropOrb(G.me, 'gray12', { c: 3, r: 1 }); renderUI(); });
  const a = await page.evaluate(() => orbList().map(o => ({ f: o.f, ready: o.ready, moved: Math.hypot(o.x - o.x0, o.y - o.y0) > 5 })));
  expect(a.length).toBe(1); expect(a[0].f).toBeLessThan(1); expect(a[0].ready).toBe(false); expect(a[0].moved).toBe(true); // aterriza lejos de donde salió
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => orbList().map(o => [o.f, o.ready]))).toEqual([[1, true]]);
  // en pleno combate (sin haber derrotado a todos) también se recogen en cuanto aterrizan
  expect(await page.evaluate(() => { G.phase = 'combat'; G.combat = { done: false }; const r = orbList().map(o => o.ready); G.phase = 'planning'; G.combat = null; return r; })).toEqual([true]);
  // la minileyenda va 2,4 veces más rápido cuando se dirige a un orbe
  const sp = await page.evaluate(() => { const o = orbList()[0], A = tacArea(), run = (tx, ty) => { TAC.picked.clear(); TAC.x = A.x0 + geo.R * 2; TAC.y = o.y; TAC.tx = tx; TAC.ty = ty; const x0 = TAC.x, y0 = TAC.y; stepTac(0.1); return Math.hypot(TAC.x - x0, TAC.y - y0); };
    return { orbe: run(o.x, o.y), libre: run(A.x0 + geo.R * 2, o.y + geo.R * 6) }; });
  expect(sp.orbe / sp.libre).toBeGreaterThan(2.3);
});

test('lista de jugadores: filas repartidas con la misma separación hasta el minimapa, nombre sobre la vida y sin nivel', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 }); await page.waitForTimeout(800);
  const r = await page.evaluate(() => { const rows = [...document.querySelectorAll('#players .pl')].map(e => e.getBoundingClientRect()), isl = document.getElementById('islands').getBoundingClientRect();
    const gaps = rows.slice(1).map((b, i) => Math.round(b.top - rows[i].bottom)), nm = document.querySelector('#players .pl .nm').getBoundingClientRect(), hp = document.querySelector('#players .pl .hp').getBoundingClientRect();
    return { n: rows.length, gaps, last: rows[rows.length - 1].bottom, islTop: isl.top, nameAbove: nm.bottom <= hp.top + 2, lv: document.querySelectorAll('#players .lv').length > 0 && getComputedStyle(document.querySelector('#players .lv')).display !== 'none', big: rows[0].height }; });
  expect(r.n).toBe(8); expect(r.lv).toBe(false); expect(r.nameAbove).toBe(true); expect(r.last).toBeLessThanOrEqual(r.islTop + 1); expect(r.big).toBeGreaterThan(55);
  expect(Math.max(...r.gaps) - Math.min(...r.gaps)).toBeLessThanOrEqual(2);
});

test('retratos: miniaturas ligeras y, si fallan, el sprite de la Pokédex en vez de una imagen rota', async ({ page }) => {
  const r = await page.evaluate(() => { const im = [...document.querySelectorAll('#players img.artPic')]; return { n: im.length, thumbs: im.every(i => /art\/t\/[a-z]+\.avif\?v=\d+$/.test(i.src)), cargadas: im.every(i => i.complete && i.naturalWidth > 0 && !i.classList.contains('artFb')) }; });
  expect(r.n).toBeGreaterThan(5); expect(r.thumbs).toBe(true); expect(r.cargadas).toBe(true);
  // si un AVIF no carga, se pide el WebP antes que el sprite de la Pokédex
  const wb = await page.evaluate(async () => { const im = document.createElement('img'); im.className = 'artPic'; im.dataset.dex = '4'; im.src = 'data:image/avif;base64,AAAA#no-existe.avif?v=1'; /* inválida y sin pedir nada a la red */ document.body.appendChild(im);
    await new Promise(r => setTimeout(r, 800)); const o = { probóWebp: im.dataset.fbw === '1', src: im.getAttribute('src') }; im.remove(); return o; });
  expect(wb.probóWebp).toBe(true); expect(wb.src).toMatch(/dex\/4\.png(\?v=\d+)?$/);
  const fb = await page.evaluate(async () => { const im = document.createElement('img'); im.className = 'artPic'; im.dataset.dex = '4'; im.src = 'data:image/webp;base64,AAAA'; /* imagen inválida: falla sin pedir nada a la red */ document.body.appendChild(im); await new Promise(r => setTimeout(r, 800)); const o = { src: im.src, ok: im.naturalWidth > 0 }; im.remove(); return o; });
  expect(fb.src).toMatch(/dex\/4\.png(\?v=\d+)?$/); expect(fb.ok).toBe(true);
});

test('botones de la tienda: etiqueta, moneda con el coste e icono; el coste cambia con los modificadores', async ({ page }) => {
  await jumpToRound(page, 1);
  const r = await page.evaluate(() => ({ xp: document.querySelector('#xpBtn b').textContent, rr: document.querySelector('#rerollBtn b').textContent, xc: document.getElementById('xpCostTxt').textContent, rc: document.getElementById('rrCostTxt').textContent,
    ico: [...document.querySelectorAll('.sbBtn .sbIco')].length, coins: [...document.querySelectorAll('.sbBtn .coin')].map(c => getComputedStyle(c).display) }));
  expect(r).toEqual({ xp: 'Comprar XP', rr: 'Rerrolear', xc: '4', rc: '2', ico: 2, coins: ['block', 'block'] });
  await page.evaluate(() => { G.me.freeRerolls = 2; G.me.mods.xpCost = 3; renderUI(); });
  expect(await page.evaluate(() => [document.getElementById('rrCostTxt').textContent, getComputedStyle(document.getElementById('rrCoin')).display, document.getElementById('xpCostTxt').textContent])).toEqual(['Gratis ×2', 'none', '3']);
});

test('subida de estrellas de otro jugador: ya no sale ninguna tarjeta ni píldora flotante (solo queda en el registro)', async ({ page }) => {
  await page.evaluate(() => { const o = G.players.find(p => p !== G.me); o.lastUp = [94, 3, 1001]; renderUI(); });
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => ({ layer: !!document.querySelector('#upLayer'), cards: document.querySelectorAll('.upCard').length, fn: typeof renderUps, toasts: document.querySelectorAll('#toast > *').length }))).toEqual({ layer: false, cards: 0, fn: 'undefined', toasts: 0 });
});

test('registro de daño: el botón «Rival» muestra el mismo registro pero del otro lado del combate', async ({ page }) => {
  await jumpToRound(page, 2); await page.evaluate(() => { G.timer = 1; });
  await page.waitForFunction(() => G.phase === 'combat' && G.combat && G.combat.t > 2, null, { timeout: 30000 });
  await page.evaluate(() => { sideTab = 'dmg'; document.querySelector('.sideTabs [data-tab="dmg"]').click(); renderDmg(); });
  const mine = await page.evaluate(() => [...document.querySelectorAll('#dmgList .dmgRow .nm span')].map(e => e.textContent.trim()));
  await page.click('.dmgSide [data-s="opp"]');
  const r = await page.evaluate(() => ({ title: document.getElementById('dmgTitle').textContent, rows: [...document.querySelectorAll('#dmgList .dmgRow .nm span')].map(e => e.textContent.trim()), pressed: document.querySelector('.dmgSide [data-s="opp"]').getAttribute('aria-pressed'), opp: G.combat.units.filter(u => u.side !== (curFlip() ? 1 : 0)).map(u => u.name) }));
  expect(r.pressed).toBe('true'); expect(r.title).toContain('equipo rival'); expect(r.rows.length).toBe(r.opp.length); expect(r.rows.every(n => r.opp.some(o => n.startsWith(o)))).toBe(true); expect(r.rows.join()).not.toBe(mine.join());
  await page.click('.dmgSide [data-s="me"]'); expect(await page.evaluate(() => document.getElementById('dmgTitle').textContent)).not.toContain('equipo rival');
});

test('orbes de botín: Poké Ball en imagen (plateada, dorada y prismática), sprite visible y las tres imágenes servidas', async ({ page }) => {
  await page.evaluate(() => { G.phase = 'planning'; for (const k of ['gray3', 'gold4', 'prism']) dropOrb(G.me, k, { c: 3, r: 1 }); renderUI(); });
  await page.waitForTimeout(1800);
  const r = await page.evaluate(() => B3.orbs);
  expect(r.map(o => o.tier).sort()).toEqual(['gold', 'gray', 'prism']); expect(r.every(o => o.sprite && o.vis)).toBe(true);
  for (const f of ['orbe-plata', 'orbe-oro', 'orbe-prisma']) { const res = await page.request.get('/img/fx/' + f + '.webp'); expect(res.status(), f).toBe(200); }
});

test('trofeo de aumentos: es una imagen (no decenas de mallas) y sin aumentos no hay recuadro con «?»', async ({ page }) => {
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({ esc: B3.debugInfo().escenario, hud: (() => { G.me.augments = []; hudAugs = []; ctx.save(); const spy = []; const fr = ctx.fillText; ctx.fillText = function (t) { spy.push(t); return fr.apply(this, arguments); }; drawTotemIcons(); ctx.fillText = fr; ctx.restore(); return { qs: spy.includes('?'), icons: hudAugs.length }; })(), tex: !!(B3.flatInfo && B3.flatInfo.totem) }));
  expect(r.esc).toBeLessThan(10); expect(r.hud).toEqual({ qs: false, icons: 0 }); expect(r.tex).toBe(true);
});

test('objetos: los 47 sprites son WebP ligeros propios (no se pide PokeAPI) y se ven nítidos', async ({ page }) => {
  const fs = require('fs'), path = require('path'), dir = path.join(__dirname, '..', '..', 'public', 'items');
  const files = fs.readdirSync(dir), kb = files.reduce((a, f) => a + fs.statSync(path.join(dir, f)).size, 0) / 1024;
  const n = await page.evaluate(() => Object.keys(ITEM_ART).length);
  expect(files.length).toBe(n); expect(kb).toBeLessThan(130); // 47 sprites, ~99 KB en total
  const remote = []; page.on('request', r => { if (/PokeAPI\/sprites\/master\/sprites\/items/.test(r.url())) remote.push(r.url()); });
  const r = await page.evaluate(async () => { const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:0;top:0;z-index:99;display:flex;flex-wrap:wrap;width:900px'; host.innerHTML = Object.keys(ITEM_ART).map(k => itemHTML(k, 40)).join(''); document.body.appendChild(host);
    await new Promise(r => setTimeout(r, 1500)); const im = [...host.querySelectorAll('img')]; const o = { n: im.length, ok: im.filter(i => i.complete && i.naturalWidth > 0).length, hq: im.filter(i => i.classList.contains('hq')).length, smooth: getComputedStyle(im[0]).imageRendering, w: im[0].naturalWidth }; host.remove(); return o; });
  expect(r.n).toBe(n); expect(r.ok).toBe(n); expect(r.hq).toBe(n); expect(r.smooth).toBe('auto'); expect(r.w).toBe(80); expect(remote).toEqual([]);
});

test('objetos: marco dorado en la banca, aura del color de cada objeto con sprite y los dos objetos nuevos', async ({ page }) => {
  await page.evaluate(() => { G.me.items = ['water', 'spoon', 'wing', 'claw', 'lens', 'zoom', 'medal']; renderItems.last = null; renderUI(); });
  const r = await page.evaluate(() => { const it = [...document.querySelectorAll('#items .item .ii')]; return { n: it.length, fx: it.map(e => /fx-/.test(e.className)), bw: getComputedStyle(it[3]).borderTopWidth, grad: /linear-gradient/.test(getComputedStyle(it[3]).backgroundImage), anim: getComputedStyle(it[3], '::before').animationName, after: getComputedStyle(it[0], '::after').content, fullAfter: (() => { const e = document.querySelector('#items .item .ii.full'); return e ? getComputedStyle(e, '::after').content : 'none'; })(), names: [ITEMS.lens.name, ITEMS.zoom.name, ITEM_ART.lens, ITEM_ART.zoom] }; });
  expect(r.n).toBe(7); expect(r.fx).toEqual([true, true, true, true, true, true, true]); expect(r.bw).toBe('4px'); expect(r.grad).toBe(true); expect(r.anim).toBe('fxPulse'); expect(r.after).toBe('none'); expect(r.fullAfter).toBe('none'); // sin destello en los completos
  expect(r.names).toEqual(['Paracontacto', 'Guante de Boxeo', 'protective-pads', 'punching-glove']);
});

test('carga: la CDN lenta o caída no retrasa los modelos (petición en carrera con nuestro servidor) y las imágenes salen de nuestro servidor', async ({ page }) => {
  // A tarda 6 s y B responde ya: gana B en ~1,5 s (el margen de la carrera)
  const H = { 'access-control-allow-origin': '*' }; // dominio falso: así el vigilante de peticiones fallidas (solo mira al propio servidor) no se queja
  await page.route('http://cdn-falsa.test/lenta', r => setTimeout(() => r.fulfill({ status: 200, headers: H, body: 'lenta' }).catch(() => {}), 6000)); await page.route('http://cdn-falsa.test/rapida', r => r.fulfill({ status: 200, headers: H, body: 'rapida' })); await page.route('http://cdn-falsa.test/caida', r => r.fulfill({ status: 404, headers: H, body: '' }));
  const r = await page.evaluate(async () => { const U = 'http://cdn-falsa.test/', t0 = performance.now(), res = {};
    let x = await B3.hedged(U + 'lenta', U + 'rapida'); res.lenta = [await x.text(), Math.round(performance.now() - t0)];
    const t1 = performance.now(); x = await B3.hedged(U + 'caida', U + 'rapida'); res.caida = [await x.text(), Math.round(performance.now() - t1)];
    const t2 = performance.now(); try { await B3.hedged(U + 'caida', U + 'caida'); res.ambas = 'resolvió'; } catch (e) { res.ambas = 'rechazó'; } res.ambasMs = Math.round(performance.now() - t2); return res; });
  expect(r.lenta[0]).toBe('rapida'); expect(r.lenta[1]).toBeGreaterThan(1300); expect(r.lenta[1]).toBeLessThan(3000);
  expect(r.caida[0]).toBe('rapida'); expect(r.caida[1]).toBeLessThan(800); expect(r.ambas).toBe('rechazó');
  expect(await page.evaluate(() => [window.ASSET_BASE, artThumb('abra'), itemSrc('water'), dexUrl(4)])).toEqual([undefined, 'art/t/abra.avif?v=' + 3, 'items/water.webp', 'dex/4.png?v=2']);
});

test('objetos: el marco dorado es solo de la banca; sobre un Pokémon (lienzo y ficha) el marco es negro', async ({ page }) => {
  const r = await page.evaluate(() => { const strokes = [], o = ctx.strokeRect; ctx.strokeRect = function () { strokes.push(this.strokeStyle); return o.apply(this, arguments); };
    for (const k of ['claw', 'zoom', 'band']) drawItemBadge(k, 100, 100, 30, 0); ctx.strokeRect = o;
    G.me.items = ['claw']; renderItems.last = null; renderUI();
    const bench = getComputedStyle(document.querySelector('#items .item .ii')).backgroundImage;
    const tmp = document.createElement('div'); tmp.innerHTML = '<div class="slot full">' + itemHTML('zoom', 34) + '</div>'; document.body.appendChild(tmp);
    const eq = getComputedStyle(tmp.querySelector('.ii')); const out = { strokes, bench: /linear-gradient/.test(bench), eqBorder: eq.borderTopColor, eqBg: /linear-gradient/.test(eq.backgroundImage) }; tmp.remove(); return out; });
  expect(r.strokes.every(s => s === '#000000')).toBe(true); expect(r.strokes.length).toBe(3); expect(r.bench).toBe(true); expect(r.eqBorder).toBe('rgb(0, 0, 0)'); expect(r.eqBg).toBe(false);
});

test('objetos: el aura va siempre, en el DOM (banca, ficha, historial) y en el lienzo (sobre el Pokémon, carrusel), con insignias y emblemas incluidos', async ({ page }) => {
  const r = await page.evaluate(() => { const keys = Object.keys(ITEMS), host = document.createElement('div'); host.innerHTML = keys.map(k => itemHTML(k, 30)).join(''); document.body.appendChild(host);
    const els = [...host.querySelectorAll('.ii')], sin = els.filter(e => !/ fx-/.test(' ' + e.className) || !e.style.getPropertyValue('--fx')).length, anim = els.filter(e => getComputedStyle(e, '::before').animationName === 'fxPulse').length; host.remove();
    const stops = [], og = ctx.createRadialGradient; ctx.createRadialGradient = function () { const g = og.apply(this, arguments), oa = g.addColorStop.bind(g); g.addColorStop = (o, c) => { stops.push(c); return oa(o, c); }; return g; }; drawItemBadge('claw', 100, 100, 30, 0); ctx.createRadialGradient = og;
    return { n: keys.length, sin, anim, canvas: stops.some(s => s.startsWith('rgba(210,222,245,')) }; });
  expect(r.sin).toBe(0); expect(r.anim).toBe(r.n); expect(r.canvas).toBe(true);
});

test('orbes de botín en combate PvE: se pueden tomar con la minileyenda en cuanto aterrizan, sin esperar a que mueran todos', async ({ page }) => {
  await page.evaluate(() => { G.speed = 1; G.timer = 1; });
  await page.waitForFunction(() => G.phase === 'combat' && G.combat && !G.combat.done && orbList().some(o => o.ready), null, { timeout: 60000 });
  const r = await page.evaluate(() => { const before = G.me.orbs.length, o = orbList().find(x => x.ready); TAC.picked.clear(); TAC.x = o.x; TAC.y = o.y; TAC.tx = null; stepTac(0.05); return { before, combatVivo: G.phase === 'combat' && !G.combat.done, id: o.id }; });
  expect(r.combatVivo).toBe(true);
  await expect.poll(() => page.evaluate(id => G.me.orbs.some(o => o.id === id), r.id), { timeout: 5000 }).toBe(false); // el orbe se consumió y dio su recompensa
});

test('retratos pequeños: salen del sprite de la Pokédex al instante (sin descargar modelos 3D) y DEX_FILES coincide con public/dex', async ({ page }) => {
  const fs = require('fs'), path = require('path'), dir = path.join(__dirname, '..', '..', 'public', 'dex');
  const files = fs.readdirSync(dir).map(f => +f.replace('.png', '')).sort((a, b) => a - b);
  const glb = []; page.on('request', r => { if (/\.glb/.test(r.url())) glb.push(r.url()); });
  const r = await page.evaluate(async () => { const have = [...DEX_FILES].sort((a, b) => a - b); const t = performance.now(); const host = document.createElement('div'); host.innerHTML = [4, 25, 'shiny:130', 'y/150', 129, 446].map(d => `<span class="spr" style="--s:48px" data-dex="${d}"></span>`).join(''); document.body.appendChild(host); hydrate(host);
    const im = [...host.querySelectorAll('img')]; await new Promise(r => setTimeout(r, 600)); const o = { have, n: im.length, sprites: im.filter(i => /dex\/\d+\.png(\?v=\d+)?$/.test(i.src) && i.complete && i.naturalWidth > 0).length, ms: Math.round(performance.now() - t) }; host.remove(); return o; });
  expect(r.have).toEqual(files); expect(r.n).toBe(6); expect(r.sprites).toBe(6); await page.waitForTimeout(500); expect(glb.filter(u => /\/(4|25|129|130|150|446)\.glb/.test(u))).toEqual([]);
});

// Pico de efectos de colocación (escudos del Guardián y campos del Coloso) alrededor de un arrastre: se empieza a registrar antes de
// arrastrar y se lee 1,2 s después de soltar. Sin GPU el juego va a ~10 FPS y el propio arrastre puede durar más de un segundo.
async function fxAround(page, from, to) {
  await page.evaluate(() => { window.__fx = { escudo: 0, burbuja: 0 }; if (!window.__fxLoop) { window.__fxLoop = true; const f = () => { const c = B3.fxSyn; __fx.escudo = Math.max(__fx.escudo, c.escudo); __fx.burbuja = Math.max(__fx.burbuja, c.burbuja); requestAnimationFrame(f); }; f(); } });
  await drag(page, from, to); await page.waitForTimeout(1200);
  return page.evaluate(() => Object.assign({}, window.__fx));
}

test('sinergia de Guardián: el efecto de colocación sale ya con 2 Guardianes (arrastrando de verdad)', async ({ page }) => {
  await page.evaluate(() => { const me = G.me; me.level = 8; me.board = {}; me.bench = Array(BENCH).fill(null); for (const k of ['squirtle', 'onix', 'shellder']) addUnitToBench(me, makeInst(k)); renderUI(); });
  await page.waitForTimeout(4000);
  const r = [];
  for (let i = 0; i < 3; i++) { r.push((await fxAround(page, await benchPoint(page, i), await cellPoint(page, i * 2 + 1, 5))).escudo); await page.waitForTimeout(1000); }
  expect(await page.evaluate(() => [Object.keys(G.me.board).length, traitTiers(G.me)['Guardián'] || 0])).toEqual([3, 1]);
  expect(r[0]).toBe(0);               // con 1 Guardián no hay sinergia
  expect(r[1]).toBeGreaterThanOrEqual(2); // al poner el 2.º se activa y los dos sueltan su escudo
  expect(r[2]).toBeGreaterThanOrEqual(3); // y con el 3.º, los tres
});

test('sinergias: el Guardián suelta su escudo de cristal y el Coloso un campo de fuerza (imágenes ligeras, sin Poké Ball)', async ({ page }) => {
  await page.evaluate(() => { const me = G.me; me.level = 8; me.board = {}; me.bench = Array(BENCH).fill(null); for (const k of ['magikarp', 'geodude', 'squirtle', 'onix']) addUnitToBench(me, makeInst(k)); renderUI(); });
  await page.waitForTimeout(4000);
  const r = [];
  for (let i = 0; i < 4; i++) { r.push(await fxAround(page, await benchPoint(page, i), await cellPoint(page, i * 2, 5))); await page.waitForTimeout(1000); }
  expect(r[0]).toEqual({ escudo: 0, burbuja: 0 });               // 1 Coloso: sin sinergia
  expect(r[1].burbuja).toBeGreaterThanOrEqual(2);                // 2.º Coloso: los dos sueltan su campo de fuerza
  expect(r[3].escudo).toBeGreaterThanOrEqual(2);                 // 2.º Guardián: los dos sueltan su escudo
  const fx = await page.evaluate(async () => Promise.all(['escudo', 'burbuja'].map(n => fetch('img/fx/' + n + '.webp').then(r => r.blob()).then(b => b.size))));
  expect(fx.every(n => n > 1000 && n < 30000)).toBe(true);
});

test('descripciones: la sinergia muestra los retratos de sus Pokémon y combinar enseña los dos componentes con una barra de carga', async ({ page }) => {
  await page.evaluate(() => { G.me.board = { '3,3': makeInst('gastly') }; G.me.items = ['coat', 'coat']; renderItems.last = null; renderUI(); });
  await page.locator('#traits [data-tip^="trait:Hechicero"]').first().hover();
  const sin = await page.evaluate(() => { const u = [...document.querySelectorAll('#tip .trU')]; return { n: u.length, total: UNIT_LIST.filter(d => d.traits.includes('Hechicero')).length, on: u.filter(x => x.classList.contains('on')).length }; });
  expect(sin.n).toBe(sin.total); expect(sin.on).toBe(1);
  const a = await page.locator('#items .item[data-i="0"]').boundingBox(), b = await page.locator('#items .item[data-i="1"]').boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down(); await page.mouse.move(a.x + 30, a.y + 30, { steps: 4 }); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
  await page.waitForTimeout(300);
  const antes = await page.evaluate(() => { const c = document.querySelector('#tip .combBar'); return { comps: c.querySelectorAll('.ii').length, p: +getComputedStyle(c).getPropertyValue('--p'), listo: c.classList.contains('ready'), circulo: getComputedStyle(document.querySelector('#items .item.target'), '::after').content }; });
  expect(antes.comps).toBe(3); expect(antes.p).toBeGreaterThan(0); expect(antes.p).toBeLessThan(1); expect(antes.listo).toBe(false); expect(antes.circulo).toBe('none');
  await page.waitForTimeout(900);
  await expect(page.locator('#tip .combBar')).toHaveClass(/ready/); await expect(page.locator('#tip .combBar .cbT')).toHaveText('✓ Suelta para combinar');
  await page.mouse.up();
  expect(await page.evaluate(() => G.me.items.length)).toBe(1);
});

test('banca y tablero: en planificación todas las fichas miran a la cámara (hacia el jugador)', async ({ page }) => {
  await page.evaluate(() => { const me = G.me; me.level = 8; me.board = {}; me.bench = Array(BENCH).fill(null); for (const k of ['charmander', 'bulbasaur', 'squirtle']) addUnitToBench(me, makeInst(k)); moveTo(me, { i: 2 }, { b: '3,1' }); renderUI(); });
  const r = await page.evaluate(() => { const A = sceneActors(); return { banca: A.filter(a => a.loc && a.loc.i !== undefined).map(a => +a.face.toFixed(2)), tablero: A.filter(a => a.loc && a.loc.b !== undefined).map(a => +a.face.toFixed(2)) }; });
  expect(r.banca).toEqual([0, 0]); expect(r.tablero).toEqual([0]);
});

test('preparación del combate: 3 s en los que no se pelea y las fichas del tablero se dan la vuelta; luego sale «¡Combate!» y empieza', async ({ page }) => {
  await page.evaluate(() => { const me = G.me; me.level = 1; me.board = { '3,3': makeInst('charmander') }; me.bench = Array(BENCH).fill(null); addUnitToBench(me, makeInst('bulbasaur')); renderUI(); });
  await expect.poll(() => page.evaluate(() => { const s = B3.smInfo[4]; return !!(s && s[0] && s[0].estado); }), { timeout: 30000 }).toBe(true);
  expect(await page.evaluate(() => B3.smInfo[4][0].ry)).toBe(0);      // en el tablero mira al jugador
  await page.evaluate(() => startCombat());
  await page.waitForTimeout(1500);
  const prep = await page.evaluate(() => ({ t: G.combat.t, ry: Math.abs(B3.smInfo[4][0].ry), cartel: document.getElementById('cbBanner').classList.contains('on'), banca: sceneActors().filter(a => a.loc && a.loc.i !== undefined).map(a => a.face) }));
  expect(prep.t).toBe(0);                                              // durante la preparación el combate no avanza
  expect(prep.ry).toBeGreaterThan(3);                                  // ya se ha dado la vuelta hacia el rival
  expect(prep.cartel).toBe(false); expect(prep.banca).toEqual([0]);    // sin cartel todavía y la banca sigue mirando al jugador
  await page.waitForTimeout(2200);
  const luego = await page.evaluate(() => ({ t: G.combat.t, cartel: document.getElementById('cbBanner').classList.contains('on') }));
  expect(luego.t).toBeGreaterThan(0); expect(luego.cartel).toBe(true); // a los 3 s empieza el combate con su cartel
});

test('arrastrar una ficha: va quieta (sin correr ni moverse su pose) y al soltarla tampoco corre', async ({ page }) => {
  await page.evaluate(() => { const me = G.me; me.level = 8; me.board = {}; me.bench = Array(BENCH).fill(null); addUnitToBench(me, makeInst('charmander')); renderUI(); });
  await expect.poll(() => page.evaluate(() => { const s = B3.smInfo[4]; return !!(s && s[0] && s[0].estado); }), { timeout: 30000 }).toBe(true);
  const st = () => page.evaluate(() => { const s = B3.smInfo[4][0]; return { estado: s.estado, t: s.t }; });
  const a = await benchPoint(page, 0), b = await cellPoint(page, 5, 4);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(a.x + 20, a.y - 20, { steps: 3 });
  const vistos = [];
  for (let i = 1; i <= 6; i++) { await page.mouse.move(a.x + (b.x - a.x) * i / 6, a.y + (b.y - a.y) * i / 6, { steps: 3 }); await page.waitForTimeout(120); vistos.push(await st()); }
  expect(vistos.every(v => v.estado !== 'run')).toBe(true);           // no corre mientras se arrastra
  expect(new Set(vistos.map(v => v.t)).size).toBe(1);                 // y su pose no avanza: quieta
  await page.mouse.up(); await page.waitForTimeout(100);
  expect((await st()).estado).not.toBe('run');                        // al soltarla aparece en su casilla sin carrera
});

test('ficha del Pokémon: estrellas, carta, barras, habilidad/posición/alcance, 3 objetos, rol y estadísticas solo con icono; con clic salen las descripciones', async ({ page }) => {
  await page.evaluate(() => { const u = makeInst('machop'); u.star = 2; u.items = ['claw', 'zoom']; G.me.board = { '3,2': u }; G.me.bench = Array(BENCH).fill(null); selected = u; renderUI(); });
  const c = page.locator('#ucard');
  await expect(c.locator('.ucStars')).toHaveText('★★');
  await expect(c.locator('.ucShopCard')).toBeVisible();
  await expect(c.locator('.ucBar.hp span')).toContainText('/');
  await expect(c.locator('.ucBar.mp span')).toContainText('/');
  await expect(c.locator('.ucTrio .ucBox')).toHaveCount(3);
  await expect(c.locator('.ucTrio .pos em')).toHaveText('Al frente');
  await expect(c.locator('.ucTrio .rng em')).toContainText('hex');
  await expect(c.locator('.ucItems > *')).toHaveCount(3);
  await expect(c.locator('.ucItems .ucIt:not(.empty)')).toHaveCount(2);
  await expect(c.locator('.ucRole')).toContainText(/Tanque|Tirador|Mago/);
  await expect(c.locator('.ucStats .ucSt')).toHaveCount(10);
  // las estadísticas son solo icono + valor (sin su nombre) y el objeto equipado no lleva marco
  const r = await page.evaluate(() => ({ txt: [...document.querySelectorAll('#ucard .ucSt')].map(b => b.textContent.trim()), noLabel: [...document.querySelectorAll('#ucard .ucSt')].every(b => !/[A-Za-z]{3}/.test(b.textContent.replace(/%/g, ''))), bd: getComputedStyle(document.querySelector('#ucard .ucIt:not(.empty) img')).borderTopWidth }));
  expect(r.noLabel).toBe(true); expect(r.bd).toBe('0px');
  // marco dorado/azul, estrellas en una muesca por encima del arte; los objetos llevan aura y no hay marco
  expect(await page.evaluate(() => { const u = makeInst('vaporeon'); u.items = ['claw']; G.me.board = { '3,2': u }; selected = u; renderUI(); const k = document.querySelector('#ucard'); return [!!k.querySelector('.ucIt .ii.fx-claw'), getComputedStyle(k.querySelector('.ucStars')).position, k.querySelectorAll('use').length >= 13]; })).toEqual([true, 'absolute', true]);
  await page.evaluate(() => { const u = makeInst('machop'); u.star = 2; u.items = ['claw', 'zoom']; G.me.board = { '3,2': u }; selected = u; renderUI(); });
  // clic en la habilidad, un objeto y una estadística: ventana fijada con su descripción
  await c.locator('[data-pop="ab"]').click(); await expect(page.locator('#tip')).toContainText('Activa');
  await c.locator('[data-pop^="it:"]').first().click(); await expect(page.locator('#tip')).toContainText('Garra Afilada');
  await c.locator('[data-pop="st:ap"]').click(); await expect(page.locator('#tip')).toContainText('Valor actual');
  await page.mouse.click(300, 650); await expect(page.locator('#tip')).toBeHidden();
});

test('minileyenda Eevee: sigue siendo Eevee hasta el nivel 6 y desde ahí, siempre, con 1, 2 y 3 toma la forma Vaporeon, Flareon o Jolteon', async ({ page }) => {
  await jumpToRound(page, 1);
  const f = () => page.evaluate(() => ({ f: G.me.tacForm[0], dex: tacDex(G.me), picks: G.me.picks.length }));
  await page.evaluate(() => { G.me.tac = 'eevee'; G.me.level = 5; renderUI(); });
  await page.keyboard.press('2'); expect((await f()).f).toBe(''); expect((await f()).dex).toBe(133);
  await page.evaluate(() => { addXp(G.me, 1000 * 0 + XP_NEED[5] - G.me.xp); renderUI(); }); // sube a 6
  expect(await page.evaluate(() => G.me.level)).toBe(6);
  expect(await f()).toEqual({ f: '', dex: 133, picks: 0 }); // no se abre ninguna elección y sigue siendo Eevee
  await page.keyboard.press('1'); expect(await f()).toMatchObject({ f: 'vaporeon', dex: 134 });
  await page.keyboard.press('2'); expect(await f()).toMatchObject({ f: 'flareon', dex: 136 });
  await page.keyboard.press('3'); expect(await f()).toMatchObject({ f: 'jolteon', dex: 135 });
  // a nivel 8 no hay otra elección: las mismas teclas siguen cambiando la forma cuando se quiera
  await page.evaluate(() => { G.me.level = 8; addXp(G.me, 0); renderUI(); });
  expect(await page.evaluate(() => [G.me.picks.length, tacDex(G.me)])).toEqual([0, 135]);
  await page.keyboard.press('1'); expect(await f()).toMatchObject({ f: 'vaporeon', dex: 134 });
  await page.keyboard.press('2'); expect(await f()).toMatchObject({ f: 'flareon', dex: 136 });
  // otra minileyenda ignora las teclas y la acción inválida se rechaza
  const r = await page.evaluate(() => { const a = applyAct(G.me, { t: 'tform', k: 9 }); G.me.tac = 'charmander'; const b = applyAct(G.me, { t: 'tform', k: 1 }); return [a.ok, b.ok, G.me.tacForm[0]]; });
  expect(r).toEqual([false, false, 'flareon']);
});

test('minileyenda: al llegar a su destino se queda mirando hacia donde caminaba (no vuelve a la diagonal de partida)', async ({ page }) => {
  await page.waitForFunction(() => B3.faceOf && B3.faceOf('tac:' + G.me.id) != null);
  const ang = () => page.evaluate(() => B3.faceOf('tac:' + G.me.id));
  const inicio = await ang();
  // camina hacia la izquierda: al llegar debe seguir mirando a la izquierda
  await page.evaluate(() => { TAC.tx = TAC.x - geo.R * 4; TAC.ty = TAC.y; });
  await page.waitForFunction(() => TAC.tx == null, null, { timeout: 8000 }); await page.waitForTimeout(1500);
  const izq = await ang();
  await page.evaluate(() => { TAC.tx = TAC.x + geo.R * 4; TAC.ty = TAC.y; });
  await page.waitForFunction(() => TAC.tx == null, null, { timeout: 8000 }); await page.waitForTimeout(1500);
  const der = await ang();
  const dif = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  expect(dif(izq, der)).toBeGreaterThan(2.5);   // mira a lados opuestos
  expect(dif(izq, inicio)).toBeGreaterThan(.3); expect(dif(der, inicio)).toBeGreaterThan(.3);  // y ninguna es la diagonal de partida
});

test('tienda «Elige uno» (yunque y emblemas), elegir ficha con retrato y carrusel de la 2-4', async ({ page }) => {
  // yunque de componentes: 4 cartas con el objeto enmarcado y su nombre; al elegir, el objeto va al inventario
  const n0 = await page.evaluate(() => { openAnvil(G.me, 'c', 4); renderUI(); return G.me.items.length; });
  await expect(page.locator('#mbox .chooseOne .coCard')).toHaveCount(4);
  await expect(page.locator('#mbox .coHead')).toContainText('Elige uno');
  await expect(page.locator('#mbox .coCard .coIco img').first()).toBeVisible();
  await page.locator('#mbox .coCard').first().click();
  await expect.poll(() => page.evaluate(() => G.me.items.length)).toBe(n0 + 1);
  // emblema a elegir: la misma tienda, con los emblemas como cartas
  await page.evaluate(() => { augOffer(G.me, 'prueba', 'Emblemas de tipo', 'Elige uno', emblemOpts(ELEM_TRAITS, G.me)); renderUI(); });
  await expect(page.locator('#mbox .chooseOne .coCard')).toHaveCount(3);
  await page.locator('#mbox .coCard').first().click();
  await expect.poll(() => page.evaluate(() => G.me.items.some(k => k.startsWith('emb_')))).toBe(true);
  // elegir una ficha: el panel de siempre, con el retrato de cada Pokémon
  await page.evaluate(() => { augOffer(G.me, 'prueba', 'Ultra Ball', 'Elige un Pokémon', unitOptions(G.me, u => u.cost === 4)); renderUI(); });
  await expect(page.locator('#mbox .choice.pkUnit .pkPic img').first()).toBeVisible();
  await page.locator('#mbox .choice').first().click();
  await expect(page.locator('#modal')).toBeHidden();
  // carrusel de la 2-4: 4 de coste 3, 4 de coste 2 y 1 de coste 1, sin repetidos, con halo de su coste; clic en una ficha → su ficha
  await jumpToRound(page, 6);
  const car = await page.evaluate(() => { const o = G.carousel.opts, n = {}; for (const x of o) { const c = DEF[x.key].cost; n[c] = (n[c] || 0) + 1; } return { n, uniq: new Set(o.map(x => x.key)).size, len: o.length, halo: sceneActors().filter(a => a.opt != null).every(a => a.halo === COST_HEX[DEF[G.carousel.opts[a.opt].key].cost - 1]) }; });
  expect(car).toEqual({ n: { 1: 1, 2: 4, 3: 4 }, uniq: 9, len: 9, halo: true });
  await page.evaluate(() => { selCar = 0; renderCard(); });
  await expect(page.locator('#ucard')).toBeVisible();
  await expect(page.locator('#ucard .ucShopCard .cn')).toHaveText(await page.evaluate(() => nameOf(DEF[G.carousel.opts[0].key], 1)));
});

test('cartas de la tienda: el coste va a la altura del nombre (las miniaturas del gacha también usan .cc y no deben estirarlo)', async ({ page }) => {
  const r = await page.evaluate(() => [...document.querySelectorAll('#cards .card')].map(card => { const c = card.querySelector('.cc').getBoundingClientRect(), n = card.querySelector('.cn').getBoundingClientRect(); return Math.abs((c.top + c.height / 2) - (n.top + n.height / 2)) <= 2 && c.height < 40; }));
  expect(r).toEqual([true, true, true, true, true]);
});
