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

// Algunos aumentos (emblemas, héroes…) abren una elección pendiente al elegirlos: se acepta la primera opción hasta que no queden
async function resolverElecciones(page) { for (let i = 0; i < 6; i++) { if (await page.locator('#mbox .choice').count()) await page.locator('#mbox .choice').first().click(); else if (await page.locator('#rvOk').count()) await page.locator('#rvOk').click(); else return; await page.waitForTimeout(400); } } // elecciones pendientes y ventanas de resultado (p. ej. la Llamada al Caos) hasta que no quede ninguna

test('aumentos: en la ronda 2-1 se elige uno y queda aplicado', async ({ page }) => {
  await jumpToRound(page, 3); // ROUNDS[3] = 2-1, con aumento
  await expect(page.locator('#mbox .augCard2')).toHaveCount(3);
  await expect(page.locator('#mbox .augRR')).toHaveCount(3); // un cambio por carta
  // Las cartas llegan cerradas como una ball y solo se pueden elegir cuando se abren
  await expect(page.locator('#mbox .augBox.opened')).toHaveCount(3, { timeout: 9000 });
  await page.locator('#mbox .augCard2').first().click();
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

// Sin temblor: nunca se mueve la pantalla ni el escenario ni la torre ni los cristales, ni siquiera en los golpes fuertes (terremotos, impactos, explosiones).
test('en combate nada tiembla: bloque, 3D, imagen, torre y cristales quedan quietos', async ({ page }) => {
  await page.evaluate(() => { G.me.gold = 60; G.me.level = 7; const put = (k, c) => { const u = makeInst(k); G.me.board[c] = u; }; G.me.board = {};
    [['rhyhorn', '3,2'], ['geodude', '2,3'], ['golem', '4,3'], ['onix', '1,3'], ['machop', '5,3']].forEach(([k, c]) => { if (DEF[k]) put(k, c); }); renderUI(); });
  await page.waitForTimeout(2000);
  const r = await page.evaluate(async () => {
    const st = document.getElementById('boardStack'), img = [...st.children].find(e => e.querySelector && e.querySelector('video')), gl = document.getElementById('gl'), cv = document.getElementById('cv');
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
  await jumpToRound(page, 6); await expect(page.locator('#stage')).toContainText('Carrusel'); await page.waitForTimeout(2500);
  const r = await page.evaluate(async () => { const C = G.carousel, msg = () => ({ rot: C.rot, t: C.t, opts: C.opts.map(o => [o.key, o.item, -1]), av: C.order.map(p => [p.id, null, null, 0, 0, '', -1]) });
    const m0 = B3.made; for (let i = 0; i < 14; i++) { applyCar(msg()); await new Promise(r => setTimeout(r, 160)); } return { nuevos: B3.made - m0, opciones: C.opts.length }; });
  expect(r.opciones).toBeGreaterThan(5);
  expect(r.nuevos, 'ningún modelo nuevo mientras llegan mensajes iguales').toBeLessThanOrEqual(1);
});

// El carrusel espera 8 s antes de soltar a la primera pareja: tiempo para ver todos los Pokémon y objetos
test('carrusel: la primera pareja sale a los 8 s', async ({ page }) => {
  await jumpToRound(page, 6); await expect(page.locator('#stage')).toContainText('Carrusel');
  const r = await page.evaluate(() => ({ s0: releaseAt(0), s1: releaseAt(1), s2: releaseAt(2) }));
  expect(r).toEqual({ s0: 8, s1: 8, s2: 11.5 });
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
  await page.evaluate(() => { applyAugment(G.me, AUG_BY.llamada_caos); renderUI(); });
  await expect(page.locator('#mbox h1')).toHaveText('Llamada al Caos');
  await page.locator('#mbox .choice').first().click(); // aceptar el Caos
  for (let i = 0; i < 4 && !(await page.locator('#mbox .reveal').count()); i++) { await page.waitForTimeout(500); if (await page.locator('#mbox .choice').count()) await page.locator('#mbox .choice').first().click(); } // el resultado al azar puede abrir antes una elección
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
  const info = await page.evaluate(() => { const im = [...document.querySelectorAll('.dexGrid img')]; return { n: im.length, bad: im.filter(i => !/\/dex\/\d+\.png$/.test(i.src)).length }; });
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
  const r = await page.evaluate(() => { const im = [...document.querySelectorAll('#players img.artPic')]; return { n: im.length, thumbs: im.every(i => /art\/t\/[a-z]+\.webp$/.test(i.src)) }; });
  expect(r.n).toBeGreaterThan(5); expect(r.thumbs).toBe(true);
  const fb = await page.evaluate(async () => { const im = document.createElement('img'); im.className = 'artPic'; im.dataset.dex = '4'; im.src = 'data:image/webp;base64,AAAA'; /* imagen inválida: falla sin pedir nada a la red */ document.body.appendChild(im); await new Promise(r => setTimeout(r, 800)); const o = { src: im.src, ok: im.naturalWidth > 0 }; im.remove(); return o; });
  expect(fb.src).toMatch(/dex\/4\.png$/); expect(fb.ok).toBe(true);
});

test('botones de la tienda: etiqueta, moneda con el coste e icono; el coste cambia con los modificadores', async ({ page }) => {
  await jumpToRound(page, 1);
  const r = await page.evaluate(() => ({ xp: document.querySelector('#xpBtn b').textContent, rr: document.querySelector('#rerollBtn b').textContent, xc: document.getElementById('xpCostTxt').textContent, rc: document.getElementById('rrCostTxt').textContent,
    ico: [...document.querySelectorAll('.sbBtn .sbIco')].length, coins: [...document.querySelectorAll('.sbBtn .coin')].map(c => getComputedStyle(c).display) }));
  expect(r).toEqual({ xp: 'Comprar XP', rr: 'Rerrolear', xc: '4', rc: '2', ico: 2, coins: ['block', 'block'] });
  await page.evaluate(() => { G.me.freeRerolls = 2; G.me.mods.xpCost = 3; renderUI(); });
  expect(await page.evaluate(() => [document.getElementById('rrCostTxt').textContent, getComputedStyle(document.getElementById('rrCoin')).display, document.getElementById('xpCostTxt').textContent])).toEqual(['Gratis ×2', 'none', '3']);
});

test('subida de estrellas de otro jugador: recuadro con su nombre, la cara, el nombre del Pokémon y estrellas de plata (2★) u oro (3★)', async ({ page }) => {
  await page.evaluate(() => { const o = G.players.find(p => p !== G.me); o.name = 'Webas'; o.lastUp = [94, 3, 1001]; const q = G.players.filter(p => p !== G.me)[1]; q.lastUp = [8, 2, 1002]; renderUI(); });
  await page.waitForTimeout(700);
  const r = await page.evaluate(() => [...document.querySelectorAll('#upLayer .upCard')].map(c => ({ n: c.querySelector('.un').textContent, p: c.querySelector('.pn').textContent, s: c.querySelector('.st').textContent, col: getComputedStyle(c.querySelector('.st')).color, img: /dex\/\d+\.png$/.test(c.querySelector('img').src), right: c.getBoundingClientRect().right })));
  expect(r.length).toBe(2);
  const g3 = r.find(x => x.p === 'Gengar'), s2 = r.find(x => x.p === 'Wartortle');
  expect(g3.n).toBe('Webas'); expect(g3.s).toBe('★★★'); expect(g3.col).toBe('rgb(255, 207, 51)'); expect(s2.s).toBe('★★'); expect(s2.col).toBe('rgb(223, 230, 241)'); expect(g3.img && s2.img).toBe(true);
  expect(await page.evaluate(() => { const lefts = [...document.querySelectorAll('#players .pl .plInfo')].map(e => e.getBoundingClientRect().left); return [...document.querySelectorAll('#upLayer .upCard')].every(c => c.getBoundingClientRect().right <= Math.max(...lefts) + 1); })).toBe(true);
});

test('trofeo de aumentos: es una imagen (no decenas de mallas) y sin aumentos no hay recuadro con «?»', async ({ page }) => {
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({ esc: B3.debugInfo().escenario, hud: (() => { G.me.augments = []; hudAugs = []; ctx.save(); const spy = []; const fr = ctx.fillText; ctx.fillText = function (t) { spy.push(t); return fr.apply(this, arguments); }; drawTotemIcons(); ctx.fillText = fr; ctx.restore(); return { qs: spy.includes('?'), icons: hudAugs.length }; })(), tex: !!(B3.flatInfo && B3.flatInfo.totem) }));
  expect(r.esc).toBeLessThan(10); expect(r.hud).toEqual({ qs: false, icons: 0 }); expect(r.tex).toBe(true);
});

test('subida de estrellas de todos a la vez: los 7 recuadros caben sin solaparse en cualquier altura', async ({ page }) => {
  for (const [w, h] of [[1400, 900], [1280, 720], [1920, 1080], [1366, 640]]) {
    await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(600);
    await page.evaluate(() => { const n = Date.now(); G.players.filter(p => p !== G.me).forEach((p, i) => { p.lastUp = [[94, 3, 8][i % 3], 2 + (i % 2), n + i + Math.random()]; }); renderUI(); });
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => { const b = [...document.querySelectorAll('#upLayer .upCard')].map(c => c.getBoundingClientRect()).sort((a, c) => a.top - c.top); const gaps = b.slice(1).map((x, i) => Math.round(x.top - b[i].bottom)); return { n: b.length, minGap: Math.min(...gaps), left: Math.min(...b.map(x => x.left)), top: Math.min(...b.map(x => x.top)), bottom: Math.max(...b.map(x => x.bottom)), vh: innerHeight }; });
    expect(r.n, w + 'x' + h).toBe(7); expect(r.minGap, 'solapan en ' + w + 'x' + h).toBeGreaterThanOrEqual(0); expect(r.left).toBeGreaterThan(0); expect(r.top).toBeGreaterThanOrEqual(0); expect(r.bottom).toBeLessThanOrEqual(r.vh);
    await page.evaluate(() => { G.players.forEach(p => { p.lastUp = null; }); UP_CARDS.forEach(c => c.remove()); UP_CARDS.clear(); });
  }
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
  expect(await page.evaluate(() => [window.ASSET_BASE, artThumb('abra'), itemSrc('water'), dexUrl(4)])).toEqual([undefined, 'art/t/abra.webp', 'items/water.webp', 'dex/4.png']);
});

test('objetos: el marco dorado es solo de la banca; sobre un Pokémon (lienzo y ficha) el marco es negro', async ({ page }) => {
  const r = await page.evaluate(() => { const strokes = [], o = ctx.strokeRect; ctx.strokeRect = function () { strokes.push(this.strokeStyle); return o.apply(this, arguments); };
    for (const k of ['claw', 'zoom', 'band']) drawItemBadge(k, 100, 100, 30, 0); ctx.strokeRect = o;
    G.me.items = ['claw']; renderItems.last = null; renderUI();
    const bench = getComputedStyle(document.querySelector('#items .item .ii')).backgroundImage;
    const tmp = document.createElement('div'); tmp.className = 'uc-items'; tmp.innerHTML = '<div class="slot full">' + itemHTML('zoom', 34) + '</div>'; document.body.appendChild(tmp);
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
    const im = [...host.querySelectorAll('img')]; await new Promise(r => setTimeout(r, 600)); const o = { have, n: im.length, sprites: im.filter(i => /dex\/\d+\.png$/.test(i.src) && i.complete && i.naturalWidth > 0).length, ms: Math.round(performance.now() - t) }; host.remove(); return o; });
  expect(r.have).toEqual(files); expect(r.n).toBe(6); expect(r.sprites).toBe(6); await page.waitForTimeout(500); expect(glb.filter(u => /\/(4|25|129|130|150|446)\.glb/.test(u))).toEqual([]);
});

test('sinergia de Guardián: el efecto de colocación sale ya con 2 Guardianes (arrastrando de verdad)', async ({ page }) => {
  await page.evaluate(() => { const me = G.me; me.level = 8; me.board = {}; me.bench = Array(BENCH).fill(null); for (const k of ['squirtle', 'onix', 'shellder']) addUnitToBench(me, makeInst(k)); renderUI(); });
  await page.waitForTimeout(4000);
  const pico = async () => page.evaluate(async () => { const a = B3.debugInfo().sprites; let mx = a; const t0 = performance.now(); while (performance.now() - t0 < 1000) { await new Promise(r => requestAnimationFrame(r)); mx = Math.max(mx, B3.debugInfo().sprites); } return mx - a; });
  const r = [];
  for (let i = 0; i < 3; i++) { const p = pico(); await drag(page, await benchPoint(page, i), await cellPoint(page, i * 2 + 1, 5)); r.push(await p); await page.waitForTimeout(1800); }
  expect(await page.evaluate(() => [Object.keys(G.me.board).length, traitTiers(G.me)['Guardián'] || 0])).toEqual([3, 1]);
  expect(r[0]).toBe(0);               // con 1 Guardián no hay sinergia
  expect(r[1]).toBeGreaterThanOrEqual(2); // al poner el 2.º se activa y los dos sueltan su escudo
  expect(r[2]).toBeGreaterThanOrEqual(3); // y con el 3.º, los tres
});

test('banca: las fichas miran a la cámara (hacia atrás) y en el tablero miran al frente', async ({ page }) => {
  await page.evaluate(() => { const me = G.me; me.level = 8; me.board = {}; me.bench = Array(BENCH).fill(null); for (const k of ['charmander', 'bulbasaur', 'squirtle']) addUnitToBench(me, makeInst(k)); moveTo(me, { i: 2 }, { b: '3,1' }); renderUI(); });
  const r = await page.evaluate(() => { const A = sceneActors(); return { banca: A.filter(a => a.loc && a.loc.i !== undefined).map(a => +a.face.toFixed(2)), tablero: A.filter(a => a.loc && a.loc.b !== undefined).map(a => +a.face.toFixed(2)) }; });
  expect(r.banca).toEqual([0, 0]); expect(r.tablero).toEqual([3.14]);
});
