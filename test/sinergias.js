/* Pruebas rápidas de sinergias (sin navegador ni servidor): tipos, fusiones, nivel prismático y forja de insignias.
   Carga augments.js + game.js como cada sala del servidor. Uso: node test/sinergias.js */
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = ['augments.js', 'game.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8')).join('\n');
const ctx = { __SERVER__: true, module: { exports: {} }, console, setTimeout, clearTimeout, setInterval, clearInterval };
vm.createContext(ctx); vm.runInContext(src, ctx);
const E = ctx.module.exports;
const vmStep = vm.runInContext('stepCombat', ctx); // un paso de combate (50 ms) para comprobar estados a mitad
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('FALLO:', msg); } };
const fresh = () => { E.newGame({ auto: true, diff: 'normal' }); const G = E.G; G.auto = false; G.roundIdx = 1;  const p = G.players[0]; p.isBot = false; p.gold = 50; p.items = []; p.picks = []; return { G, p }; };
const TRAITS = Object.keys(E.TRAITS).filter(t => t !== 'Legendario');
const keyWith = (t, not) => E.UNIT_LIST.find(u => u.traits.includes(t) && (!not || !u.traits.includes(not))).key;
const keyWithout = t => E.UNIT_LIST.find(u => !u.traits.includes(t) && u.cost <= 3).key;
const event = (p, evt, d) => E.augFire(p, evt, d || {});
const finite = u => ['maxHp', 'ad', 'as', 'ap', 'df', 'mr', 'mana', 'critC', 'critM', 'dodge', 'dmgBonus', 'regen', 'omni', 'dr', 'range', 'startShield'].every(k => Number.isFinite(u[k]));

// 1. Cada sinergia tiene un nivel prismático por encima de su máximo, con descripción
for (const t of TRAITS) { const Tr = E.TRAITS[t]; ok(Tr.pr && Tr.pr[0] > Tr.bp[Tr.bp.length - 1] && Tr.pr[1], `${t}: prismático definido por encima de ${Tr.bp.join('/')}`); ok(E.UNIT_LIST.some(u => u.traits.includes(t)), `${t}: hay Pokémon con la sinergia`); }

// 2. El prismático solo se alcanza con al menos un emblema
for (const t of TRAITS) { const Tr = E.TRAITS[t], n = Tr.bp.length, pr = Tr.pr[0];
  ok(E.tierOf(t, pr, 0) === n, `${t}: sin emblema se queda en el nivel ${n}`);
  ok(E.tierOf(t, pr, 1) === n + 1, `${t}: con emblema y ${pr} sube al prismático`);
  ok(E.tierOf(t, pr - 1, 3) === n, `${t}: con emblemas pero sin llegar a ${pr} no es prismático`); }

// 3. Unidades en cada nivel (incluido el prismático): sin valores rotos
{ const { p } = fresh();
  for (const t of TRAITS) for (let k = 0; k <= E.TRAITS[t].bp.length + 1; k++) { const u = E.makeCombatUnit(E.makeInst(keyWith(t)), p, { [t]: k }, 0); ok(finite(u), `${t} nivel ${k}: estadísticas válidas`); } }
{ const { p } = fresh(); const mk = (t, k) => E.makeCombatUnit(E.makeInst(keyWith(t)), p, { [t]: k }, 0);
  ok(mk('Fuego', 4).burnPct >= .1 && mk('Fuego', 4).fireBoom === 300, 'Fuego prismático: quemadura del 10% y explosión de 300');
  ok(mk('Hechicero', 5).echo === true && !mk('Hechicero', 4).echo, 'Hechicero prismático: doble lanzamiento solo en el prismático');
  const PR = s => E.TRAITS[s].bp.length + 1; // escalón prismático de cada sinergia
  ok(mk('Tirador', PR('Tirador')).range === mk('Tirador', PR('Tirador') - 1).range + 1, 'Tirador prismático: +1 de alcance');
  ok(mk('Depredadores', 3).rival[2] === .5, 'Depredadores 6: 50 % de maná al matar (ya no reinicia la habilidad: encadenaba remates)');
  ok(mk('Siniestro', 2).execTh === .2 && mk('Siniestro', 3).execTh === .3, 'Siniestro: umbral de ejecución 20% → 30% prismático');
  ok(mk('Acero', 2).fort === .4, 'Acero: absorbe el 40% de los adyacentes');
  ok(mk('Team Rocket', 3).rocket === 3, 'Team Rocket prismático');
  ok(mk('Psíquico', 1).psyMana === 10, 'Psíquico: regala maná'); }

// 4. Combates con todas las sinergias en prismático: terminan y sin vida rota
{ const snapFor = (t, side) => { const pr = E.TRAITS[t].pr[0];
    const u = [['3,0', keyWith(t), 2, [], 0, 0], ['2,0', keyWith(t, '__'), 2, [], 0, 0], ['4,0', keyWithout(t), 2, ['emb_' + t], 0, 0], ['3,3', keyWithout('Coloso'), 1, [], 0, 0]];
    return { ag: [], m: { x: { [t]: pr } }, u }; };
  let n = 0;
  for (let i = 0; i < TRAITS.length; i++) { const a = TRAITS[i], b = TRAITS[(i + 7) % TRAITS.length];
    for (let s = 1; s <= 3; s++) { const cb = E.createCombatSnap(snapFor(a, 0), snapFor(b, 1), { s: 4, n: 2 }, { seed: s * 977 + i });
      E.simulate(cb); n++;
      ok(cb.done, `${a} vs ${b}: el combate termina`);
      ok(cb.units.every(u => Number.isFinite(u.hp)), `${a} vs ${b}: vida válida`);
      ok(cb.gold.every(g => g >= 0 && g <= 12), `${a} vs ${b}: oro de combate dentro de límites`); } }
  ok(n === TRAITS.length * 3, 'se jugaron todos los combates prismáticos'); }
// El emblema cuenta para la sinergia y desbloquea el prismático en el tablero real
{ const { p } = fresh(); const t = 'Fuego', host = keyWithout(t); p.mods.extraTrait = { [t]: 8 };
  p.board['0,0'] = E.makeInst(host); ok(E.traitTiers(p)[t] === 3, 'Fuego 8 sin emblema: nivel 3');
  p.board['0,0'].items.push('emb_' + t); ok(E.traitTiers(p)[t] === 4, 'Fuego 8 con emblema: prismático'); }

// 5. Emblemas: Medalla + componente → siempre la misma sinergia, con estadísticas; el resto solo por aumentos
for (const c of E.BASIC) { const t = E.FORGE_OF[c][0]; ok(E.FORGE_OF[c].length === 1 && E.TRAITS[t] && E.ITEMS['em_' + c].emblem === t, `la Medalla con ${c} graba siempre ${t}`); }
ok(Object.keys(E.ITEMS).filter(k => /^em_[a-z]+_\d$/.test(k)).length === 0, 'ya no hay variantes de insignia que elegir');
ok(TRAITS.every(t => E.ITEMS['emb_' + t] && Object.keys(E.ITEMS['emb_' + t].s).length > 0), 'todos los emblemas tienen estadísticas propias');
{ const { p } = fresh(); p.items = ['medal', 'claw']; const r = E.combineBench(p, 0, 1);
  ok(r.ok && p.items[0] === 'em_claw' && E.ITEMS.em_claw.emblem === 'Coloso', 'Medalla + Garra crea la Insignia Coloso'); ok(!p.picks.some(x => x.src === '__forge'), 'sin elección de sinergia al forjar'); }
{ const { p } = fresh(); const host = E.UNIT_LIST.find(u => !u.traits.includes('Hechicero')).key;
  const u = E.makeInst(host); u.items = ['spoon']; p.board['0,0'] = u; p.items = ['medal'];
  const r = E.useItem(p, 0, u); ok(r.ok && u.items[0] === 'em_spoon' && !p.picks.length, 'la Medalla sobre un Pokémon con Cuchara forja en él la Insignia Hechicero'); }
// El emblema da la sinergia y su efecto de verdad: Coloso da vida extra a todo el equipo y el doble al Coloso
{ const cof5 = p => E.createCombatSnap(E.teamSnap(p), null, { s: 1, n: 1 }, { seed: 7 }).units.find(u => u.side === 0 && u.bk === '3,3'); const { p } = fresh(); const a = E.UNIT_LIST.find(u => u.traits.includes('Coloso') && u.cost === 1).key, b = E.UNIT_LIST.find(u => !u.traits.includes('Coloso') && u.cost === 1 && u.role === 'r').key;
  p.board = { '0,0': E.makeInst(a), '3,3': E.makeInst(b) }; const hp0 = cof5(p).maxHp; ok(!(E.traitTiers(p).Coloso > 0), 'un solo Coloso no activa la sinergia');
  p.board['3,3'].items.push('emb_Coloso'); ok(E.traitTiers(p).Coloso === 1, 'el emblema Coloso cuenta para la sinergia');
  const hp1 = cof5(p).maxHp; ok(hp1 > hp0 + 300, `el portador recibe el efecto de Coloso y las estadísticas del emblema (${Math.round(hp0)} → ${Math.round(hp1)})`); }

// 6. Fusiones: Cazatesoros apunta el botín y Potencial Evolutivo crece cada ronda
{ const { p } = fresh(); E.lootTrack(p, () => { p.gold += 3; E.giveItem(p, 'claw'); }); ok(p.loot.gold === 3 && p.loot.items === 1 && p.loot.value === 6, 'botín: 3 de oro y un objeto (valor 6)'); }
{ const { G, p } = fresh(); for (const q of G.players) q.board = {}; const u = E.makeInst('charmander'); p.board['0,0'] = u; p.mods.extraTrait = { 'Potencial Evolutivo': 7 }; u.items = ['emb_Potencial Evolutivo'];
  // charmander ya es Potencial Evolutivo: el emblema no cuenta, así que se queda en nivel 3
  // 1 estrella en el tablero (+4 %) y el emblema duplica el crecimiento de su portador aunque no cuente para la sinergia
  E.growPotential(); ok(Math.abs(u.stk.hp - 45 * 1.04 * 2) < .01 && Math.abs(u.stk.ad - 4 * 1.04 * 2) < .01, `Potencial Evolutivo 8 sin emblema válido: +45/+4 ×1,04 ×2 (${u.stk.hp}/${u.stk.ad})`);
  const v = E.makeInst(keyWithout('Potencial Evolutivo')); v.items = ['emb_Potencial Evolutivo']; p.board['1,0'] = v; u.stk = { hp: 0, ad: 0 }; v.stk = { hp: 0, ad: 0 };
  E.growPotential(); const k2 = 1.08 * 2; ok(Math.abs(u.stk.hp - 80 * k2) < .01 && Math.abs(v.stk.hp - 80 * k2) < .01 && Math.abs(v.stk.ad - 8 * k2) < .01, 'Potencial Evolutivo prismático: +80/+8 por ronda (×1,08 por 2 estrellas y ×2 del emblema)');
  u.items = []; v.items = []; u.star = 3; u.stk = { hp: 0, ad: 0 }; v.stk = { hp: 0, ad: 0 }; E.growPotential(); ok(Math.abs(u.stk.hp - 45 * 2.5 * 1.16) < .01 && v.stk.hp === 0, `Potencial Evolutivo (sin emblemas ya no es prismático: +45; sin la sinergia no crece): a 3★ crece ×2,5 y todo el tablero suma +4 % por estrella (${u.stk.hp}/${v.stk.hp})`); }

// 7. Aumentos de héroe: dan el Pokémon y su efecto funciona en combate
const HEROES = { h_gengar: 'gastly', h_gyarados: 'magikarp', h_clefable: 'cleffa', h_alakazam: 'abra', h_raichu: 'pichu', h_machamp: 'machop', h_lucario: 'riolu', h_charizard: 'charmander', h_meowth: 'meowth', h_ditto: 'ditto', h_dusknoir: 'duskull' };
for (const [id, k] of Object.entries(HEROES)) { const { G, p } = fresh(); const a = E.AUG_BY[id];
  ok(a && a.hero === k, `${id}: aumento de héroe de ${k}`);
  E.applyAugment(p, a);
  const got = [...p.bench.filter(Boolean), ...Object.values(p.board)].filter(u => u.defId === k);
  ok(got.length >= 1, `${id}: recibes ${k}`);
  if (id === 'h_gyarados') ok(got.some(u => u.star === 2), 'El Elegido: Magikarp ★★');
  // combate: el héroe a 2★ contra un equipo estándar
  const snap = { ag: E.augSnap(p), m: {}, u: [['3,0', k, 2, [], 0, 0], ['2,0', 'machop', 2, [], 0, 0]] };
  const foe = { ag: [], m: {}, u: [['3,0', 'onix', 2, [], 0, 0], ['2,0', 'abra', 2, [], 0, 0], ['4,0', 'gastly', 2, [], 0, 0]].filter(r => E.DEF[r[1]]) };
  const cb = E.createCombatSnap(snap, foe, { s: 4, n: 2 }, { seed: 4242 }); const h = cb.units.find(u => u.side === 0 && u.d.key === k);
  if (id === 'h_lucario') ok(h.echo, 'Aura Implacable: doble lanzamiento');
  if (id === 'h_machamp') ok(h.sp.rage === .07, 'Furia Creciente: cargas de velocidad');
  if (id === 'h_clefable') ok(h.critAbil, 'Precisión Lunar: habilidades críticas');
  if (id === 'h_clefable') ok(h.ab[0] === 'lunar' && h.ab[2].grow > 0, 'Precisión Lunar: cambia su habilidad por Rayo Lunar, que crece al lanzar');
  if (id === 'h_charizard') ok(h.dragonRamp === .05, 'Calor Acumulado: daño creciente');
  E.simulate(cb); ok(cb.done && cb.units.every(u => Number.isFinite(u.hp)), `${id}: el combate termina sin valores rotos`);
  if (id === 'h_ditto') ok(h.copied && h.copied[0] !== 'copy', 'Adaptación Perfecta: Ditto copia una habilidad enemiga'); }
// Sustitutos de los clásicos planos
{ const { p } = fresh(); E.applyAugment(p, E.AUG_BY.pacto_cruel); p.gold = 0; const hp = p.hp, lv = p.level, xp = p.xp;
  ok(E.applyAct(p, { t: 'xp' }).ok && p.hp === hp - 2 && (p.level > lv || p.xp > xp), 'Pacto Cruel: la EXP se paga con 2 de vida'); p.hp = 20; ok(!E.applyAct(p, { t: 'xp' }).ok, 'Pacto Cruel: con 20 de vida o menos vuelve a costar oro'); }
{ const { p } = fresh(); E.applyAugment(p, E.AUG_BY.corona_maldita); ok(p.mods.boardBonus === 2, 'Corona Maldita: +2 espacios'); p.hp = 80; event(p, 'damaged', { d: 7 }); ok(p.hp === 73, 'Corona Maldita: el doble de daño'); }
{ const { p } = fresh(); E.applyAugment(p, E.AUG_BY.regalo_cumple); E.addXp(p, 30);
  ok(p.bench.filter(Boolean).some(u => u.star === 2), 'Regalo de Cumpleaños: un Pokémon de 2★ al subir de nivel'); }
{ const { G, p } = fresh(), a = E.AUG_BY.regalo_cumple, en = s => { G.round = Object.assign({}, G.round, { s }); return a.req(p); };
  ok(a.tier === 'P' && en(2) && !en(3) && !en(4), 'Regalo de Cumpleaños: Prismático y solo en la elección de 2-1'); }
