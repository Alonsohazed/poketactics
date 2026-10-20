/* Pruebas rápidas de sinergias (sin navegador ni servidor): tipos, fusiones, nivel prismático y forja de insignias.
   Carga augments.js + game.js como cada sala del servidor. Uso: node test/sinergias.js */
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = ['augments.js', 'game.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8')).join('\n');
const ctx = { __SERVER__: true, module: { exports: {} }, console, setTimeout, clearTimeout, setInterval, clearInterval };
vm.createContext(ctx); vm.runInContext(src, ctx);
const E = ctx.module.exports;
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('FALLO:', msg); } };
const fresh = () => { E.newGame({ auto: true, diff: 'normal' }); const G = E.G; G.auto = false; const p = G.players[0]; p.isBot = false; p.gold = 50; p.items = []; p.picks = []; return { G, p }; };
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
  ok(mk('Tirador', 4).range === mk('Tirador', 3).range + 1, 'Tirador prismático: +1 de alcance');
  ok(mk('Depredadores', 3).rival[2] === 1, 'Depredadores 6: reinicia la habilidad al matar');
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

// 5. Forja de insignias: Medalla + componente → elegir entre 3 sinergias afines
for (const c of E.BASIC) { ok(E.FORGE_OF[c].length === 3 && E.FORGE_OF[c].every(t => E.TRAITS[t]), `forja de ${c}: 3 sinergias válidas`);
  E.FORGE_OF[c].forEach((t, j) => { const id = 'em_' + c + (j ? '_' + j : ''); ok(E.ITEMS[id] && E.ITEMS[id].emblem === t && E.ITEMS[id].forge === c, `insignia ${id} graba ${t}`); }); }
ok(TRAITS.every(t => Object.values(E.FORGE_OF).some(l => l.includes(t))), 'todas las sinergias se pueden forjar');
{ const { p } = fresh(); p.items = ['medal', 'claw']; const r = E.combineBench(p, 0, 1);
  ok(r.ok && p.items[0] === 'em_claw', 'Medalla + Garra crea la insignia');
  const pk = p.picks.find(x => x.src === '__forge'); ok(pk && pk.opts.length === 3, 'aparece la elección de la forja con 3 opciones');
  ok(E.resolvePick(p, pk.id, 1).ok && p.items[0] === 'em_claw_1' && E.ITEMS[p.items[0]].emblem === 'Depredadores', 'la elección cambia la insignia por la sinergia elegida'); }
{ const { p } = fresh(); const host = E.UNIT_LIST.find(u => u.traits.includes('Fuego') && !u.traits.includes('Hechicero') && !u.traits.includes('Psíquico')).key;
  const u = E.makeInst(host); u.items = ['spoon']; p.board['0,0'] = u; p.items = ['medal'];
  const r = E.useItem(p, 0, u); ok(r.ok && u.items[0] === 'em_spoon', 'la Medalla sobre un Pokémon con Cuchara forja en él');
  const pk = p.picks.find(x => x.src === '__forge'); ok(pk && !pk.opts.some(o => o.v.endsWith('_2')), 'no ofrece una sinergia que el Pokémon ya tiene (Fuego)');
  E.resolvePick(p, pk.id, 1); ok(u.items[0] === 'em_spoon_1', 'la insignia del Pokémon cambia a Psíquico'); }
// Los bots eligen solos
{ const { p } = fresh(); p.isBot = true; p.items = ['medal', 'lens']; E.combineBench(p, 0, 1); ok(!p.picks.length && /^em_lens/.test(p.items[0]), 'los bots resuelven la forja al momento'); }

// 6. Fusiones: Cazatesoros apunta el botín y Potencial Evolutivo crece cada ronda
{ const { p } = fresh(); E.lootTrack(p, () => { p.gold += 3; E.giveItem(p, 'claw'); }); ok(p.loot.gold === 3 && p.loot.items === 1 && p.loot.value === 6, 'botín: 3 de oro y un objeto (valor 6)'); }
{ const { G, p } = fresh(); for (const q of G.players) q.board = {}; const u = E.makeInst('charmander'); p.board['0,0'] = u; p.mods.extraTrait = { 'Potencial Evolutivo': 7 }; u.items = ['emb_Potencial Evolutivo'];
  // charmander ya es Potencial Evolutivo: el emblema no cuenta, así que se queda en nivel 3
  E.growPotential(); ok(u.stk.hp === 45 && u.stk.ad === 4, `Potencial Evolutivo 8 sin emblema válido: +45/+4 (${u.stk.hp}/${u.stk.ad})`);
  const v = E.makeInst(keyWithout('Potencial Evolutivo')); v.items = ['emb_Potencial Evolutivo']; p.board['1,0'] = v; u.stk = { hp: 0, ad: 0 }; v.stk = { hp: 0, ad: 0 };
  E.growPotential(); ok(u.stk.hp === 80 && v.stk.hp === 80 && v.stk.ad === 8, 'Potencial Evolutivo prismático: +80/+8 por ronda'); }

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
  if (id === 'h_machamp') ok(h.sp.rage === .05, 'Furia Creciente: cargas de velocidad');
  if (id === 'h_clefable') ok(h.critAbil, 'Precisión Lunar: habilidades críticas');
  if (id === 'h_charizard') ok(h.dragonRamp === .03, 'Calor Acumulado: daño creciente');
  E.simulate(cb); ok(cb.done && cb.units.every(u => Number.isFinite(u.hp)), `${id}: el combate termina sin valores rotos`);
  if (id === 'h_ditto') ok(h.copied && h.copied[0] !== 'copy', 'Adaptación Perfecta: Ditto copia una habilidad enemiga'); }
