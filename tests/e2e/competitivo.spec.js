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

test('Eevee es mítica: bloqueada en el selector del registro y del menú, con «Gacha» y la garantía', async ({ page }) => {
  await register(page, undefined, 'pichu'); // el registro ya pasa por el selector: Eevee no se puede elegir
  await page.locator('#pickTr').click();
  const ev = page.locator('.tacOpt[data-k="eevee"]');
  await expect(ev).toHaveClass(/locked/);
  await expect(ev).toContainText('Gacha');
  await expect(ev).toContainText('Eevee garantizado en 200 tiradas');
  await ev.click({ force: true }); // está marcada como desactivada (aria-disabled): el clic solo avisa
  await expect(ev).not.toHaveClass(/\bon\b/);
  await expect(page.locator('.tacOpt.on')).toHaveAttribute('data-k', 'pichu');
  // (que el servidor la rechace aunque el navegador lo intente se prueba en test/smoke.js)
});

test('gacha: pantalla, garantía de Eevee, diaria bloqueada sin jugar, probabilidades, historial y tienda', async ({ page }) => {
  await register(page);
  await page.locator('#eeveeGacha').click();
  await expect(page.locator('.gbCard')).toBeVisible(); await expect(page.locator('.gaBall')).toBeHidden(); // la Poké Ball solo sale al tirar
  await expect(page.locator('#gaCandy')).toHaveText('0');
  await expect(page.locator('.gaPity')).toContainText('Eevee garantizado en 200 tiradas');
  await expect(page.locator('#gaD')).toContainText('termina una partida');
  await page.locator('#ga1').click(); // sin caramelos: aviso y sin petición
  await expect(page.locator('#toast')).toContainText('400 caramelos');
  await page.locator('#gaOdds').click();
  await expect(page.locator('.gaOdds tbody tr')).toHaveCount(5);
  await expect(page.locator('.gaOdds')).toContainText('0,1 %');
  { const caja = async () => { const c = await page.locator('.gbCard').boundingBox(), v = await page.locator('.mbox:has(.gaWrap)').boundingBox(); return [c.width, c.height, v.width, v.height].map(Math.round).join('×'); };
    const sub = await caja(); await page.locator('#gaBack').click(); expect(await caja(), 'la carta y la ventana miden lo mismo en el estandarte y en las subpáginas').toBe(sub); await page.locator('#gaOdds').click(); }
  await page.locator('#gaBack').click(); await page.locator('#gaHist').click();
  await expect(page.locator('.hEmpty')).toContainText('Aún no has tirado');
  await page.locator('#gaBack').click(); await page.locator('#gaShop').click();
  await expect(page.locator('.gaItem').first()).toBeVisible();
  await expect(page.locator('.gaItem[data-k="tac:eevee"]')).toHaveCount(0); // Eevee no está a la venta
  expect(await page.locator('.gaItem').count()).toBe(await page.evaluate(() => ['l', 'e', 'r', 'c'].reduce((n, t) => n + COSM.POOL[t].length, 0)));
});

test('Personalizar y Colección: cuenta nueva sin cosméticos, desde el gacha y desde el perfil', async ({ page }) => {
  await register(page);
  await page.locator('#eeveeGacha').click();
  await page.locator('#gaPz').click();
  await expect(page.locator('.pzSlots .pxb')).toHaveCount(14);
  await expect(page.locator('.pzItems .gaItem.on')).toContainText('Ninguno');
  await expect(page.locator('#gaWrap')).toContainText('Aún no tienes ninguno de este tipo');
  await page.locator('[data-sl="fr"]').click();
  await expect(page.locator('.pzSlots .pxb.on')).toHaveText('Marco');
  await page.locator('#gaBack').click(); await page.locator('#gaColl').click();
  await expect(page.locator('#gaWrap h2')).toContainText('Colección · 0/');
  await expect(page.locator('.coRow')).toHaveCount(5);
  expect(await page.locator('.coGrid .gaItem.locked').count()).toBeGreaterThan(100);
  await page.locator('#mClose').click();
  await page.locator('#pfBtn').click(); await page.locator('#pfCustom').click();
  await expect(page.locator('.pzSlots')).toBeVisible();
});

test('catálogo completo: cada premio tiene miniatura y su efecto real (nombre, marco, perfil, partida y sonido)', async ({ page }) => {
  await register(page, undefined, 'charmander');
  await startSolo(page);
  const bad = await page.evaluate(() => {
    const out = [], me = G.me; const set = k => { me.cs = k; };
    for (const it of COSM.LIST) {
      const k = it.key, ty = COSM.typeOf(k);
      if (!cosChip(k)) out.push(k + ': sin miniatura');
      if (k === 'cd' || it.t === 'x' && ty !== 'tt') continue;
      set(k); let ok = true;
      switch (ty) {
        case 'nc': ok = /style=/.test(nameHTML('X', k)); break;
        case 'fr': ok = /--f1:#/.test(frameVars(k)); break;
        case 'tt': ok = !!titleOf(k); break;
        case 'ic': ok = /cIc/.test(iconOf(k)); break;
        case 'th': ok = Array.isArray(it.d.c) && it.d.c.length === 2; break;
        case 'ac': ok = /^#/.test(it.d.c); break;
        case 'tr': ok = Array.isArray(trailOf(me)) && trailOf(me).length === 2; break;
        case 'gr': ok = it.d.lines.length === 3 && greetText(me, 1) === it.d.lines[1]; break;
        case 'fb': ok = /^#/.test(cosD(me, 'fb').c); break;
        case 'tl': ok = cosD(me, 'tl').c.length === 2; break;
        case 'cr': ok = /^#/.test(cosD(me, 'cr').c); break;
        case 'br': ok = cosD(me, 'br').c.length === 2; break;
        case 'fn': try { Music.fanfare(it.d.notes); ok = it.d.notes.length >= 4; } catch (e) { ok = false; } break;
        case 'sh': { const t0 = me.tac; me.tac = it.d.tac; ok = String(tacDexC(me)).startsWith('hue:'); me.tac = 'pichu' === it.d.tac ? 'abra' : 'pichu'; ok = ok && !String(tacDexC(me)).startsWith('hue:'); me.tac = t0; break; }
        case 'tac': ok = !!TACS[COSM.BY[k].d.tac] && COSM.LOCKED_TACS.includes(COSM.BY[k].d.tac); break;
        default: ok = false;
      }
      if (!ok) out.push(k + ': sin efecto');
    }
    me.cs = ''; return out;
  });
  expect(bad).toEqual([]);
  // y dentro de la partida: el actor de la minileyenda lleva variocolor y rastro, y T dice la frase
  await page.evaluate(() => { G.me.cs = 'sh:charmander|tr:fuego|gr:rival'; G.me.tac = 'charmander'; });
  const tac = await page.evaluate(() => sceneActors().find(a => a.key === 'tac:' + G.me.id));
  expect(tac.dex).toMatch(/^hue:/); expect(tac.trail).toHaveLength(2);
  await page.keyboard.press('t');
  expect(await page.evaluate(() => trEmote.txt)).toBe('¡Te tengo!');
});