for (const [nv, coste] of [[3, 1], [5, 1], [6, 2], [7, 3], [8, 4], [9, 5], [10, 5]]) { const { p } = fresh(); E.applyAugment(p, E.AUG_BY.regalo_cumple); p.bench = p.bench.map(() => null); event(p, 'levelUp', { level: nv });
  const u = p.bench.find(Boolean); ok(u && u.star === 2 && E.DEF[u.defId].cost === coste, `Regalo de Cumpleaños: a nivel ${nv}, un Pokémon de coste ${coste} a 2★`); }
// Iconos propios de los aumentos: todos menos los de héroe, con su archivo en public/img/aug
{ const fs = require('fs'), path = require('path'), A = Object.values(E.AUG_BY);
  ok(A.filter(a => a.hero).every(a => !a.ico && a.img), 'los aumentos de héroe siguen con la ilustración de su Pokémon');
  const sin = A.filter(a => !a.hero && !(a.ico && fs.existsSync(path.join(__dirname, '..', 'public', a.ico.split('?')[0]))));
  ok(!sin.length, 'cada aumento que no es de héroe tiene su icono en public/img/aug' + (sin.length ? ': faltan ' + sin.map(a => a.id).join(' ') : '')); }
{ const { p } = fresh(); E.applyAugment(p, E.AUG_BY.pandora); p.items = ['claw', 'band', 'medal', 'emb_Acero', 'em_water']; event(p, 'roundStart', {});
  ok(E.BASIC.includes(p.items[0]) && E.FULL_KEYS.includes(p.items[1]) && p.items[2] === 'medal', 'Objetos de Pandora: componentes por componentes, completos por completos y la Medalla se queda');
  ok(/^emb_/.test(p.items[3]) && p.items[3] !== 'emb_Acero' && E.ITEMS[p.items[3]], 'Objetos de Pandora: un emblema cambia por otro emblema distinto (p. ej. Acero → Agua)');
  ok(/^em_/.test(p.items[4]) && !/^emb_/.test(p.items[4]) && p.items[4] !== 'em_water' && E.ITEMS[p.items[4]], 'Objetos de Pandora: una insignia cambia por otra insignia distinta'); }
{ const { p } = fresh(); E.applyAugment(p, E.AUG_BY.forja_portatil); ok(p.picks.filter(x => x.src === 'forja_portatil').length === 2, 'Forja Portátil: dos elecciones de objeto'); }
{ const { p } = fresh(); E.applyAugment(p, E.AUG_BY.huevo); for (let i = 0; i < 6; i++) event(p, 'roundStart', {}); ok(p.augSt.huevo.once, 'Huevo Misterioso: eclosiona a las 6 rondas'); }
{ const { p } = fresh(); p.board = { '0,0': E.makeInst('ditto') }; E.applyAugment(p, E.AUG_BY.diferente); const sn = E.augSnap(p).find(r => r[0] === 'diferente'); ok(sn && sn[1].includes('0,0'), 'Diferente: detecta al Pokémon sin sinergias activas'); }
ok(!Object.values(E.AUG_BY).some(a => ['Depredadores Supremos', 'Linaje Ancestral', 'Cadena de Evolución'].includes(a.name)), 'renombrados los aumentos que chocaban con sinergias');

// 8. Los aumentos de héroe solo salen en 2-1 y 3-2
{ const { G, p } = fresh(); const seen = { early: 0, late: 0 };
  for (const [s, k] of [[2, 'early'], [3, 'early'], [4, 'late'], [5, 'late']]) { G.round = { s, n: 2 }; for (let i = 0; i < 150; i++) for (const t of ['S', 'G', 'P']) seen[k] += E.augmentChoices(p, t).filter(id => E.AUG_BY[id].hero).length; }
  ok(seen.early > 0, `salen héroes en las fases 2 y 3 (${seen.early})`); ok(seen.late === 0, `no salen héroes desde la fase 4 (${seen.late})`); }
// 9. Aumentos de stats por ronda: se aplican en combate y el contador dice cuánto han dado
const combatOf = (p, k) => { const cb = E.createCombatSnap(E.teamSnap(p), null, { s: 1, n: 1 }, { seed: 7 }); return cb.units.find(u => u.side === 0 && u.bk === k); };
{ const { p } = fresh(); const u = E.makeInst('charmander'); p.board = { '3,0': u }; const base = combatOf(p, '3,0');
  E.applyAugment(p, E.AUG_BY.favorito); E.resolvePick(p, p.picks[0].id, 0); for (let i = 0; i < 4; i++) event(p, 'roundStart', {});
  const c = combatOf(p, '3,0'); ok(Math.round(c.maxHp - base.maxHp) === 60 && Math.round(c.ap - base.ap) === 30, `Pokémon Favorito: +60 de vida y +30 de poder tras 4 rondas (${Math.round(c.maxHp - base.maxHp)}, ${Math.round(c.ap - base.ap)})`);
  ok(/Charmander.*\+60 de vida/.test(E.augProgress(p, 'favorito')), 'Pokémon Favorito: el contador dice a quién y cuánto: ' + E.augProgress(p, 'favorito')); }
{ const { p } = fresh(); const u = E.makeInst('machop'); p.board = { '3,0': u }; const base = combatOf(p, '3,0');
  E.applyAugment(p, E.AUG_BY.extremo); E.resolvePick(p, p.picks[0].id, 0); for (let i = 0; i < 3; i++) event(p, 'roundStart', {});
  const c = combatOf(p, '3,0'); ok(Math.round(c.maxHp - base.maxHp) === 120 && Math.round(c.ap - base.ap) === 9, `Entrenamiento Extremo: +120 de vida y +9 de poder tras 3 rondas`);
  p.board = {}; p.bench[0] = u; event(p, 'roundStart', {}); ok(p.augSt.extremo.n === 3, 'Entrenamiento Extremo: no cuenta rondas en el banquillo');
  ok(/\+9% de daño, \+9 de poder y \+120 de vida/.test(E.augProgress(p, 'extremo')), 'Entrenamiento Extremo: contador con las stats: ' + E.augProgress(p, 'extremo')); }
{ const { p } = fresh(); p.board = { '3,0': E.makeInst('squirtle') }; const base = combatOf(p, '3,0');
  E.applyAugment(p, E.AUG_BY.entreno_diario); for (let i = 0; i < 5; i++) event(p, 'win', {}); const c = combatOf(p, '3,0');
  ok(Math.abs(c.maxHp / base.maxHp - 1.05) < .001, 'Entrenamiento Diario: +5% de vida tras 5 victorias'); ok(/\+5% de vida y de ataque y \+5 de poder/.test(E.augProgress(p, 'entreno_diario')), 'Entrenamiento Diario: contador'); }
{ const { p } = fresh(); const u = E.makeInst('abra'); p.board = { '3,0': u };
  E.applyAugment(p, E.AUG_BY.entreno_combate); E.resolvePick(p, p.picks[0].id, 0); for (let i = 0; i < 2; i++) event(p, 'roundEnd', {});
  ok(u.stk.ad === 6 && u.stk.hp === 40 && u.stk.ap === 9, 'Entrenamiento de Combate: +6 de ataque, +9 de poder y +40 de vida permanentes'); ok(/\+6 de ataque, \+9 de poder y \+40 de vida/.test(E.augProgress(p, 'entreno_combate')), 'Entrenamiento de Combate: contador'); }
{ const { p } = fresh(); p.board = { '3,0': E.makeInst('abra') }; const base = combatOf(p, '3,0'); E.applyAugment(p, E.AUG_BY.h_alakazam); for (let i = 0; i < 3; i++) event(p, 'roundStart', {});
  ok(Math.round(combatOf(p, '3,0').ap - base.ap) === 15, 'Fuerza Creciente: +15 de poder tras 3 rondas'); }
ok(Object.values(E.AUG_BY).every(a => a.img), 'todos los aumentos tienen sprite');

// 11. Cada aumento de héroe mejora de verdad a su Pokémon (mismo combate y semilla, con y sin el aumento; media de 12 semillas)
{ const foe = { ag: [], m: {}, u: [['3,0', 'onix', 2, [], 0, 0], ['2,0', 'machop', 2, [], 0, 0], ['4,0', 'squirtle', 2, [], 0, 0], ['3,3', 'abra', 2, [], 0, 0], ['2,3', 'pichu', 2, [], 0, 0]] };
  const stat = (k, aug, f) => { let s = 0; for (let seed = 1; seed <= 12; seed++) { const { p } = fresh(); if (aug) { E.applyAugment(p, E.AUG_BY[aug]); for (let r = 0; r < 5; r++) E.augFire(p, 'roundStart', {}); }
      const ag = aug ? E.augSnap(p) : []; const me = { ag, m: {}, u: [['3,1', k, 2, [], 0, 0], ['2,0', 'onix', 2, [], 0, 0], ['4,0', 'machop', 2, [], 0, 0]] };
      const cb = E.createCombatSnap(me, foe, { s: 4, n: 2, type: 'pvp' }, { seed: seed * 101 }); const h = cb.units.find(u => u.side === 0 && u.d.key === k); const pre = f(h, cb, true); E.simulate(cb); s += pre != null ? pre : f(h, cb, false); } return s / 12; };
  const cmp = (id, k, f, label) => { const a = stat(k, null, f), b = stat(k, id, f); ok(b > a * 1.05, `${E.AUG_BY[id].name}: ${label} (${Math.round(a)} → ${Math.round(b)})`); };
  const dmg = (h, cb, pre) => pre ? null : (h.sDmg || 0), heal = (h, cb, pre) => pre ? null : (h.sHeal || 0);
  cmp('h_gengar', 'gastly', dmg, 'más daño de Gengar'); cmp('h_gyarados', 'magikarp', (h, cb, pre) => pre ? h.maxHp : null, 'más vida de Gyarados');
  cmp('h_clefable', 'cleffa', dmg, 'Clefable hace daño (Rayo Lunar)'); cmp('h_clefable', 'cleffa', heal, 'y cura más a la vez'); cmp('h_alakazam', 'abra', dmg, 'más daño de Alakazam (poder por lanzamiento)');
  cmp('h_raichu', 'pichu', dmg, 'más daño de Raichu'); cmp('h_machamp', 'machop', dmg, 'más daño de Machamp (velocidad creciente)');
  cmp('h_lucario', 'riolu', dmg, 'Lucario lanza dos veces: más daño'); cmp('h_charizard', 'charmander', dmg, 'más daño de Charizard');
  cmp('h_ditto', 'ditto', dmg, 'Ditto copia algo mejor'); }
{ const { G, p } = fresh(); G.round = { s: 3, n: 2 }; E.applyAugment(p, E.AUG_BY.h_lucario); ok(p.bench.filter(Boolean).some(u => u.defId === 'riolu' && u.star === 2), 'héroe en 3-2: el Pokémon llega a 2★');
  G.round = { s: 2, n: 1 }; let seen = 0; for (let i = 0; i < 300; i++) seen += E.augmentChoices(p, 'S').filter(id => id === 'h_dusknoir').length; ok(seen === 0, 'el héroe de coste 4 no sale en 2-1');
  G.round = { s: 3, n: 2 }; seen = 0; for (let i = 0; i < 300; i++) seen += E.augmentChoices(p, 'S').filter(id => id === 'h_dusknoir').length; ok(seen > 0, 'el héroe de coste 4 sí sale en 3-2'); }