// Sustitutos de los clásicos planos
{ const { p } = fresh(); E.applyAugment(p, E.AUG_BY.pacto_cruel); p.gold = 0; const hp = p.hp, lv = p.level, xp = p.xp;
  ok(E.applyAct(p, { t: 'xp' }).ok && p.hp === hp - 2 && (p.level > lv || p.xp > xp), 'Pacto Cruel: la EXP se paga con 2 de vida'); p.hp = 20; ok(!E.applyAct(p, { t: 'xp' }).ok, 'Pacto Cruel: con 20 de vida o menos vuelve a costar oro'); }
{ const { p } = fresh(); E.applyAugment(p, E.AUG_BY.corona_maldita); ok(p.mods.boardBonus === 2, 'Corona Maldita: +2 espacios'); p.hp = 80; event(p, 'damaged', { d: 7 }); ok(p.hp === 73, 'Corona Maldita: el doble de daño'); }
{ const { p } = fresh(); E.applyAugment(p, E.AUG_BY.regalo_cumple); E.addXp(p, 30);
  ok(p.bench.filter(Boolean).some(u => u.star === 2), 'Regalo de Cumpleaños: un Pokémon de 2★ al subir de nivel'); }
{ const { p } = fresh(); E.applyAugment(p, E.AUG_BY.pandora); p.items = ['claw', 'band', 'medal', 'emb_Fuego']; event(p, 'roundStart', {});
  ok(E.BASIC.includes(p.items[0]) && E.FULL_KEYS.includes(p.items[1]) && p.items[2] === 'medal' && p.items[3] === 'emb_Fuego', 'Objetos de Pandora: cambia componentes y completos, no medallas ni emblemas'); }
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
  ok(Math.abs(c.maxHp / base.maxHp - 1.05) < .001, 'Entrenamiento Diario: +5% de vida tras 5 victorias'); ok(/\+5% de vida y de daño/.test(E.augProgress(p, 'entreno_diario')), 'Entrenamiento Diario: contador'); }
{ const { p } = fresh(); const u = E.makeInst('abra'); p.board = { '3,0': u };
  E.applyAugment(p, E.AUG_BY.entreno_combate); E.resolvePick(p, p.picks[0].id, 0); for (let i = 0; i < 2; i++) event(p, 'roundEnd', {});
  ok(u.stk.ad === 6 && u.stk.hp === 40, 'Entrenamiento de Combate: +6 de ataque y +40 de vida permanentes'); ok(/\+6 de ataque y \+40 de vida/.test(E.augProgress(p, 'entreno_combate')), 'Entrenamiento de Combate: contador'); }
{ const { p } = fresh(); p.board = { '3,0': E.makeInst('abra') }; const base = combatOf(p, '3,0'); E.applyAugment(p, E.AUG_BY.h_alakazam); for (let i = 0; i < 3; i++) event(p, 'roundStart', {});
  ok(Math.round(combatOf(p, '3,0').ap - base.ap) === 12, 'Fuerza Creciente: +12 de poder tras 3 rondas'); }
ok(Object.values(E.AUG_BY).every(a => a.img), 'todos los aumentos tienen sprite');

// 10. Determinismo: dibujar el combate (efectos, retrasos visuales de impacto) no cambia su resultado
{ const big = ['machop', 'onix', 'charmander', 'pichu', 'abra', 'gastly', 'magnemite', 'riolu', 'cleffa'], big2 = ['magikarp', 'bulbasaur', 'squirtle', 'meowth', 'dratini', 'larvitar', 'cleffa', 'abra', 'pichu'];
  const cells = ['3,0', '2,0', '4,0', '1,0', '5,0', '2,3', '3,3', '4,3', '1,3'], snap = (l, st, it) => ({ ag: [], m: {}, u: l.map((k, i) => [cells[i], k, st, it, 0, 0]) });
  let same = 0, fxN = 0; const N = 20;
  for (let s = 1; s <= N; s++) { const a = snap(big, 1 + (s % 3), s % 2 ? ['soothe', 'energy'] : []), b = snap(big2, 1 + (s % 3), ['sharp']);
    const run = vis => { const cb = E.createCombatSnap(a, b, { s: 4, n: 2, type: 'pvp' }, { seed: s * 7919, visual: vis }); E.simulate(cb); if (vis) fxN += cb.fx.length; return JSON.stringify([cb.winner, +cb.t.toFixed(3), cb.units.map(u => Math.round(u.hp))]); };
    if (run(false) === run(true)) same++; }
  ok(same === N, `mismo resultado con y sin efectos visuales (${same}/${N})`); ok(fxN > 0, 'los combates visuales generan efectos'); }

console.log(`\n${checks - fails}/${checks} comprobaciones correctas`);
if (fails) { console.log('FALLO: pruebas de sinergias'); process.exit(1); }
console.log('OK: pruebas de sinergias superadas');