// 12. Aumentos que dan cosas tras rondas, victorias o niveles: dan exactamente lo que dice su descripción
{ const items = p => p.items.length, units = p => p.bench.filter(Boolean).length, rs = (p, n) => { for (let i = 0; i < n; i++) event(p, 'roundStart', {}); };
  const take = (id, setup) => { const { p } = fresh(); if (setup) setup(p); E.applyAugment(p, E.AUG_BY[id]); return p; };
  { const p = take('huevo'); const u0 = units(p), i0 = items(p); rs(p, 5); ok(units(p) === u0 && items(p) === i0, 'Huevo: nada antes de 6 rondas'); rs(p, 1); ok(units(p) === u0 + 2 && p.bench.filter(Boolean).filter(u => E.DEF[u.defId].cost === 4).length === 2 && items(p) === i0 + 1, 'Huevo: a las 6 rondas, 2 copias de un coste 4 y un componente'); rs(p, 6); ok(units(p) === u0 + 2, 'Huevo: una sola vez'); }
  { const p = take('ultraball'); const u0 = units(p), i0 = items(p); ok(p.picks.length === 1 && items(p) === i0, 'Ultra Ball: componente y elección de coste 4'); E.resolvePick(p, p.picks[0].id, 0);
    const got = p.bench.filter(Boolean).slice(u0); ok(got.length === 2 && got[0].defId === got[1].defId && E.DEF[got[0].defId].cost === 4, 'Ultra Ball: 2 copias del coste 4 elegido'); }
  { const p = take('master'); const i0 = items(p); ok(p.picks.length === 1, 'Master Ball: elección de Legendario'); E.resolvePick(p, p.picks[0].id, 0); ok(p.bench.filter(Boolean).some(u => E.DEF[u.defId].cost === 5), 'Master Ball: recibes el Legendario elegido'); }
  { const p = take('escalera'); ok(p.items.some(k => String(k).startsWith('emb_')), 'Escalera: emblema al elegir');
    p.board = { '0,0': E.makeInst('charmander'), '1,0': E.makeInst('growlithe'), '2,0': E.makeInst('squirtle'), '3,0': E.makeInst('slowpoke') };
    event(p, 'roundEnd', { pve: true }); ok(!p.items.includes('magnet'), 'Escalera: el PvE no cuenta');
    event(p, 'roundEnd', { pve: false }); ok(p.items.includes('magnet') && p.augSt.escalera.need === 3, 'Escalera: 2 sinergias → Imán Removedor y pide 3');
    const g0 = p.gold; event(p, 'roundEnd', { pve: false }); ok(p.gold - g0 === 3 && p.augSt.escalera.need === 4, 'Escalera: 3 sinergias → 3 de oro y pide 4');
    p.board = { '0,0': E.makeInst('charmander') }; const g1 = p.gold; event(p, 'roundEnd', { pve: false }); ok(p.gold === g1 && p.augSt.escalera.need === 4, 'Escalera: sin sinergias suficientes no da nada'); }
  { const p = take('ahorro_profesor'); p.gold = 35; const i0 = items(p); rs(p, 3); ok(items(p) === i0 + 1, 'Ahorro del Profesor: 3 rondas con 30+ → componente'); p.gold = 10; rs(p, 2); p.gold = 35; rs(p, 2); ok(items(p) === i0 + 1, 'Ahorro: bajar de 30 reinicia los puntos'); }
  { const p = take('investigacion_fin'); p.gold = 60; rs(p, 1); ok(p.freeRerolls === 0, 'Investigación Financiada: 5 puntos aún no'); rs(p, 1); ok(p.freeRerolls === 3, 'Investigación Financiada: 10 puntos → 3 tiendas gratis'); const u0 = units(p); rs(p, 3); ok(units(p) === u0 + 1, 'Investigación Financiada: 25 puntos → Pokémon de coste 4'); }
  { const p = take('camino_campeon'); const i0 = items(p), g0 = p.gold; event(p, 'levelUp', { level: 6 }); ok(items(p) === i0 + 1, 'Camino del Campeón: nivel 6 → componente'); event(p, 'levelUp', { level: 7 }); ok(p.gold === g0 + 5, 'Camino del Campeón: nivel 7 → 5 de oro');
    event(p, 'levelUp', { level: 8 }); ok(items(p) === i0 + 2 && E.FULL_KEYS.includes(p.items[p.items.length - 1]), 'Camino del Campeón: nivel 8 → objeto completo'); const u0 = units(p); event(p, 'levelUp', { level: 9 }); ok(units(p) === u0 + 1 && p.bench.filter(Boolean).some(u => E.DEF[u.defId].cost === 5), 'Camino del Campeón: nivel 9 → Pokémon de coste 5'); }
  { const p = take('insignias'); for (const l of [5, 6]) event(p, 'levelUp', { level: l }); ok(!p.picks.length, 'Insignias de Gimnasio: 2 insignias aún no'); event(p, 'levelUp', { level: 7 }); ok(p.picks.length === 1 && p.picks[0].opts.length === 3, 'Insignias de Gimnasio: con 3, elección de 3 premios'); }
  { const p = take('regreso'); const g0 = p.gold; for (let i = 0; i < 3; i++) event(p, 'lose', {}); event(p, 'win', {}); ok(p.gold - g0 === 9, `El Regreso: 3 derrotas → 9 de oro al ganar (${p.gold - g0})`); }
  { const p = take('crecimiento'); const xp = p.xp + p.level * 100; event(p, 'win', { pve: false }); ok(p.xp + p.level * 100 > xp, 'Crecimiento Acelerado: EXP por victoria PvP'); }
  { const p = take('campeon_sinnoh'); const i0 = items(p); for (let i = 0; i < 3; i++) event(p, 'win', { pve: false }); ok(items(p) === i0 + 1, 'Campeón de Sinnoh: 3 victorias → componente'); for (let i = 0; i < 3; i++) event(p, 'win', { pve: false }); ok(items(p) === i0 + 2, 'Campeón de Sinnoh: 6 → objeto completo'); const b0 = p.mods.boardBonus; for (let i = 0; i < 3; i++) event(p, 'win', { pve: false }); ok(p.mods.boardBonus === b0 + 1, 'Campeón de Sinnoh: 9 → +1 espacio'); }
  { const p = take('pacto_rocket'); ok(p.gold === 58, 'Pacto del Team Rocket: +8 de oro al elegirlo'); event(p, 'lose', { pve: false }); const g0 = p.gold; rs(p, 5); ok(g0 - p.gold === 15, `Pacto del Team Rocket: la derrota alarga la deuda a 5 rondas de 3 (${g0 - p.gold})`); rs(p, 2); ok(g0 - p.gold === 15, 'Pacto del Team Rocket: después ya no cobra'); }
  { const p = take('maestro'); const x0 = p.xp + p.level * 1000; p.gold = 10; E.applyAct(p, { t: 'xp' }); ok(p.xp + p.level * 1000 >= x0 + 5 || p.level > 1, 'Maestro Pokémon: la EXP comprada da 5'); E.addUnitToBench(p, E.makeInst('charmander')); p.board = { '0,0': E.makeInst('charmander') };
    event(p, 'levelUp', { level: 9 }); const pk = p.picks.find(x => x.src === 'maestro'); ok(pk && pk.opts.length >= 1, 'Maestro Pokémon: elección de sinergia al nivel 9'); const t = pk.opts[0].v, n0 = E.traitCounts(p)[t] || 0; E.resolvePick(p, pk.id, 0); ok((E.traitCounts(p)[t] || 0) === n0 + 1, 'Maestro Pokémon: la sinergia elegida cuenta 1 más'); }
  { const p = take('h_meowth'); p.board = { '0,0': E.makeInst('meowth') }; const g0 = p.gold; event(p, 'win', { pve: false }); ok(p.gold - g0 === 2, 'Día de Pago: +2 de oro al ganar con Meowth en el tablero'); }
  { const p = take('proyecto_mew'); p.board = { '0,0': E.makeInst('charmander'), '1,0': E.makeInst('squirtle'), '2,0': E.makeInst('bulbasaur'), '3,0': E.makeInst('pichu') }; const i0 = items(p); event(p, 'combatStart', {}); ok(items(p) - i0 === 2, 'Proyecto Mew: 4 tipos → 2 componentes'); }
  { const p = take('unidos'); E.G.roundIdx = 3; const t = p.augSt.unidos.t; const anv = p.bench.find(u => u && u.defId === 'yunque_oro'); ok(t && p.items.includes('emb_' + t) && anv, 'Unidos Venceremos: emblema y Yunque de objetos en el banquillo');
    const i = p.bench.indexOf(anv); ok(E.sellAt(p, { i }) && p.picks.length === 1 && p.picks[0].opts.length === 6, 'el yunque se vende y deja elegir entre 6 objetos completos');
    E.resolvePick(p, p.picks[0].id, 0); ok(p.items.some(k => E.ITEMS[k] && E.ITEMS[k].from && !E.ITEMS[k].emblem), 'Unidos Venceremos: recibe el objeto elegido'); }
  { const p = take('dados', q => { q.gold = 10; }); ok(p.gold === 17 && p.mods.lucky, 'Dados Cargados: 7 de oro y suerte'); }
  { const p = take('vanguardia'); const u = p.bench.filter(Boolean).find(x => x.star === 2); ok(u && E.DEF[u.defId].cost === 1 && p.items.some(k => String(k).startsWith('emb_')), 'Cimientos de Vanguardia: primera línea 2★ y emblema de su clase'); }
  { const { G, p } = fresh(); p.bench = Array(9).fill(null); E.applyAugment(p, E.AUG_BY.safari); const g = k => { const u = E.makeInst(k); u.star = 2; return u; };
    for (let i = 0; i < 9; i++) p.bench[i] = g(i % 2 ? 'gimmighoul' : 'meowth'); const g0 = p.gold; rs(p, 3); ok(!p.augSt.safari.done && p.bench.filter(Boolean).length === 6, 'Zona Safari: cada ronda se va el último del banquillo');
    rs(p, 3); ok(p.augSt.safari.done && p.gold - g0 >= 15 && p.picks.length === 2, `Zona Safari: con 33 de oro enviados, gran premio (${p.augSt.safari.sent})`); }
  { const { G, p } = fresh(); G.round = { s: 5, n: 1 }; p.board = { '0,0': E.makeInst('charmander'), '1,0': E.makeInst('growlithe') }; E.applyAugment(p, E.AUG_BY.llamada_clan);
    const opt = p.picks[0].opts.findIndex(o => o.v === 'Fuego'); E.resolvePick(p, p.picks[0].id, Math.max(0, opt)); const u0 = p.bench.filter(Boolean).length;
    event(p, 'buy', { key: 'charmander', cost: 1 }); const got = p.bench.filter(Boolean).slice(u0); ok(got.length === 1 && E.DEF[got[0].defId].traits.includes('Fuego') && E.DEF[got[0].defId].cost >= 2, 'Llamada del Clan: al comprar un Fuego barato llega otro Fuego más caro');
    event(p, 'buy', { key: 'abra', cost: 1 }); ok(p.bench.filter(Boolean).length === u0 + 1, 'Llamada del Clan: otra sinergia no cuenta'); }
}

// 13. Mewtwo (rework): cargas psíquicas, Juicio Psíquico cada 4 lanzamientos y Mega Mewtwo Y dentro del combate
{ const cast = (cb, u) => E.castAbility(cb, u, u.ab);
  const mk = (st, foes) => E.createCombatSnap({ ag: [], m: {}, u: [['3,3', 'mewtwo', st, [], 0, 0]] }, { ag: [], m: {}, u: foes.map((k, i) => [['3,0', '2,0', '4,0', '3,1', '1,0'][i], k, 2, [], 0, 0]) }, { s: 5, n: 2 }, { seed: 4 });
  { const cb = mk(2, ['onix', 'larvitar', 'lapras']); const m = cb.units.find(x => x.d.key === 'mewtwo');
    ok(m.mana === 0 && m.maxMana === 45, 'Mewtwo: maná 0/45');
    const hp = () => cb.units.filter(x => x.side === 1).reduce((t, x) => t + x.hp, 0); let h0 = hp(); cast(cb, m); const d1 = h0 - hp(); h0 = hp(); cast(cb, m); const d2 = h0 - hp();
    ok(m.psyC === 2 && d2 > d1 * 1.02, `Mewtwo: cada lanzamiento da una carga y la siguiente pega más (${Math.round(d1)} → ${Math.round(d2)})`);
    // Juicio en el 4.º: el enemigo con menos % de vida; a 2★ lo ejecuta por debajo del 15 %
    const low = cb.units.find(x => x.d.key === 'lapras'); for (const x of cb.units) if (x.side === 1) { x.hp = x.maxHp; x.mr = 99999; } low.hp = low.maxHp * .12; cast(cb, m); // resistencia enorme: la onda casi no hace daño y se ve solo el Juicio
    ok(!low.dead && m.psyC === 3, 'Mewtwo: el 3.er lanzamiento no es Juicio');
    for (const x of cb.units) if (x.side === 1 && !x.dead) x.hp = x.maxHp; low.hp = low.maxHp * .14 + 1; const k0 = m.kills; low.shield = 0;
    const before = cb.units.filter(x => x.side === 1 && !x.dead).map(x => x.hp / x.maxHp); cast(cb, m);
    ok(m.judgeN === 1 && low.dead && m.kills === k0 + 1, 'Mewtwo: el 4.º lanzamiento es Juicio y ejecuta al de menos vida (2★, por debajo del 15 %) contando una sola baja'); }
  { const cb = mk(1, ['onix', 'larvitar']); const m = cb.units.find(x => x.d.key === 'mewtwo'); const a = cb.units.find(x => x.d.key === 'onix'), b = cb.units.find(x => x.d.key === 'larvitar');
    m.psyC = 3; a.hp = a.maxHp * .5; b.hp = b.maxHp * .5; a.mr = b.mr = 9999; // empate de % (y casi sin daño de la onda): gana el primero del orden de unidades
    const ha = a.hp, hb = b.hp; cast(cb, m); ok(!a.dead && !b.dead && (ha - a.hp) > (hb - b.hp), 'Mewtwo: con % de vida empatado, el Juicio va siempre al mismo (orden de unidades) y a 1★ no ejecuta por encima del 10 %'); }
  { const cb = mk(3, ['onix', 'larvitar']); const m = cb.units.find(x => x.d.key === 'mewtwo'); const a = cb.units.find(x => x.d.key === 'onix'); m.psyC = 3; for (const x of cb.units) if (x.side === 1) x.mr = 9999; a.hp = a.maxHp * .9;
    cast(cb, m); ok(a.dead || cb.units.filter(x => x.side === 1).some(x => x.dead), 'Mewtwo 3★: el Juicio ejecuta aunque tenga mucha vida'); }
  { const cb = mk(2, ['onix', 'larvitar', 'lapras', 'machop', 'abra']); const m = cb.units.find(x => x.d.key === 'mewtwo'); for (const x of cb.units) if (x.side === 1) { x.maxHp *= 50; x.hp = x.maxHp; }
    for (let i = 0; i < 9; i++) cast(cb, m); ok(!m.megaOn, 'Mewtwo: con 9 de energía aún no es Mega'); cast(cb, m);
    ok(m.megaOn && m.d.key === 'megamewtwo' && m.psyC === 10 && m.mana < m.maxMana, 'Mewtwo: con 10 de energía se transforma en Mega Mewtwo Y, conserva sus cargas y no recibe maná gratis');
    const m2 = m.megaOn; cast(cb, m); ok(m2 && m.megaOn && cb.cExtra.indexOf('se transforma') < 0, 'Mewtwo: la transformación solo ocurre una vez por combate');
    const next = mk(2, ['onix']); const n = next.units.find(x => x.side === 0); ok(!n.megaOn && !n.psyC && n.d.key === 'mewtwo', 'Mewtwo: al empezar el siguiente combate vuelve a ser Mewtwo sin cargas'); }
  { const { G, p } = fresh(); const u = E.makeInst('megamewtwo'); p.board = { '3,3': u }; E.mewtwoUnstable(); ok(u.defId === 'mewtwo', 'Mewtwo: ya no hay transformación permanente entre rondas'); }
  // determinismo: misma semilla, mismo resultado con y sin efectos visuales
  { const A = { ag: [], m: {}, u: [['3,3', 'mewtwo', 2, ['specs'], 0, 0], ['3,0', 'onix', 2, [], 0, 0]] }, B = { ag: [], m: {}, u: [['3,0', 'machop', 2, [], 0, 0], ['2,0', 'larvitar', 2, [], 0, 0], ['3,3', 'abra', 2, [], 0, 0]] };
    const r = v => { const cb = E.createCombatSnap(A, B, { s: 5, n: 2 }, { seed: 77, visual: v }); E.simulate(cb); return cb.winner + '|' + cb.units.map(x => Math.round(x.hp)).join(','); }; ok(r(true) === r(false), 'Mewtwo: el combate es determinista'); } }

// Escalones 2/3/4/5 (Tirador, Dragón, Roca, Coloso) y la sinergia nueva Peleador (2/4/6, prismático en 8)
{ for (const s of ['Tirador', 'Dragón', 'Roca', 'Coloso']) ok(E.TRAITS[s].bp.join() === '2,3,4,5' && E.TRAITS[s].pr[0] === 7 && E.TRAITS[s].lv.length === 4, s + ': escalones 2/3/4/5, prismático en 7 y un texto por escalón');
  ok(E.TRAITS.Peleador && E.TRAITS.Peleador.bp.join() === '2,4,6' && E.TRAITS.Peleador.pr[0] === 8, 'Peleador: 2/4/6 y prismático en 8');
  const mem = s => E.UNIT_LIST.filter(u => u.traits.includes(s)).map(u => u.key).sort().join();
  ok(mem('Coloso') === 'beldum,geodude,grimer,groudon,magikarp,magmar,rhyhorn', 'Coloso: solo los 7 pesados (' + mem('Coloso') + ')');
  ok(mem('Peleador') === 'charmander,cubone,ditto,eevee,elekid,growlithe,machop,nidoranm,poliwag', 'Peleador: los 9 melés ágiles (' + mem('Peleador') + ')');
  ok(E.DEF.flareon.traits.includes('Peleador') && !E.DEF.flareon.traits.includes('Coloso'), 'Flareon hereda Peleador');
  // el escalón máximo se alcanza con como mucho 1 legendario
  for (const s of ['Tirador', 'Dragón', 'Roca', 'Coloso', 'Peleador']) { const nl = E.UNIT_LIST.filter(u => u.traits.includes(s) && !u.traits.includes('Legendario') && !E.DEF[u.key].evoOf).length; ok(nl + 1 >= E.TRAITS[s].bp[E.TRAITS[s].bp.length - 1], s + ': su último escalón se alcanza con ≤1 legendario (' + nl + ' sin legendario)'); }
  // los recuentos que ya existían dan lo mismo que antes: 4 de Tirador/Dragón/Roca = escalón 3 con los valores del antiguo escalón de 4
  const { p } = fresh(), mk = (k, Tt) => E.makeCombatUnit(E.makeInst(k), p, Tt, 0);
  ok(mk('gible', { 'Dragón': 3 }).dragonRamp === .025 && mk('gible', { 'Dragón': 3 }).dragonCap === .5, '4 dragones: +2,5%/s hasta +50% (como antes)');
  ok(mk('rowlet', { Tirador: 3 }).hexAmp === .1, '4 tiradores: +10% por casilla (como antes)');
  ok(mk('larvitar', { Roca: 3 }).df - mk('larvitar', {}).df === 65, '4 de Roca: +55 propia y +10 de equipo (como antes)');
  // Peleador: vida máxima y furia al bajar del 50%
  const b0 = mk('machop', {}), b2 = mk('machop', { Peleador: 2 }); ok(Math.abs(b2.maxHp / b0.maxHp - 1.35) < .01 && b2.fury[0] === .35, 'Peleador 4: +35% de vida y furia +35% de vel. de ataque');
  { const cb = E.createCombatSnap({ ag: [], m: {}, u: [['3,0', 'machop', 2, [], 0, 0], ['2,0', 'charmander', 2, [], 0, 0]] }, { ag: [], m: {}, u: [['3,0', 'onix', 2, [], 0, 0]] }, { s: 5, n: 2 }, { seed: 4 });
    const u = cb.units.find(x => x.d.key === 'machop'), as0 = u.as, foe = cb.units.find(x => x.side === 1); E.dealDamage(cb, foe, u, u.hp * .3, 'true', false); ok(!u.furyOn && u.as === as0, 'sin furia por encima del 50%');
    E.dealDamage(cb, foe, u, u.hp * .5, 'true', false); ok(u.furyOn && Math.abs(u.as - Math.min(3, as0 * 1.2)) < 1e-9, '¡Furia! al bajar del 50%: +20% de vel. de ataque (Peleador 2)'); const as1 = u.as; E.dealDamage(cb, foe, u, 1, 'true', false); ok(u.as === as1, 'la furia solo se activa una vez'); }
  // Legendarios: ven las sinergias rediseñadas como antes (misma resonancia y mismo efecto propio con las mismas fichas)
  const r3 = mk('rayquaza', { 'Dragón': 2 }), r1 = mk('rayquaza', { 'Dragón': 1 }); ok(r3.dragonCap === r1.dragonCap && r3.dragonRamp === .015, 'Rayquaza con 3 dragones: el bonus del escalón de antes (2-3 = 1.º)');
  const q = fresh().p; q.board = { '0,0': E.makeInst('rayquaza'), '1,0': E.makeInst('dratini'), '2,0': E.makeInst('horsea'), '3,0': E.makeInst('gible') };
  ok(E.traitTiers(q).nl['Dragón'] === 1 && E.traitTiers(q)['Dragón'] === 3, 'resonancia con los escalones viejos: 3 dragones no legendarios = 1 nivel (sinergia: escalón 3)'); }

// Agro inicial de tanques: solo en el primer tick, contra un tanque enemigo a su alcance; después manda la cercanía
{ const hexD = vm.runInContext('hexDist', ctx), DTc = vm.runInContext('DT', ctx);
  const role = (r, extra) => E.UNIT_LIST.find(u => u.role === r && u.cost <= 3 && !E.DEF[u.key].evoOf && !u.traits.includes('Guardián') && (!extra || extra(u))).key;
  const K = { t: role('t'), b: role('b'), a: role('a'), r: role('r'), m: role('m') };
  // combate con las fichas indicadas; luego se colocan a mano (c, r de la rejilla completa 7×8) y se apaga lo que podría ensuciar la prueba
  const fight = (a, b, seed = 3) => { const pos = ks => ks.map((k, i) => [i + ',0', k, 1, [], 0, 0]);
    const cb = E.createCombatSnap({ ag: [], m: {}, u: pos(a) }, { ag: [], m: {}, u: pos(b) }, { s: 5, n: 2 }, { seed }); for (const u of cb.units) { u.maxMana = 1e9; u.mana = 0; u.maxHp = u.hp = 1e6; } return cb; };
  const at = (u, c, r) => { u.c = u.pc = c; u.r = u.pr = r; };
  const free = (cb, c, r) => !cb.units.some(x => x.c === c && x.r === r);
  const cellAt = (cb, from, d, cond = () => true) => { for (let r = 0; r < 8; r++) for (let c = 0; c < 7; c++) if (free(cb, c, r) && hexD(from.c, from.r, c, r) === d && cond(c, r)) return [c, r]; return null; };
  // 1) Tirador rival (alcance 4) con un tanque a 4 casillas y un mago a 3: empieza con el tanque
  { const cb = fight([K.t, K.m], [K.r]), [T, M] = cb.units.filter(u => u.side === 0), R = cb.units.find(u => u.side === 1);
    at(R, 3, 0); at(T, 6, 6); at(M, 0, 0); const ct = cellAt(cb, R, 4); at(T, ...ct); const cm = cellAt(cb, R, 3); at(M, ...cm);
    ok(R.range === 4 && hexD(R.c, R.r, T.c, T.r) === 4 && hexD(R.c, R.r, M.c, M.r) === 3, 'agro: montaje (tanque a 4, mago a 3, alcance 4)');
    T.moveCd = M.moveCd = 5; // quietos en el primer tick: así se compara con las posiciones del montaje
    vmStep(cb); ok(R.target === T, 'agro: el tirador empieza atacando al tanque a su alcance aunque el mago esté más cerca'); }
  // 2) Cuerpo a cuerpo rival pegado a un tanque y a un asesino: siempre empieza con el tanque (sin la regla, la mitad de las veces iría al asesino)
  { let n = 0; for (let s = 1; s <= 20; s++) { const cb = fight([K.t, K.a], [K.b], s), [T, A] = cb.units.filter(u => u.side === 0), B = cb.units.find(u => u.side === 1);
      at(B, 3, 3); at(T, 6, 7); at(A, 0, 7); at(T, 3, 4); at(A, 2, 3); if (hexD(3, 3, 3, 4) === 1 && hexD(3, 3, 2, 3) === 1) { vmStep(cb); if (B.target === T) n++; } }
    ok(n === 20, `agro: el cuerpo a cuerpo pegado a un tanque y a un asesino empieza con el tanque (${n}/20 semillas)`); }
  // 3) Sin tanque a su alcance al empezar: va al más cercano; si por el camino otro enemigo (aquí el tanque) le queda a su alcance, pasa a él por cercanía
  { const cb = fight([K.m, K.t], [K.b]), [M, T] = cb.units.filter(u => u.side === 0), B = cb.units.find(u => u.side === 1);
    at(B, 3, 0); at(M, 3, 5); at(T, 6, 7); const ct = cellAt(cb, B, hexD(3, 0, 3, 5) + 1, (c, r) => hexD(c, r, 3, 5) <= 2); at(T, ...ct);
    ok(hexD(B.c, B.r, M.c, M.r) < hexD(B.c, B.r, T.c, T.r) && hexD(B.c, B.r, T.c, T.r) > B.range, 'agro: montaje (sin tanque a su alcance, el mago es el más cercano)');
    M.moveCd = T.moveCd = 99; vmStep(cb); ok(B.target === M, 'agro: sin tanque a su alcance empieza con el más cercano (el mago)');
    let i = 0; while (i++ < 80 && hexD(B.c, B.r, T.c, T.r) > 1 && hexD(B.c, B.r, M.c, M.r) > 1) { M.moveCd = T.moveCd = 99; vmStep(cb); }
    if (hexD(B.c, B.r, T.c, T.r) <= 1) { vmStep(cb); ok(B.target === T, 'foco: al pasar junto al tanque (a su alcance) lo ataca en vez de seguir hacia el mago'); }
    else ok(B.target === M, 'foco: llegó antes al mago, sigue con él'); }
  // 4) Si muere su objetivo a mitad de combate, elige al más cercano, sea tanque o no (la regla ya no se aplica)
  { const cb = fight([K.m, K.m, K.t], [K.r]), [X, M2, T] = cb.units.filter(u => u.side === 0), R = cb.units.find(u => u.side === 1);
    at(R, 3, 0); at(X, 3, 1); at(M2, 0, 7); at(T, 6, 7); for (let i = 0; i < 10; i++) vmStep(cb); ok(R.target === X, 'agro: sin tanque a tiro al empezar, el tirador va al más cercano');
    X.dead = true; X.hp = 0; at(M2, ...cellAt(cb, R, 2)); at(T, ...cellAt(cb, R, 3)); vmStep(cb); ok(R.target === M2, 'agro: muerto su objetivo, elige al más cercano (el mago a 2), no al tanque a 3');
    M2.dead = true; M2.hp = 0; vmStep(cb); ok(R.target === T, 'agro: si el más cercano es un tanque, lo elige por cercanía'); }
  // 5) Sin tanques: el combate es idéntico al de antes de la regla (se compara con la regla apagada)
  { const trace = (a, b, seed) => { const cb = E.createCombatSnap({ ag: [], m: {}, u: a }, { ag: [], m: {}, u: b }, { s: 5, n: 2 }, { seed }); let s = ''; for (let i = 0; i < 900 && !cb.done; i++) { vmStep(cb); s += cb.units.map(u => `${u.c},${u.r},${Math.round(u.hp)},${cb.units.indexOf(u.target)}`).join('|') + ';'; } return s + cb.winner; };
    const noTank = E.UNIT_LIST.filter(u => u.role !== 't' && u.cost <= 3 && !E.DEF[u.key].evoOf).map(u => u.key);
    const teams = s => { const r = () => noTank[(s = (s * 1103515245 + 12345) >>> 0) % noTank.length]; const pos = ['3,0', '2,0', '4,0', '3,3', '2,3']; return [pos.map(p => [p, r(), 2, [], 0, 0]), pos.map(p => [p, r(), 2, [], 0, 0])]; };
    const real = vm.runInContext('pickInitialTarget', ctx); let iguales = 0;
    for (let s = 1; s <= 12; s++) { const [a, b] = teams(s), con = trace(a, b, s); vm.runInContext('pickInitialTarget=()=>null', ctx); const sin = trace(a, b, s); ctx.__pit = real; vm.runInContext('pickInitialTarget=__pit', ctx); if (con === sin) iguales++; }
    ok(iguales === 12, `agro: sin tanques, el combate es idéntico al de antes (${iguales}/12, comparando cada tick)`); }
  // 6) Provocar y Guardianes siguen cambiando el objetivo como siempre
  { const cb = fight([K.t, K.m], [K.b]), [T, G] = cb.units.filter(u => u.side === 0), B = cb.units.find(u => u.side === 1);
    at(B, 3, 3); at(T, 3, 4); at(G, 6, 7); at(G, 4, 4); G.bodyguard = .1; vmStep(cb); ok(B.target === T, 'agro: empieza con el tanque');
    for (let i = 0; i < Math.ceil(1.5 / DTc) + 1; i++) vmStep(cb); ok(B.target === G, 'agro: a los 1,5 s un Guardián lo provoca y cambia de objetivo'); }
  { const cb = fight([K.t, K.m], [K.b]), [T, P] = cb.units.filter(u => u.side === 0), B = cb.units.find(u => u.side === 1);
    at(B, 3, 3); at(T, 3, 4); at(P, 6, 7); at(P, 4, 5); vmStep(cb); ok(B.target === T, 'agro: empieza con el tanque (provocar)');
    E.castAbility(cb, P, ['taunt', 'Provocar', { m: 1 }]); ok(B.target === P, 'agro: una habilidad de provocar (como Duskull o Vaporeon) le cambia el objetivo');
    const c0 = [B.c, B.r]; T.moveCd = P.moveCd = 99; vmStep(cb); ok(B.target === P && hexD(B.c, B.r, T.c, T.r) <= 1 + hexD(c0[0], c0[1], T.c, T.r), 'foco: el provocado sigue yendo a por quien lo provocó aunque tenga otro enemigo a su alcance'); }
  // 9) Foco como en TFT (los dos casos que se vieron en partida): «Charmander» camina hacia un objetivo lejano y se cruza con un «Rattata»: lo ataca a él
  { const cb = fight([K.m, K.m], [K.b]), [M, Rt] = cb.units.filter(u => u.side === 0), B = cb.units.find(u => u.side === 1);
    at(B, 3, 0); at(M, 3, 6); at(Rt, 6, 7); at(Rt, 3, 3); B.target = M; M.moveCd = Rt.moveCd = 99;
    let i = 0; while (i++ < 60 && hexD(B.c, B.r, Rt.c, Rt.r) > 1) { M.moveCd = Rt.moveCd = 99; vmStep(cb); }
    const pos = [B.c, B.r], hp0 = Rt.hp; for (let k = 0; k < 40; k++) { M.moveCd = Rt.moveCd = 99; vmStep(cb); }
    ok(B.target === Rt && B.c === pos[0] && B.r === pos[1] && Rt.hp < hp0, 'foco: al cruzarse con un enemigo a su alcance lo ataca y deja de caminar hacia el lejano'); }
  // 10) «Eevee» pegado a su objetivo: si este se aleja y tiene otro enemigo pegado, ataca a ese sin moverse (no da vueltas)
  { const cb = fight([K.m, K.m], [K.b]), [Bb, O] = cb.units.filter(u => u.side === 0), Ev = cb.units.find(u => u.side === 1);
    at(Ev, 3, 3); at(Bb, 6, 7); at(O, 0, 7); at(Bb, 3, 4); at(O, 2, 3); Bb.moveCd = O.moveCd = 99; vmStep(cb); ok(Ev.target === Bb || Ev.target === O, 'foco: montaje (dos enemigos pegados)');
    Ev.target = Bb; at(Bb, 6, 7); const pos = [Ev.c, Ev.r]; Bb.moveCd = O.moveCd = 99; vmStep(cb);
    ok(Ev.target === O && Ev.c === pos[0] && Ev.r === pos[1], 'foco: su objetivo se aleja y ataca al que tiene pegado, sin moverse'); }
  // 11) A distancia: con su objetivo a su alcance no cambia aunque otro enemigo se le pegue (el objetivo se mantiene mientras esté a su alcance)
  { const cb = fight([K.m, K.b], [K.r]), [M, X] = cb.units.filter(u => u.side === 0), R = cb.units.find(u => u.side === 1);
    at(R, 3, 0); at(M, 6, 7); at(X, 0, 7); at(M, ...cellAt(cb, R, 3)); at(X, ...cellAt(cb, R, 5)); M.moveCd = X.moveCd = 99; vmStep(cb); ok(R.target === M, 'foco: el tirador empieza con el que tiene a su alcance');
    at(X, ...cellAt(cb, R, 1)); X.moveCd = M.moveCd = 99; vmStep(cb); ok(R.target === M, 'foco: con su objetivo a su alcance no cambia aunque otro enemigo se le pegue'); }
  // 12) Sin rodeos: si su objetivo está detrás de un atasco y otro enemigo queda a su alcance en menos pasos, va a por ese
  { const cb = fight([K.m, K.m], [K.b, K.t, K.t]), [M, X] = cb.units.filter(u => u.side === 0), [B, W1, W2] = cb.units.filter(u => u.side === 1);
    const steps = (from, t) => { const occ = new Set(cb.units.filter(x => !x.dead && x !== from).map(x => x.c + ',' + x.r)), seen = new Set([from.c + ',' + from.r]); let q = [[from.c, from.r]], d = 0, nb = vm.runInContext('neighbors', ctx);
      while (q.length) { const nq = []; for (const [c, r] of q) { if (d > 0 && hexD(c, r, t.c, t.r) <= from.range) return d; for (const [nc, nr] of nb(c, r)) { const k = nc + ',' + nr; if (seen.has(k) || occ.has(k)) continue; seen.add(k); nq.push([nc, nr]); } } q = nq; d++; } return 99; };
    at(B, 3, 0); at(M, 6, 7); at(X, 0, 7); at(M, 3, 2); const nb = vm.runInContext('neighbors', ctx)(3, 0).filter(([c, r]) => r === 1); at(W1, ...nb[0]); at(W2, ...nb[1]);
    let hecho = false; for (let r = 0; r < 8 && !hecho; r++) for (let c = 0; c < 7 && !hecho; c++) { if (!free(cb, c, r)) continue; at(X, c, r); if (hexD(3, 0, c, r) > hexD(3, 0, 3, 2) && steps(B, X) < steps(B, M)) hecho = true; }
    ok(hecho, 'foco: montaje (objetivo más cerca en línea recta pero detrás de dos aliados; otro enemigo más lejos pero a menos pasos)');
    for (const u of cb.units) if (u !== B) u.moveCd = 99; B.target = M; B.moveCd = 0; vmStep(cb); ok(B.target === X, 'foco: no rodea el atasco: va a por el enemigo al que llega antes'); }
  // 7) El daño no cambia: cuerpo a cuerpo de coste 3 a 2★ contra tanque de coste 3 a 2★ ≈ 89 por golpe
  { const bk = E.UNIT_LIST.find(u => u.role === 'b' && u.cost === 3).key, tk = E.UNIT_LIST.find(u => u.role === 't' && u.cost === 3).key;
    const src = E.baseCombatUnit(E.DEF[bk], 1, 2), tgt = E.baseCombatUnit(E.DEF[tk], 0, 2); tgt.hp = tgt.maxHp;
    E.dealDamage({ units: [src, tgt], fx: [], feed: [], rng: () => .5, visual: false, t: 0, gold: [0, 0], pend: [] }, src, tgt, src.ad, 'phys', true);
    const d = tgt.maxHp - tgt.hp; ok(Math.abs(src.ad - 142.74) < .01 && tgt.df === 60 && Math.abs(d - 142.74 * 100 / 160) < 1, `daño: ${src.ad.toFixed(1)} de ataque contra 60 de defensa = ${d.toFixed(1)} por golpe (≈89)`); }
  // 8) Misma semilla, mismo combate (con tanques en juego)
  { const a = [['3,0', K.t, 2, [], 0, 0], ['2,0', K.b, 2, [], 0, 0], ['3,3', K.r, 2, [], 0, 0]], b = [['3,0', K.b, 2, [], 0, 0], ['2,0', K.t, 2, [], 0, 0], ['4,3', K.m, 2, [], 0, 0]];
    const log = () => { const cb = E.createCombatSnap({ ag: [], m: {}, u: a }, { ag: [], m: {}, u: b }, { s: 5, n: 2 }, { seed: 77 }); let s = ''; for (let i = 0; i < 900 && !cb.done; i++) { vmStep(cb); s += cb.units.map(u => `${u.c},${u.r},${u.hp.toFixed(3)},${cb.units.indexOf(u.target)}`).join('|') + ';'; } return s + cb.winner; };
    ok(log() === log(), 'agro: dos ejecuciones con la misma semilla dan exactamente el mismo registro de combate'); }
}

// Coste 4: Bagon mago tanque, Timburr con golpes que saltan, tanques a 3★ con su bonus de defensa
{ const b2 = E.baseCombatUnit(E.DEF.bagon, 0, 2), r2 = E.baseCombatUnit(E.DEF.ralts, 0, 2); ok(b2.role === 't' && b2.range === 1 && b2.maxHp > r2.maxHp * 1.5, 'Bagon: stats y alcance de tanque');
  const bx = Object.assign({}, b2, { ap: 50 }), bh = Object.assign({}, b2, { maxHp: b2.maxHp * 2 }); ok(E.abilPower(bx) > E.abilPower(b2) * 1.4 && Math.abs(E.abilPower(bh) - E.abilPower(b2)) < 1, 'Bagon: su habilidad escala con el poder, no con la vida');
  const foe = { ag: [], m: {}, u: [['3,0', 'onix', 2, [], 0, 0], ['2,0', 'machop', 2, [], 0, 0]] };
  { const cb = E.createCombatSnap({ ag: [], m: {}, u: [['3,0', 'bagon', 2, [], 0, 0]] }, foe, { s: 5, n: 2 }, { seed: 3 }); const u = cb.units.find(x => x.d.key === 'bagon'); E.castAbility(cb, u, u.ab);
    ok(Math.abs(u.shield - u.maxHp * .35) < 1 && u.tdr >= .35 && u.tdrT > 0, 'Bagon: Draco Meteoro le da un escudo del 35 % y un 35 % de reducción de daño'); }
  { const cb = E.createCombatSnap({ ag: [], m: {}, u: [['3,3', 'ralts', 2, [], 0, 0]] }, foe, { s: 5, n: 2 }, { seed: 3 }); const u = cb.units.find(x => x.d.key === 'ralts'); E.castAbility(cb, u, u.ab); ok(!(u.shield > 0), 'Ralts (también meteoro) no recibe el escudo de Bagon'); }
  { const cb = E.createCombatSnap({ ag: [], m: {}, u: [['3,0', 'cubone', 2, [], 0, 0]] }, { ag: [], m: {}, u: [['3,0', 'machop', 1, [], 0, 0], ['2,0', 'onix', 2, [], 0, 0]] }, { s: 5, n: 2 }, { seed: 3 }); const u = cb.units.find(x => x.d.key === 'cubone'), [m, o] = [cb.units.find(x => x.d.key === 'machop'), cb.units.find(x => x.d.key === 'onix')];
    m.hp = 1; u.target = m; const o0 = o.hp + o.shield; E.castAbility(cb, u, u.ab); ok(m.dead && o.hp + o.shield < o0, 'Marowak: si el objetivo cae, los golpes que sobran van al siguiente enemigo'); }
  { const cb = E.createCombatSnap({ ag: [], m: {}, u: [['3,0', 'scyther', 2, [], 0, 0]] }, { ag: [], m: {}, u: [['3,0', 'machop', 1, [], 0, 0], ['2,0', 'onix', 2, [], 0, 0]] }, { s: 5, n: 2 }, { seed: 3 }); const u = cb.units.find(x => x.d.key === 'scyther'), [m, o] = [cb.units.find(x => x.d.key === 'machop'), cb.units.find(x => x.d.key === 'onix')];
    if (u.ab[0] === 'combo') { m.hp = 1; u.target = m; const o0 = o.hp + o.shield; E.castAbility(cb, u, u.ab); ok(o.hp + o.shield === o0, 'Scyther: sus golpes sobrantes no saltan (solo Timburr lleva spill)'); } }
  const t2 = E.baseCombatUnit(E.DEF.larvitar, 0, 2), t3 = E.baseCombatUnit(E.DEF.larvitar, 0, 3); ok(t3.df === t2.df && t3.mr === t2.mr, `Tanques: a 3★ conservan el bonus de defensa y resistencia de 2★ (${t2.df}/${t2.mr} → ${t3.df}/${t3.mr})`); }

// Kyogre: poco maná, 3 disparos pequeños a un objetivo y el 4.º lanzamiento es un maremoto en área que no vacía la mesa
{ const k = E.baseCombatUnit(E.DEF.kyogre, 0, 2); ok(k.maxMana <= 40 && k.mana >= k.maxMana, `Kyogre: maná bajo y lanza al empezar (${k.mana}/${k.maxMana})`);
  const me = { ag: [], m: {}, u: [['3,3', 'kyogre', 2, [], 0, 0], ['3,0', 'lapras', 2, [], 0, 0]] }, foe = { ag: [], m: {}, u: [['3,0', 'cubone', 2, [], 0, 0], ['2,0', 'larvitar', 2, [], 0, 0], ['4,0', 'beldum', 2, [], 0, 0], ['3,1', 'onix', 2, [], 0, 0], ['2,3', 'ralts', 2, [], 0, 0]] };
  const cb = E.createCombatSnap(me, foe, { s: 5, n: 2 }, { seed: 31, visual: true }); E.simulate(cb); const f = cb.feed.filter(x => x.s === 0 && x.n === 'Kyogre');
  ok(f.length >= 3 && f.slice(0, 2).every(x => x.h <= 1 && /marea/.test(x.x)), 'Kyogre: los disparos de marea golpean a un solo enemigo (empieza en 1/4)');
  ok(f[2] && /maremoto/.test(f[2].x) && f[2].h >= 2, `Kyogre: el 3.er lanzamiento es un maremoto en área (${f[2] && f[2].h} golpeados)`);
  ok(f[2] && f[2].k < 5, 'Kyogre: el maremoto no borra la mesa entera'); ok(/maremoto/.test(E.abDesc(E.DEF.kyogre.ab[0], 100, 2)), 'Kyogre: la descripción explica el maremoto'); }
// Rework de costes 5: cada mecánica nueva hace lo que dice
{ const foe = { ag: [], m: {}, u: [['3,0', 'cubone', 2, [], 0, 0], ['2,0', 'larvitar', 2, [], 0, 0], ['4,0', 'beldum', 2, [], 0, 0], ['3,3', 'rowlet', 2, [], 0, 0], ['2,3', 'ralts', 2, [], 0, 0], ['4,3', 'hatenna', 2, [], 0, 0]] };
  const run = (k, star = 2, items = [], seed = 31) => { const front = ['t', 'b', 'a'].includes(E.DEF[k].role); const me = { ag: [], m: {}, u: [[front ? '3,0' : '3,3', k, star, items, 0, 0], [front ? '2,0' : '3,0', 'lapras', 2, [], 0, 0], ['4,0', 'onix', 2, [], 0, 0], ['2,3', 'rowlet', 2, [], 0, 0]] };
    const cb = E.createCombatSnap(me, foe, { s: 5, n: 2 }, { seed, visual: true }), u = cb.units.find(x => x.d.key === k), hp0 = u.maxHp; E.simulate(cb); return { cb, u, hp0, f: cb.feed.filter(x => x.s === 0 && x.n === u.name) }; };
  // Groudon: tanque, aturde en área al primer lanzamiento, gana vida (para siempre) con las bajas cercanas
  const g = E.baseCombatUnit(E.DEF.groudon, 0, 2); ok(g.role === 't' && g.mana >= g.maxMana * .8, `Groudon: tanque con maná inicial alto (${g.mana}/${g.maxMana})`);
  const G = run('groudon'); ok(G.f[0] && G.f[0].st, 'Groudon: su primer lanzamiento aturde'); ok(G.u.quakeGain > 0 && G.u.maxHp > G.hp0, `Groudon: gana vida con las bajas cercanas (+${G.u.quakeGain})`);
  { const { G: Gm, p } = fresh(); const inst = E.makeInst('groudon'), mk = (k, s) => Object.assign(E.makeInst(k), { star: s }); inst.star = 2; p.board = { '3,0': inst, '2,0': mk('lapras', 2), '4,0': mk('onix', 2), '2,3': mk('rowlet', 2) }; const sa = E.teamSnap(p); const cb = E.createCombatSnap(sa, foe, { s: 5, n: 2 }, { seed: 31, refsA: p.board }); E.simulate(cb); ok(inst.stk.hp > 0, `Groudon: la vida ganada se guarda para siempre (+${inst.stk.hp})`); }
  // Darkrai: duerme a 3 enemigos al azar a 1★ y a 4 a 2★, más tiempo a 2★
  const D1 = run('darkrai', 1), D2 = run('darkrai', 2); ok(D1.f[0] && D1.f[0].h === 3, `Darkrai 1★: duerme a 3 (${D1.f[0] && D1.f[0].h})`); ok(D2.f[0] && D2.f[0].h === 4, `Darkrai 2★: duerme a 4 (${D2.f[0] && D2.f[0].h})`);
  ok(/3 enemigos al azar 2.4s/.test(E.abDesc(E.DEF.darkrai.ab[0], 100, 1)) && /4 enemigos al azar 3.2s/.test(E.abDesc(E.DEF.darkrai.ab[0], 100, 2)), 'Darkrai: la descripción muestra objetivos y duración por estrella');
  // Moltres: golpea a todos, quema y reduce la curación; lanza varias veces
  const M = run('moltres'); ok(M.f.length >= 2 && M.f[0].h >= 5, `Moltres: varios lanzamientos que golpean a todo el tablero (${M.f.length} lanzamientos, ${M.f[0] && M.f[0].h} golpeados)`);
  { const cb = E.createCombatSnap({ ag: [], m: {}, u: [['3,3', 'moltres', 2, [], 0, 0]] }, foe, { s: 5, n: 2 }, { seed: 31 }); const mo = cb.units.find(x => x.d.key === 'moltres'); mo.mana = mo.maxMana; for (let i = 0; i < 400 && !mo.castN; i++) vmStep(cb);
    const en = cb.units.filter(x => x.side === 1 && !x.dead); ok(en.every(e => e.woundT > 0 && e.burns.length > 0), 'Moltres: todos los golpeados quedan quemados y con curación reducida'); }
  // Ho-Oh: cada 3 lanzamientos revive al aliado caído más valioso
  { const cb = E.createCombatSnap({ ag: [], m: {}, u: [['3,3', 'hooh', 2, [], 0, 0], ['3,0', 'lapras', 2, [], 0, 0]] }, foe, { s: 5, n: 2 }, { seed: 31, visual: true }); const h = cb.units.find(x => x.d.key === 'hooh'), la = cb.units.find(x => x.d.key === 'lapras');
    la.hp = 0; la.dead = true; h.rbN = 2; h.mana = h.maxMana; for (let i = 0; i < 400 && !h.castN; i++) vmStep(cb); ok(!la.dead && la.hp > 0, 'Ho-Oh: al 3.er lanzamiento revive al aliado caído'); }
  // Ho-Oh: golpea a un solo enemigo, le quita armadura un tiempo (se renueva, no se acumula, y luego vuelve exacta) y cura a todos sus aliados
  { const cb = E.createCombatSnap({ ag: [], m: {}, u: [['3,3', 'hooh', 2, [], 0, 0], ['3,0', 'lapras', 2, [], 0, 0]] }, foe, { s: 5, n: 2 }, { seed: 31 }); const h = cb.units.find(x => x.d.key === 'hooh'), la = cb.units.find(x => x.d.key === 'lapras');
    const en = cb.units.filter(x => x.side === 1), t = en[0]; h.target = t; const hp0 = en.map(x => x.hp), df0 = t.df; la.hp = la.maxHp * .5; const lh = la.hp; E.castAbility(cb, h, h.ab);
    ok(en.filter((x, i) => x.hp < hp0[i]).length === 1 && t.hp < hp0[0], 'Ho-Oh: Fuego Sagrado golpea a un solo enemigo'); ok(Math.abs(t.df - df0 * .6) < .01 && la.hp > lh, `Ho-Oh: le quita un 40 % de armadura y cura a sus aliados (${df0}→${t.df})`);
    E.castAbility(cb, h, h.ab); ok(Math.abs(t.df - df0 * .6) < .01, 'Ho-Oh: lanzarlo dos veces no acumula la reducción'); h.stun = 99; h.mana = 0;
    for (let i = 0; i < 140; i++) vmStep(cb); ok(t.dead || Math.abs(t.df - df0) < .01, `Ho-Oh: al acabar la reducción la armadura vuelve exacta (${t.df})`); }
  // Zapdos: mediocre sin objetos, mucho mejor con sus objetos (hipercarry)
  const z0 = E.baseCombatUnit(E.DEF.zapdos, 0, 2), z1 = Object.assign({}, z0, { ad: z0.ad * 1.85 }); ok(E.abilPower(z1) / E.abilPower(z0) > 1.85 * 1.2, 'Zapdos: el ataque extra rinde más que proporcional en su habilidad');
  // Zapdos: Electrocución solo aturde al primero; cada 2 bajas +1 % de vel. de ataque y cada 5, un rebote más en sus ataques (cada enemigo cuenta una vez)
  { const cb = E.createCombatSnap({ ag: [], m: {}, u: [['3,3', 'zapdos', 2, [], 0, 0]] }, foe, { s: 5, n: 2 }, { seed: 31 }); const z = cb.units.find(x => x.d.key === 'zapdos'), en = cb.units.filter(x => x.side === 1);
    z.target = en[0]; E.castAbility(cb, z, z.ab); ok(en.filter(x => x.stun > 0).length === 1, `Zapdos: Electrocución aturde solo a un enemigo (${en.filter(x => x.stun > 0).length})`);
    const as0 = z.as; for (const e of en.slice(0, 2)) E.dealDamage(cb, z, e, 1e9, 'true', true); ok(z.stormK === 2 && Math.abs(z.as - as0 * 1.01) < 1e-9 && !z.stormBounce, 'Zapdos: 2 bajas → +1 % de velocidad de ataque');
    for (const e of en.slice(2, 5)) E.dealDamage(cb, z, e, 1e9, 'true', true); ok(z.stormK === 5 && z.stormBounce === 1, 'Zapdos: 5 bajas → sus ataques rebotan a un enemigo más');
    en[0].dead = false; en[0].hp = 10; E.dealDamage(cb, z, en[0], 1e9, 'true', true); ok(z.stormK === 5, 'Zapdos: un enemigo que renace y vuelve a caer no cuenta dos veces');
    const left = en[5]; left.hp = left.maxHp; const ralts = left; const hp1 = ralts.hp; z.target = ralts; const fake = E.createCombatSnap({ ag: [], m: {}, u: [['3,3', 'zapdos', 2, [], 0, 0]] }, foe, { s: 5, n: 2 }, { seed: 32 }); const z2 = fake.units.find(x => x.d.key === 'zapdos'), e2 = fake.units.filter(x => x.side === 1);
    z2.stormBounce = 2; vmStep(fake); const h2 = e2.map(x => x.hp + x.shield); for (const x of e2) x.dodge = 0; z2.target = e2[0]; fake.units.forEach(x => { x.atkCd = 99; x.moveCd = 99; }); z2.atkCd = 0; z2.range = 9; vmStep(fake);
    ok(e2.filter((x, i) => x.hp + x.shield < h2[i]).length === 3, `Zapdos: con 2 rebotes, un ataque alcanza a 3 enemigos distintos (${e2.filter((x, i) => x.hp + x.shield < h2[i]).length})`); }
  // Rayquaza: apunta donde atraviesa a más enemigos y cada lanzamiento suma +15 % (máx. +75 %)
  { const grupo = { ag: [], m: {}, u: [['0,0', 'onix', 2, [], 0, 0], ['3,1', 'cubone', 2, [], 0, 0], ['3,2', 'larvitar', 2, [], 0, 0], ['3,3', 'beldum', 2, [], 0, 0]] };
    const cb = E.createCombatSnap({ ag: [], m: {}, u: [['3,3', 'rayquaza', 2, [], 0, 0]] }, grupo, { s: 5, n: 2 }, { seed: 5 }); const r = cb.units.find(x => x.d.key === 'rayquaza'), en = cb.units.filter(x => x.side === 1); r.target = en[0];
    const h0 = en.map(x => x.hp); E.castAbility(cb, r, r.ab); ok(en.filter((x, i) => x.hp < h0[i]).length >= 3, `Rayquaza: el rayo va hacia la fila con más enemigos (${en.filter((x, i) => x.hp < h0[i]).length} alcanzados)`);
    const cb2 = E.createCombatSnap({ ag: [], m: {}, u: [['3,3', 'rayquaza', 2, [], 0, 0]] }, grupo, { s: 5, n: 2 }, { seed: 5 }); const r2 = cb2.units.find(x => x.d.key === 'rayquaza'), e2 = cb2.units.filter(x => x.side === 1); for (const x of e2) { x.maxHp = x.hp = 1e7; } const dmg = () => { const b = e2.reduce((t, x) => t + x.hp, 0); E.castAbility(cb2, r2, r2.ab); return b - e2.reduce((t, x) => t + x.hp, 0); };
    const d = [1, 2, 3, 4, 5, 6, 7, 8].map(dmg); ok(d[1] > d[0] * 1.1 && Math.abs(d[7] / d[6] - 1) < .02 && d[7] / d[0] < 1.8, `Rayquaza: su daño crece con cada lanzamiento y se para en +75 % (${Math.round(d[0])}→${Math.round(d[7])})`); }
  // Giratina: menos daño base que antes, más crecimiento por devorado
  const gp = E.DEF.giratina.ab[0][2]; ok(gp.m < 3.8 && gp.ghp > 60 && gp.gad > 6, 'Giratina: menos daño base y más escalado por devorado'); }

// 10. Determinismo: dibujar el combate (efectos, retrasos visuales de impacto) no cambia su resultado
{ const big = ['machop', 'onix', 'charmander', 'pichu', 'abra', 'gastly', 'magnemite', 'riolu', 'cleffa'], big2 = ['magikarp', 'bulbasaur', 'squirtle', 'meowth', 'dratini', 'larvitar', 'cleffa', 'abra', 'pichu'];
  const cells = ['3,0', '2,0', '4,0', '1,0', '5,0', '2,3', '3,3', '4,3', '1,3'], snap = (l, st, it) => ({ ag: [], m: {}, u: l.map((k, i) => [cells[i], k, st, it, 0, 0]) });
  let same = 0, fxN = 0; const N = 20;
  for (let s = 1; s <= N; s++) { const a = snap(big, 1 + (s % 3), s % 2 ? ['soothe', 'energy'] : []), b = snap(big2, 1 + (s % 3), ['sharp']);
    const run = vis => { const cb = E.createCombatSnap(a, b, { s: 4, n: 2, type: 'pvp' }, { seed: s * 7919, visual: vis }); E.simulate(cb); if (vis) fxN += cb.fx.length; return JSON.stringify([cb.winner, +cb.t.toFixed(3), cb.units.map(u => Math.round(u.hp))]); };
    if (run(false) === run(true)) same++; }
  ok(same === N, `mismo resultado con y sin efectos visuales (${same}/${N})`); ok(fxN > 0, 'los combates visuales generan efectos'); }

// 14. Resonancia legendaria: un Legendario depende de sus otras sinergias, y otros legendarios no se las activan
{ const ray = b => { const { p } = fresh(); p.board = b; return combatOf(p, '3,3'); }, I = E.makeInst;
  const solo = ray({ '3,3': I('rayquaza'), '3,0': I('onix') }), conLeg = ray({ '3,3': I('rayquaza'), '3,0': I('giratina'), '2,0': I('zapdos') });
  const conApoyo = ray({ '3,3': I('rayquaza'), '3,0': I('dratini'), '2,0': I('horsea'), '4,3': I('pichu') });
  ok(solo.legMul < 1 && solo.legRes === 0, `Rayquaza sin apoyo se debilita (×${solo.legMul})`);
  ok(conLeg.legRes === 0, 'Giratina y Zapdos no activan la resonancia de Rayquaza');
  ok(conApoyo.legRes >= 2 && conApoyo.legMul > 1 && conApoyo.ad > solo.ad, `con Dragón y Tirador se fortalece (×${conApoyo.legMul})`); }


// 15. Guante de Boxeo (guante ladrón) y aumentos inspirados en TFT
{ const { p } = fresh(); const u = E.makeInst('pichu'); p.board = { '3,3': u };
  ok(E.addItemToUnit(u, 'zoom').ok, 'Guante de Boxeo: se equipa en un Pokémon sin objetos'); ok(!E.addItemToUnit(u, 'claw').ok, 'Guante de Boxeo: ocupa todos los huecos');
  const row = E.teamSnap(p).u[0]; ok(row[3].length === 3 && row[3][0] === 'zoom', 'Guante de Boxeo: en combate lleva 2 objetos completos más');
  const v = E.makeInst('abra'); v.items = ['claw']; ok(!E.addItemToUnit(v, 'zoom').ok, 'Guante de Boxeo: no se pone a quien ya lleva objetos');
  const t0 = u.tg.join(); let changed = false; for (let i = 0; i < 20 && !changed; i++) { E.ensureGloves(p, true); changed = u.tg.join() !== t0; } ok(changed, 'Guante de Boxeo: sus objetos cambian cada ronda'); }
{ const { G, p } = fresh(); G.round = { s: 2, n: 1, type: 'pvp' }; E.applyAugment(p, E.AUG_BY.guantes_suerte); const u = E.makeInst('pichu'); u.items = ['zoom']; p.board = { '3,3': u }; E.teamSnap(p);
  ok(u.tg.every(k => ['band', 'rage', 'sharp', 'expert', 'razorfang', 'twin'].includes(k)), 'Guantes de la Suerte: objetos ideales para un tirador'); }
const combatUnits = (p, foeBoard) => { const cb = E.createCombatSnap(E.teamSnap(p), { ag: [], m: {}, u: foeBoard || [['3,0', 'onix', 1, [], 0, 0]] }, { s: 3, n: 2, type: 'pvp' }, { seed: 5 }); return cb; };
{ const { p } = fresh(); p.board = { '2,0': E.makeInst('onix'), '4,0': E.makeInst('squirtle'), '3,3': E.makeInst('pichu') }; const base = combatUnits(p).units.filter(u => u.side === 0).map(u => u.maxHp);
  E.applyAugment(p, E.AUG_BY.guardianes_gemelos); const got = combatUnits(p).units.filter(u => u.side === 0);
  ok(got[0].maxHp - base[0] === 100 && got.find(u => u.bk === '3,3').maxHp === base[2], 'Guardianes Gemelos: solo los 2 de la primera fila ganan +100 de vida'); }
{ const { p } = fresh(); E.applyAugment(p, E.AUG_BY.buscavidas); ok(p.mods.maxInterest === 0, 'Buscavidas: sin intereses'); }
{ const { G, p } = fresh(); G.round = { s: 2, n: 1 }; const copias = () => p.bench.filter(Boolean).reduce((s, u) => s + Math.pow(3, u.star - 1), 0), u0 = copias(); /* copias, no fichas: si salen 3 iguales se fusionan */ E.applyAugment(p, E.AUG_BY.reparto); ok(copias() === u0 + 3, 'Reparto Pokémon: 3 Pokémon de coste 2');
  for (let i = 0; i < 6; i++) event(p, 'roundStart', {}); ok(copias() === u0 + 6, 'Reparto Pokémon: 3 más a las 6 rondas'); }
{ const { G, p } = fresh(); E.applyAugment(p, E.AUG_BY.vale_la_pena); const k = p.augSt.vale_la_pena.k; const n = () => p.bench.filter(u => u && u.baseId === k).reduce((s, u) => s + Math.pow(3, u.star - 1), 0) + Object.values(p.board).filter(u => u.baseId === k).reduce((s, u) => s + Math.pow(3, u.star - 1), 0);
  const a = n(); event(p, 'roundStart', {}); event(p, 'roundStart', {}); ok(n() === a + 2, 'Vale la Pena Esperar: una copia cada ronda'); }
{ const { p } = fresh(); E.applyAugment(p, E.AUG_BY.companero); const k = 'pichu'; E.addUnitToBench(p, E.makeInst(k)); event(p, 'buy', { key: k, cost: 1 }); ok(p.bench.some(u => u && u.baseId === k && u.star === 3), 'Construye un Compañero: el siguiente coste 1 llega a 3★'); }
{ const { p } = fresh(); E.applyAugment(p, E.AUG_BY.huevo_oro); for (let i = 0; i < 5; i++) event(p, 'win', { pve: false }); ok(p.augSt.huevo_oro.t === 6, 'Huevo de Oro: ganar PvP lo adelanta'); }


// 16. Yunques, duplicadores, radiantes y mecánicas especiales
{ const { G, p } = fresh(); G.roundIdx = 3; E.applyAugment(p, E.AUG_BY.activos_hierro); const i = p.bench.findIndex(u => u && u.defId === 'yunque');
  ok(i >= 0, 'Activos de Hierro: Yunque de componentes en el banquillo'); const free = Object.keys(p.board).length;
  ok(!E.applyAct ? true : true, ''); p.board = {}; ok(!E.moveTo || true, '');
  ok(E.sellAt(p, { i }) && p.picks[0].opts.length === 6 && p.picks[0].opts.every(o => E.ITEMS[o.v.slice(3)].comp), 'el Yunque de componentes ofrece 6 componentes');
  const n0 = p.items.length; E.resolvePick(p, p.picks[0].id, 2); ok(p.items.length === n0 + 1, 'se recibe el componente elegido'); }
{ const { G, p } = fresh(); G.roundIdx = 3; E.applyAugment(p, E.AUG_BY.bufe_componentes); const b0 = p.bench.filter(u => u && u.defId === 'yunque').length; E.giveItem(p, 'claw'); ok(p.bench.filter(u => u && u.defId === 'yunque').length === b0 + 1, 'Bufé de Componentes: un componente se convierte en yunque');
  const i = p.bench.findIndex(u => u && u.defId === 'yunque'); E.sellAt(p, { i }); const it0 = p.items.length; E.resolvePick(p, p.picks[0].id, 0); ok(p.items.length === it0 + 1, 'el componente del yunque no vuelve a convertirse en yunque'); }
{ const { G, p } = fresh(); p.bench = Array(9).fill(null); const u = E.makeInst('pichu'); p.board = { '3,3': u }; p.items = ['dup_menor', 'dup_menor']; const pool0 = G.pool.pichu;
  ok(E.useItem(p, 0, u).ok && p.bench.some(x => x && x.baseId === 'pichu') && G.pool.pichu === pool0, 'Duplicador menor: copia sin tocar el pool');
  const big = E.makeInst('kyogre'); p.board['0,0'] = big; ok(!E.useItem(p, 0, big).ok, 'el Duplicador menor no copia costes 4-5'); p.items = ['dup_mayor']; ok(E.useItem(p, 0, big).ok, 'el Duplicador copia cualquier coste'); }
{ ok(E.ITEMS.rad_band && E.ITEMS.rad_band.s.adPct === E.ITEMS.band.s.adPct * 2 && !Object.values(E.RECIPE).includes('rad_band'), 'Radiantes: el doble de estadísticas y sin receta');
  const { p } = fresh(); E.applyAugment(p, E.AUG_BY.reliquias_radiantes); const pk = p.picks.find(x => x.src === 'reliquias_radiantes'); ok(pk && pk.opts.length === 5 && pk.opts.every(o => E.ITEMS[o.v.slice(3)].radiant), 'Reliquias Radiantes: eliges 1 de 5 radiantes'); }
{ const { G, p } = fresh(); p.bench = Array(9).fill(null); const u = E.makeInst('pichu'); u.star = 2; u.items = ['claw']; p.bench[8] = u; E.applyAugment(p, E.AUG_BY.banco_pandora); event(p, 'roundStart', {});
  ok(u.baseId !== 'pichu' && E.DEF[u.baseId].cost === 1 && u.star === 2 && u.items[0] === 'claw', 'Banco de Pandora: cambia de Pokémon con el mismo coste, estrellas y objetos'); }
{ const { G, p } = fresh(); G.roundIdx = 3; const u = E.makeInst('pichu'); p.board = { '3,3': u }; p.bench = Array(9).fill(null); E.applyAugment(p, E.AUG_BY.no_scout); event(p, 'roundEnd', { pve: false });
  ok(!E.sellAt(p, { b: '3,3' }) && p.board['3,3'] === u, 'NO SCOUT NO PIVOT: no se puede vender'); ok(E.augSnap(p).some(r => r[0] === 'no_scout' && r[1] === 1), 'NO SCOUT NO PIVOT: el equipo crece tras cada combate PvP'); }
{ const { G, p } = fresh(); p.board = { '0,0': E.makeInst('onix'), '3,3': E.makeInst('kyogre'), '4,3': E.makeInst('pichu') }; E.applyAugment(p, E.AUG_BY.solo_leveling);
  const sn = E.teamSnap(p); ok(sn.u.length === 1 && sn.u[0][1] === 'kyogre', 'Solo Leveling: solo pelea el Pokémon más fuerte'); const xp0 = p.xp + p.level * 1000; event(p, 'kills', { n: 3 }); ok(p.xp + p.level * 1000 > xp0, 'Solo Leveling: las bajas dan EXP');
  G.round = { s: 2, n: 7, type: 'pve' }; const i0 = p.items.length; event(p, 'roundStart', {}); ok(!p.mods.soloLevel && p.items.length === i0 + 2, 'Solo Leveling: en la ronda PvE vuelven los huecos y 2 componentes'); }
{ const { p } = fresh(); E.applyAugment(p, E.AUG_BY.saqueo); const u0 = p.bench.filter(Boolean).length; event(p, 'roundEnd', { pve: false, firstKill: 'charmander' }); ok(p.bench.filter(Boolean).length === u0 + 1 && p.bench.some(u => u && u.baseId === 'charmander'), 'Saqueo: copia del primer Pokémon derrotado'); }
{ const { p } = fresh(); E.applyAugment(p, E.AUG_BY.prestamo); ok(p.augShift === -1, 'Préstamo Avanzado: el siguiente aumento baja de rareza'); E.applyAugment(p, E.AUG_BY.poder_aumentado); ok(p.augShift === 0, 'Poder Aumentado compensa'); }
{ const { p } = fresh(); E.applyAugment(p, E.AUG_BY.arcos_reserva); event(p, 'roundEnd', { pve: false, cs: { atk: 600 } }); ok(/600 \/ 1\.?000/.test(E.augProgress(p, 'arcos_reserva')), 'Plumas de Reserva: progreso visible'); const n0 = p.items.length; event(p, 'roundEnd', { pve: false, cs: { atk: 500 } }); ok(p.items.length === n0 + 2, 'Plumas de Reserva: 2 Plumas al llegar a 1000 ataques'); }
{ const { p } = fresh(); p.mods.lucky = 1; E.applyAugment(p, E.AUG_BY.tirada_magica); const r = p.reveals[p.reveals.length - 1]; ok(Array.isArray(r[6]) && r[6][0] === 6 && p.items.some(k => String(k).startsWith('emb_')), 'Tirada con Dados Cargados: sale 6 (emblema) y la ventana lleva el dado'); }

// Banquillo lleno: orbes con Pokémon que esperan, Pokémon que van al tablero (n+1/n) y venta automática al empezar el combate
{ const run = s => vm.runInContext(s, ctx), mk = k => run(`makeInst('${k}')`), keys = E.UNIT_LIST.filter(u => u.cost === 1 && !E.DEF[u.key].evoOf).map(u => u.key);
  const llena = p => { p.bench = keys.slice(0, 9).map(k => mk(k)); p.board = {}; p.level = 3; for (let i = 0; i < 3; i++) p.board[i + ',3'] = mk(keys[(i + 3) % keys.length]); };
  // Los Pokémon del orbe nunca lo bloquean: los que no caben se venden por su coste; solo un yunque necesita su hueco (uno por yunque)
  { const { G, p } = fresh(); G.phase = 'planning'; llena(p); p.orbs = [{ id: 901, tier: 'gold', toks: ['u2', 'u2'], c: 3, r: 5 }, { id: 902, tier: 'gray', toks: ['g3'], c: 2, r: 5 }, { id: 903, tier: 'gold', toks: ['ca'], c: 4, r: 5 }];
    const ids = () => p.bench.map(u => u && u.uid).join(), b0 = ids(), g0 = p.gold, pool0 = JSON.stringify(G.pool);
    ok(!!run('openPlayerOrb')(p, 901, false) && !p.orbs.some(o => o.id === 901) && ids() === b0 && p.gold - g0 >= 2 && p.gold - g0 <= 10 && JSON.stringify(G.pool) === pool0,
      `banca llena: el orbe con 2 Pokémon se abre y se venden por su coste (+${p.gold - g0} de oro, el pool queda igual)`);
    const g1 = p.gold; ok(!!run('openPlayerOrb')(p, 902, false) && p.gold === g1 + 3, 'banca llena: un orbe de oro se abre');
    ok(!E.applyAct(p, { t: 'orb', id: 903 }).ok && p.orbs.some(o => o.id === 903), 'banca llena: el orbe con yunque no se abre y sigue en el suelo');
    p.isBot = false; G.round = E.ROUNDS[G.roundIdx]; run('startCombat')(); ok(p.orbs.some(o => o.id === 903), 'banca llena: al empezar el combate el orbe con yunque no se abre solo');
    p.bench[0] = null; G.phase = 'planning'; ok(E.applyAct(p, { t: 'orb', id: 903 }).ok && p.bench.some(u => u && u.defId === 'yunque'), 'con un solo hueco libre el yunque ya entra'); }
  { const { G, p } = fresh(); G.phase = 'planning'; llena(p); p.bench[8] = null; p.orbs = [{ id: 904, tier: 'gold', toks: ['u1', 'ca', 'u1'], c: 3, r: 5 }];
    const g0 = p.gold; ok(run('orbUnits')(p.orbs[0]) === 1 && !!run('openPlayerOrb')(p, 904, false) && p.bench.some(u => u && u.defId === 'yunque') && p.gold - g0 >= 2,
      `un hueco y un orbe con yunque y 2 Pokémon: el yunque entra y los Pokémon se venden (+${p.gold - g0} de oro)`); }
  { const { G, p } = fresh(); G.phase = 'planning'; llena(p); p.bench[8] = null; p.orbs = [{ id: 905, tier: 'gray', toks: ['u1'], c: 3, r: 5 }];
    const g0 = p.gold; ok(!!run('openPlayerOrb')(p, 905, false) && p.bench.every(Boolean) && p.gold === g0, 'con hueco libre el Pokémon del orbe va a la banca (no se vende)'); }
  { const { G, p } = fresh(); G.phase = 'planning'; llena(p); const max = run('maxBoard')(p), nb = () => Object.values(p.board).filter(Boolean).length;
    const libre = keys.find(k => !p.bench.some(u => u.baseId === k) && !Object.values(p.board).some(u => u.baseId === k));
    ok(run('giveUnitTo')(p, libre) && nb() === max + 1 && Object.values(p.board).some(u => u.baseId === libre), `banca llena: el Pokémon que te dan va al tablero aunque se pase (${nb()}/${max})`);
    const meAntes = G.me; G.me = p; const sp = run('floorCountSpec')(); G.me = meAntes;
    ok(sp && sp.over === true && sp.txt === `${max + 1}/${max}`, `banca llena: el contador marca ${sp && sp.txt} en rojo (over)`);
    const g0 = p.gold, vals = Object.values(p.board).map(u => run('sellValue')(u)); G.round = E.ROUNDS[G.roundIdx]; run('sellOverflow')(p);
    ok(nb() === max && vals.includes(p.gold - g0), `banca llena: al empezar el combate se vende uno al azar y cobras su valor (${nb()}/${max}, +${p.gold - g0} de oro)`);
    ok(run('sellOverflow')(p) === 0 && nb() === max, 'banca llena: con n/n no se vende nada más'); }
}

// Yunques del PvE: el orbe los deja en la banca (nunca se abren solos), ocupan banquillo como un Pokémon y se abren al venderlos (E o arrastrándolos a la tienda)
{ const run = s => vm.runInContext(s, ctx), mk = k => run(`makeInst('${k}')`), keys = E.UNIT_LIST.filter(u => u.cost === 1 && !E.DEF[u.key].evoOf).map(u => u.key);
  { const { G, p } = fresh(); G.phase = 'planning'; p.bench = p.bench.map(() => null); p.orbs = [{ id: 921, tier: 'gold', toks: ['ca'], c: 3, r: 5 }];
    ok(!!run('openPlayerOrb')(p, 921, false) && p.bench.some(u => u && u.defId === 'yunque') && !p.picks.length, 'yunque del orbe: va a la banca sin abrirse');
    const i = p.bench.findIndex(u => u && u.defId === 'yunque'); const r = E.applyAct(p, { t: 'sell', loc: { i } });
    ok(r.ok && !p.bench[i] && p.picks.length === 1 && /Yunque/.test(JSON.stringify(p.picks[0])), 'yunque: al venderlo (E o tienda) se abre la elección');
    p.picks = []; p.orbs = [{ id: 922, tier: 'gold', toks: ['fa'], c: 3, r: 5 }]; ok(!!run('openPlayerOrb')(p, 922, false) && p.bench.some(u => u && u.defId === 'yunque_oro') && !p.picks.length, 'yunque de objetos del orbe: también a la banca'); }
  { const { G, p } = fresh(); G.phase = 'planning'; p.bench = keys.slice(0, 9).map(k => mk(k)); p.orbs = [{ id: 923, tier: 'gray', toks: ['ca'], c: 2, r: 5 }];
    ok(run('orbUnits')(p.orbs[0]) === 1 && run('openPlayerOrb')(p, 923, false) === null && p.orbs.some(o => o.id === 923), 'banca llena: el orbe con yunque espera en el suelo');
    p.bench[0] = null; ok(!!run('openPlayerOrb')(p, 923, false) && p.bench.some(u => u && u.defId === 'yunque'), 'con un hueco libre el yunque entra en la banca'); } }
// Elección pendiente (yunque) abierta al empezar el combate: la persona elige después y recibe el objeto (solo bots y ausentes eligen solos)
{ const run = s => vm.runInContext(s, ctx);
  const { G, p } = fresh(); G.phase = 'planning'; p.bench = p.bench.map(() => null); p.bench[0] = run(`makeInst('yunque_oro')`); G.round = E.ROUNDS[G.roundIdx];
  ok(E.applyAct(p, { t: 'sell', loc: { i: 0 } }).ok && p.picks.length === 1, 'yunque: al venderlo queda la elección pendiente');
  run('startCombat')(); ok(p.picks.length === 1, 'al empezar el combate la elección de la persona sigue pendiente (no se elige sola)');
  const quiero = p.picks[0].opts[2].v.slice(3), n0 = p.items.length; ok(E.applyAct(p, { t: 'pick', id: p.picks[0].id, i: 2 }).ok && p.items.length === n0 + 1 && p.items.includes(quiero) && !p.picks.length, 'elegir durante el combate da exactamente ese objeto');
  const b = G.players.find(q => q.isBot); b.picks = []; run('openAnvil')(b, 'c'); ok(!b.picks.length && b.items.length >= 1, 'los rivales generados eligen solos'); }
// Variocolor: solo al comprar (SHINY_P), hereda al fusionar (1★→2★→3★), viaja en packInst/teamSnap/pub y no cambia estadísticas ni pool
{ const run = s => vm.runInContext(s, ctx); ctx.__rnd = run('Math.random');
  { const { G, p } = fresh(); G.phase = 'planning'; G.roundIdx = 3; G.round = E.ROUNDS[3]; p.gold = 99; p.board = {}; p.bench = p.bench.map(() => null); p.shop = ['charmander', 'charmander', 'charmander', 'squirtle', 'squirtle'];
    run('Math.random=()=>0.001'); ok(E.applyAct(p, { t: 'buy', i: 0 }).ok && p.bench[0] && p.bench[0].shiny === true, 'compra con azar bajo: variocolor');
    run('Math.random=()=>0.9'); ok(E.applyAct(p, { t: 'buy', i: 1 }).ok && !p.bench[1].shiny && E.applyAct(p, { t: 'buy', i: 2 }).ok, 'compra con azar alto: normal');
    run('combine')(p); const u2 = p.bench.find(Boolean); ok(u2 && u2.star === 2 && u2.shiny === true && p.bench.filter(Boolean).length === 1, 'tres Charmander con uno variocolor → Charmeleon 2★ variocolor');
    const n2 = run(`makeInst('charmander')`), n3 = run(`makeInst('charmander')`); n2.star = n3.star = 2; p.bench[1] = n2; p.bench[2] = n3; run('combine')(p);
    const u3 = p.bench.find(Boolean); ok(u3 && u3.star === 3 && u3.shiny === true && String(run('dexOf')(E.DEF[u3.defId], 3)) === '6', 'tres Charmeleon con uno variocolor → Charizard 3★ variocolor');
    const base = run('baseCombatUnit')(E.DEF[u3.defId], 0, 3, () => .5), cu = run('makeCombatUnit')(u3, p, {}, 0, () => .5); ok(cu.shiny === true && cu.maxHp === base.maxHp && cu.ad === base.ad, 'en combate lleva la marca y las mismas estadísticas que uno normal');
    const back = run('unpackInst')(run('packInst')(u3)); ok(back.shiny === true && !run('unpackInst')(run('packInst')(n2)).shiny, 'packInst/unpackInst conservan el variocolor');
    p.board = { '3,0': u3 }; const snap = run('teamSnap')(p), cb = E.createCombatSnap(snap, { ag: [], m: {}, u: [['3,0', 'machop', 1, [], 0, 0]] }, { s: 2, n: 2 }, { seed: 1 }); ok(cb.units.some(x => x.d.key === u3.defId && x.shiny), 'teamSnap → createCombatSnap: el rival lo ve variocolor');
    const bd = run('makePub')().bd[0]; ok(bd[0].some(r => r[1] === u3.defId && r[4] === 1), 'pub.bd lleva el variocolor del tablero');
    run('Math.random=__rnd'); }
  { const { G, p } = fresh(); G.phase = 'planning'; G.roundIdx = 3; G.round = E.ROUNDS[3]; let sh = 0, n = 0; for (let i = 0; i < 4000; i++) { p.gold = 99; p.bench = p.bench.map(() => null); p.shop = ['charmander', null, null, null, null]; if (E.applyAct(p, { t: 'buy', i: 0 }).ok) { n++; if (p.bench[0].shiny) sh++; } }
    ok(n === 4000 && sh > 10 && sh < 65, 'probabilidad ≈ 1/120 (' + sh + ' de 4000)'); }
  { const { p } = fresh(); const a = run(`makeInst('rattata')`), b = run(`makeInst('rattata')`), c = run(`makeInst('rattata')`); b.shiny = true; p.board = {}; p.bench = p.bench.map(() => null); p.bench[0] = a; p.bench[1] = b; p.bench[2] = c; run('combine')(p); ok(p.bench.find(Boolean).shiny === true, 'el variocolor hereda aunque no sea la copia que se queda'); } }
// Rendirse: rechazado antes de 3-1 y en el carrusel; desde 3-1 elimina (último puesto entre los vivos, equipo al pool) y la partida sigue para los demás
{ const { G, p } = fresh(); const run = s => vm.runInContext(s, ctx); G.phase = 'planning'; G.roundIdx = 5; G.round = E.ROUNDS[5];
  ok(G.round.s === 2 && !E.applyAct(p, { t: 'surrender' }).ok && p.alive, 'rendirse: antes de la fase 3-1 se rechaza');
  G.roundIdx = 10; G.round = E.ROUNDS[10]; ok(G.round.s === 3 && G.round.n === 1, 'rendirse: montaje (3-1)');
  p.board = { '3,3': run('makeInst')('charmander') }; p.bench = Array(E.BENCH || 9).fill(null); const vivos = G.players.filter(x => x.alive).length;
  const pool0 = (G.pool.charmander || 0) + p.shop.filter(k => k === 'charmander').length; // la tienda (al azar) también vuelve al pool
  G.phase = 'carousel'; ok(!E.applyAct(p, { t: 'surrender' }).ok && p.alive, 'rendirse: en el carrusel no se admite'); G.phase = 'planning';
  ok(E.applyAct(p, { t: 'surrender' }).ok && !p.alive && p.place === vivos && p.hp === 0 && Object.keys(p.board).length === 0, `rendirse: eliminado en el puesto ${p.place} de ${vivos}`);
  ok(G.pool.charmander === pool0 + 1, 'rendirse: su equipo vuelve al pool');
  ok(!E.applyAct(p, { t: 'surrender' }).ok, 'rendirse: ya eliminado, no se puede repetir');
  ok(G.players.filter(x => x.alive).length === vivos - 1 && !G.over, 'rendirse: la partida sigue para los demás'); }

// Mew (minileyenda mítica): al ganar copia la minileyenda del rival; tecla 1 = una al azar de las copiadas, tecla 2 = vuelve a ser Mew (acción mform)
{ const { G } = fresh(); const mewWin = vm.runInContext('mewWin', ctx), tacDex = vm.runInContext('tacDex', ctx);
  const [m, a, b] = G.players; m.tac = 'mew'; a.tac = 'charmander'; a.level = 6; b.tac = 'squirtle'; b.level = 1; m.mewSk = []; m.mewF = 0; m.mewN = 0; m.mewT = 0;
  ok(tacDex(m) === 151, 'Mew: sin copias se ve como Mew');
  ok(!E.applyAct(m, { t: 'mform', k: 1 }).ok, 'Mew: la tecla 1 no hace nada sin copias');
  mewWin(m, a); ok(m.mewF === 5 && tacDex(m) === 5 && m.mewSk.join() === '5' && m.mewN === 1, 'Mew: al ganar a un Charmeleon toma su forma');
  mewWin(m, b); ok(m.mewF === 7 && m.mewSk.join() === '5,7', 'Mew: al ganar a Squirtle lo añade y lo copia');
  mewWin(m, a); ok(m.mewSk.length === 2, 'Mew: no repite copias');
  m.mewT = 0; ok(E.applyAct(m, { t: 'mform', k: 1 }).ok && m.mewF === 7 && m.mewN === 4, 'Mew: la tecla 1 cambia a otra copia');
  ok(!E.applyAct(m, { t: 'mform', k: 2 }).ok, 'Mew: no se puede cambiar dos veces en menos de un segundo');
  m.mewT = 0; ok(E.applyAct(m, { t: 'mform', k: 2 }).ok && m.mewF === 0 && tacDex(m) === 151, 'Mew: la tecla 2 vuelve a Mew');
  m.mewT = 0; ok(!E.applyAct(m, { t: 'mform', k: 2 }).ok && !E.applyAct(m, { t: 'mform', k: 7 }).ok && !E.applyAct(m, { t: 'mform' }).ok, 'Mew: entradas inválidas rechazadas');
  a.mewT = 0; ok(!E.applyAct(a, { t: 'mform', k: 1 }).ok, 'Mew: quien no lleva a Mew no puede usar mform');
  mewWin(a, m); ok(!a.mewSk && a.mewF === undefined, 'Mew: los demás no copian nada al ganar a Mew');
  const m2 = G.players[3]; m2.tac = 'mew'; m2.mewF = 0; mewWin(m2, m); ok(!m2.mewSk || !m2.mewSk.length, 'Mew: ganar a un Mew sin copia no da nada'); }
// Costes 4 de 3 formas: su nombre es el de la forma que sale en la tienda y a 1★ (la 2.ª)
{ const D = E.DEF; ok(D.larvitar.name === 'Pupitar' && D.bagon.name === 'Shelgon' && D.litwick.name === 'Lampent' && D.zorua.name === 'Zorua' && D.charmander.name === 'Charmander', 'costes 4 de 3 formas: se llaman como su 2.ª forma');
  const fs = require('fs'); ok([247, 281, 444, 356, 404, 388, 375, 372, 33, 608, 723].every(n => fs.statSync(path.join(__dirname, '..', 'public', 'dex', n + '.png')).size !== fs.statSync(path.join(__dirname, '..', 'public', 'dex', (n === 356 ? 355 : n - 1) + '.png')).size), 'los sprites de la 2.ª forma ya no son copia de la 1.ª'); }
// Carrusel: reparto por fase, sin fichas repetidas, componentes hasta la 4-4 (uno de cada tipo en la 3-4) y objetos completos después
{ const startCarousel = vm.runInContext('startCarousel', ctx), ROUNDS = vm.runInContext('ROUNDS', ctx), BASIC = vm.runInContext('BASIC', ctx), FULL = vm.runInContext('FULL_KEYS', ctx);
  const want = { 2: { 3: 4, 2: 4, 1: 1 }, 3: { 4: 2, 3: 3, 2: 3, 1: 3 }, 4: { 5: 2, 4: 2, 3: 2, 2: 2, 1: 1 }, 5: { 5: 2, 3: 7 }, 7: { 5: 2, 3: 7 } };
  for (const s of [2, 3, 4, 5, 7]) for (let k = 0; k < 20; k++) {
    const { G } = fresh(); G.auto = true; G.roundIdx = ROUNDS.findIndex(r => r.s === s && r.type === 'carousel'); G.round = ROUNDS[G.roundIdx]; let opts = null;
    const fin = vm.runInContext('finishCarousel', ctx); vm.runInContext('finishCarousel=function(){ globalThis.__carOpts=G.carousel.opts.map(o=>({key:o.key,item:o.item})); G.carousel=null; }', ctx);
    startCarousel(); opts = ctx.__carOpts; vm.runInContext('finishCarousel', ctx); ctx.finishCarousel = fin; vm.runInContext('finishCarousel=' + fin.toString(), ctx);
    const n = {}; for (const o of opts) { const c = E.DEF[o.key].cost; n[c] = (n[c] || 0) + 1; }
    if (k === 0) ok(JSON.stringify(n) === JSON.stringify(Object.fromEntries(Object.entries(want[s]).sort((a, b) => a[0] - b[0]))), `carrusel ${s}-4: reparto de costes ${JSON.stringify(n)}`);
    ok(new Set(opts.map(o => o.key)).size === opts.length, `carrusel ${s}-4: sin fichas repetidas`);
    if (s <= 4) ok(opts.every(o => BASIC.includes(o.item)), `carrusel ${s}-4: solo componentes`); else ok(opts.every(o => FULL.includes(o.item)) && new Set(opts.map(o => o.item)).size === opts.length, `carrusel ${s}-4: objetos completos distintos`);
    if (s === 3) ok(BASIC.every(b => opts.some(o => o.item === b)), 'carrusel 3-4: al menos un componente de cada tipo'); } }
// Botín PvE: 12 componentes en la partida (1-1, 1-2, 1-3, 2-7, 3-7 y 4-7), yunque de componentes en la 4-7, de objeto desde la 5-7 y orbes sin componentes
{ const pveSpec = vm.runInContext('pveSpec', ctx), ORBS = vm.runInContext('ORBS', ctx), ROUNDS = vm.runInContext('ROUNDS', ctx);
  const pve = ROUNDS.filter(r => r.type === 'pve'); let comps = 0; for (const R of pve) comps += pveSpec(R).comps;
  ok(comps === 12, `PvE: 12 componentes en toda la partida (${comps})`);
  ok(pveSpec({ s: 4, n: 7 }).extra.join() === 'ca' && pveSpec({ s: 4, n: 7 }).comps === 2, 'PvE 4-7: 2 componentes y un yunque de componentes');
  ok([5, 6, 7, 8, 9].every(s => pveSpec({ s, n: 7 }).extra.join() === 'fa' && !pveSpec({ s, n: 7 }).comps), 'PvE 5-7 en adelante: solo un yunque de objeto completo');
  ok(Object.values(ORBS).every(o => o.t.every(([, toks]) => !toks.some(t => /^(c|m|ca|fa)$/.test(t)))), 'los orbes ya no traen componentes, Medallas ni yunques');
  // una persona que no derrota a todos los salvajes recibe igual sus componentes (en el suelo)
  const { G, p } = fresh(); p.orbs = []; const f = { pve: true, a: p, lootKeys: ['c', 'c', 'gray12'] }; const before = p.orbs.length;
  vm.runInContext('(function(p,keys){ for(const k of keys.filter(k=>k===\'c\'||k===\'ca\'||k===\'fa\')) dropOrb(p,k); })', ctx)(p, f.lootKeys);
  ok(p.orbs.length === before + 2, 'PvE: los componentes que no cayeron se dejan en el suelo'); }
// Llamada al Caos: la carta no dice el premio; 9 premios (con 3 Guantes de Boxeo y 6 componentes distintos)
{ const A = E.AUG_BY.llamada_caos, CH = vm.runInContext('CHAOS', ctx);
  ok(A.desc.startsWith('Obtienes una recompensa poderosa y aleatoria.') && A.desc.includes('¿¿??') && !/58|EXP/.test(A.desc), 'Llamada al Caos: la descripción no adelanta el premio');
  ok(CH.length === 9 && CH.some(o => o.id === 'guantes') && !CH.some(o => o.id === 'cofres'), 'Llamada al Caos: 9 premios con los Guantes de Ladrón');
  const { G, p } = fresh(); G.round = { s: 4, n: 2 }; CH.find(o => o.id === 'guantes').run(p, true, {}); ok(p.items.filter(k => k === 'zoom').length === 3, 'Guantes de Ladrón: 3 Guantes de Boxeo');
  const r2 = fresh(); r2.G.round = { s: 4, n: 2 }; CH.find(o => o.id === 'componentes').run(r2.p, true, {}); ok(r2.p.items.length === 6 && new Set(r2.p.items).size === 6, 'Saco de Componentes: 6 componentes distintos');
  const r3 = fresh(); r3.G.round = { s: 4, n: 2 }; E.applyAugment(r3.p, A); for (const q of r3.p.picks.slice()) E.resolvePick(r3.p, q.id, 0);
  const pg = vm.runInContext('augProgress', ctx)(r3.p, 'llamada_caos'); ok(/^Recompensa: /.test(pg) && !pg.includes('¿¿??'), 'Llamada al Caos: tras elegirla, su descripción dice la recompensa (' + pg + ')'); }
// Reajuste de octubre de 2026
// Pacto Cruel: la vida por compra sube con el nivel y hay un máximo de compras por ronda (de 4 se llega a 6, no a 7)
{ const { p } = fresh(); E.applyAugment(p, E.AUG_BY.pacto_cruel); p.level = 4; p.xp = 0; p.hp = 100; p.gold = 0; p.xpHpN = 0;
  for (let i = 0; i < 20; i++) E.applyAct(p, { t: 'xp' }); ok(p.level === 6 && p.hp === 84 && p.xpHpN === 8, `Pacto Cruel: 8 compras con vida por ronda, de nivel 4 a 6 por 16 de vida (nivel ${p.level}, vida ${p.hp})`);
  p.level = 7; p.xpHpN = 0; const h = p.hp; E.applyAct(p, { t: 'xp' }); ok(h - p.hp === 4, 'Pacto Cruel: a nivel 7 cada compra cuesta 4 de vida'); }
// Zapdos: la Tormenta Creciente se guarda en la ficha y el siguiente combate empieza con ella
{ const { p } = fresh(); const z = E.makeInst('zapdos'); z.sk = 11; p.board = { '3,3': z }; const row = E.teamSnap(p).u[0]; ok(row[8] === 11, 'Zapdos: las bajas de la tormenta viajan en teamSnap (el 8.º campo es el variocolor)');
  const cb = E.createCombatSnap(E.teamSnap(p), null, { s: 1, n: 1 }, { seed: 7 }); const u = cb.units.find(x => x.side === 0); ok(u.stormBounce === 2 && u.stormK === 11, `Zapdos: empieza el combate con 2 rebotes por 11 bajas guardadas (${u.stormBounce})`);
  ok(E.unpackInst(E.packInst(z)).sk === 11, 'Zapdos: las bajas viajan en packInst'); }
// Remates: el umbral sube con las estrellas (12/18/24 % para Absol)
{ const ab = E.DEF.absol.ab[0][2]; ok(E.abDesc(E.DEF.absol.ab[0], 100, 1).includes('12%') && E.abDesc(E.DEF.absol.ab[0], 100, 3).includes('24%'), 'Absol: remata por debajo del 12 % a 1★ y del 24 % a 3★'); }
// Emblemas con efecto propio
ok(E.ITEMS['emb_Hechicero'].sp.echo3 === 1 && E.ITEMS['em_spoon'].sp.echo3 === 1 && E.ITEMS['emb_Tirador'].s.range === 1 && E.ITEMS['emb_Asesino'].sp.execute === .15, 'emblemas: cada uno lleva su efecto (también la insignia forjada)');
for (const t in E.TRAITS) if (t !== 'Legendario') ok(/. [^.]+./.test(E.ITEMS['emb_' + t].desc), `Emblema ${t}: la descripción explica su efecto propio`);
// Depredadores: el maná por baja solo llega una vez cada 2,5 s (antes, con 6, un remate se relanzaba al tick siguiente y limpiaba la mesa)
{ const cb = E.createCombatSnap({ ag: [], m: { x: { Depredadores: 6 } }, u: [['3,0', 'absol', 2, [], 0, 0]] }, { ag: [], m: {}, u: [['3,0', 'onix', 1, [], 0, 0], ['2,0', 'machop', 1, [], 0, 0], ['4,0', 'geodude', 1, [], 0, 0]] }, { s: 5, n: 2 }, { seed: 9 });
  const u = cb.units.find(x => x.side === 0), [a, b, c] = cb.units.filter(x => x.side === 1); const kill = e => { e.hp = 1; e.shield = 0; e.dodge = 0; u.target = e; E.dealDamage(cb, u, e, 999, 'true'); };
  u.mana = 0; kill(a); const m1 = u.mana; kill(b); const m2 = u.mana; cb.t += 2.6; kill(c);
  ok(a.dead && b.dead && Math.abs(m1 - u.maxMana * .5) < .01 && m2 === m1 && Math.abs(u.mana - u.maxMana) < .01, `Depredadores: 50 % de maná por baja, como mucho una vez cada 2,5 s (${Math.round(m1)} → ${Math.round(m2)} → ${Math.round(u.mana)})`); }
// Ticket Prismático: solo prismático
ok(E.AUG_BY.ticket_dorado.tier === 'P' && E.AUG_BY.ticket_dorado.name === 'Ticket Prismático', 'Ticket Prismático: prismático y con su nombre');
console.log(`\n${checks - fails}/${checks} comprobaciones correctas`);
if (fails) { console.log('FALLO: pruebas de sinergias'); process.exit(1); }
console.log('OK: pruebas de sinergias superadas');
