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
  ok(Math.abs(c.maxHp / base.maxHp - 1.05) < .001, 'Entrenamiento Diario: +5% de vida tras 5 victorias'); ok(/\+5% de vida y de ataque y \+5 de poder/.test(E.augProgress(p, 'entreno_diario')), 'Entrenamiento Diario: contador'); }
{ const { p } = fresh(); const u = E.makeInst('abra'); p.board = { '3,0': u };
  E.applyAugment(p, E.AUG_BY.entreno_combate); E.resolvePick(p, p.picks[0].id, 0); for (let i = 0; i < 2; i++) event(p, 'roundEnd', {});
  ok(u.stk.ad === 6 && u.stk.hp === 40 && u.stk.ap === 9, 'Entrenamiento de Combate: +6 de ataque, +9 de poder y +40 de vida permanentes'); ok(/\+6 de ataque, \+9 de poder y \+40 de vida/.test(E.augProgress(p, 'entreno_combate')), 'Entrenamiento de Combate: contador'); }
{ const { p } = fresh(); p.board = { '3,0': E.makeInst('abra') }; const base = combatOf(p, '3,0'); E.applyAugment(p, E.AUG_BY.h_alakazam); for (let i = 0; i < 3; i++) event(p, 'roundStart', {});
  ok(Math.round(combatOf(p, '3,0').ap - base.ap) === 12, 'Fuerza Creciente: +12 de poder tras 3 rondas'); }
ok(Object.values(E.AUG_BY).every(a => a.img), 'todos los aumentos tienen sprite');

// 11. Cada aumento de héroe mejora de verdad a su Pokémon (mismo combate y semilla, con y sin el aumento; media de 12 semillas)
{ const foe = { ag: [], m: {}, u: [['3,0', 'onix', 2, [], 0, 0], ['2,0', 'machop', 2, [], 0, 0], ['4,0', 'squirtle', 2, [], 0, 0], ['3,3', 'abra', 2, [], 0, 0], ['2,3', 'pichu', 2, [], 0, 0]] };
  const stat = (k, aug, f) => { let s = 0; for (let seed = 1; seed <= 12; seed++) { const { p } = fresh(); if (aug) { E.applyAugment(p, E.AUG_BY[aug]); for (let r = 0; r < 5; r++) E.augFire(p, 'roundStart', {}); }
      const ag = aug ? E.augSnap(p) : []; const me = { ag, m: {}, u: [['3,1', k, 2, [], 0, 0], ['2,0', 'onix', 2, [], 0, 0], ['4,0', 'machop', 2, [], 0, 0]] };
      const cb = E.createCombatSnap(me, foe, { s: 4, n: 2, type: 'pvp' }, { seed: seed * 101 }); const h = cb.units.find(u => u.side === 0 && u.d.key === k); const pre = f(h, cb, true); E.simulate(cb); s += pre != null ? pre : f(h, cb, false); } return s / 12; };
  const cmp = (id, k, f, label) => { const a = stat(k, null, f), b = stat(k, id, f); ok(b > a * 1.05, `${E.AUG_BY[id].name}: ${label} (${Math.round(a)} → ${Math.round(b)})`); };
  const dmg = (h, cb, pre) => pre ? null : (h.sDmg || 0), heal = (h, cb, pre) => pre ? null : (h.sHeal || 0);
  cmp('h_gengar', 'gastly', dmg, 'más daño de Gengar'); cmp('h_gyarados', 'magikarp', (h, cb, pre) => pre ? h.maxHp : null, 'más vida de Gyarados');
  cmp('h_clefable', 'cleffa', heal, 'más curación y escudos de Clefable (críticos)'); cmp('h_alakazam', 'abra', dmg, 'más daño de Alakazam (poder por lanzamiento)');
  cmp('h_raichu', 'pichu', dmg, 'más daño de Raichu'); cmp('h_machamp', 'machop', dmg, 'más daño de Machamp (velocidad creciente)');
  cmp('h_lucario', 'riolu', dmg, 'Lucario lanza dos veces: más daño'); cmp('h_charizard', 'charmander', dmg, 'más daño de Charizard');
  cmp('h_ditto', 'ditto', dmg, 'Ditto copia algo mejor'); }
{ const { G, p } = fresh(); G.round = { s: 3, n: 2 }; E.applyAugment(p, E.AUG_BY.h_lucario); ok(p.bench.filter(Boolean).some(u => u.defId === 'riolu' && u.star === 2), 'héroe en 3-2: el Pokémon llega a 2★');
  G.round = { s: 2, n: 1 }; let seen = 0; for (let i = 0; i < 300; i++) seen += E.augmentChoices(p, 'S').filter(id => id === 'h_dusknoir').length; ok(seen === 0, 'el héroe de coste 4 no sale en 2-1');
  G.round = { s: 3, n: 2 }; seen = 0; for (let i = 0; i < 300; i++) seen += E.augmentChoices(p, 'S').filter(id => id === 'h_dusknoir').length; ok(seen > 0, 'el héroe de coste 4 sí sale en 3-2'); }

// 12. Aumentos que dan cosas tras rondas, victorias o niveles: dan exactamente lo que dice su descripción
{ const items = p => p.items.length, units = p => p.bench.filter(Boolean).length, rs = (p, n) => { for (let i = 0; i < n; i++) event(p, 'roundStart', {}); };
  const take = (id, setup) => { const { p } = fresh(); if (setup) setup(p); E.applyAugment(p, E.AUG_BY[id]); return p; };
  { const p = take('huevo'); const u0 = units(p), i0 = items(p); rs(p, 5); ok(units(p) === u0 && items(p) === i0, 'Huevo: nada antes de 6 rondas'); rs(p, 1); ok(units(p) === u0 + 1 && p.bench.filter(Boolean).some(u => E.DEF[u.defId].cost === 4) && items(p) === i0 + 1, 'Huevo: a las 6 rondas, Pokémon de coste 4 y un componente'); rs(p, 6); ok(units(p) === u0 + 1, 'Huevo: una sola vez'); }
  { const p = take('paga_extra'); const g0 = p.gold; for (let i = 0; i < 12; i++) event(p, 'win', { pve: false }); event(p, 'win', { pve: true }); ok(p.gold - g0 === 20, `Paga Extra: 2 por victoria PvP hasta 20 (${p.gold - g0})`); }
  { const p = take('banco_rocket'); p.gold = 50; rs(p, 5); ok(p.gold === 50 - 10 + 15, `Banco del Team Rocket: 5 depósitos de 2 y devuelve 15 (${p.gold})`); rs(p, 3); ok(p.gold === 55, 'Banco: termina tras cobrar'); }
  { const p = take('ahorro_profesor'); p.gold = 35; const i0 = items(p); rs(p, 3); ok(items(p) === i0 + 1, 'Ahorro del Profesor: 3 rondas con 30+ → componente'); p.gold = 10; rs(p, 2); p.gold = 35; rs(p, 2); ok(items(p) === i0 + 1, 'Ahorro: bajar de 30 reinicia los puntos'); }
  { const p = take('investigacion_fin'); p.gold = 60; rs(p, 1); ok(p.freeRerolls === 0, 'Investigación Financiada: 5 puntos aún no'); rs(p, 1); ok(p.freeRerolls === 3, 'Investigación Financiada: 10 puntos → 3 tiendas gratis'); const u0 = units(p); rs(p, 3); ok(units(p) === u0 + 1, 'Investigación Financiada: 25 puntos → Pokémon de coste 4'); }
  { const p = take('inversion'); E.resolvePick(p, p.picks[0].id, 1); p.gold = 25; const g = []; for (let i = 0; i < 4; i++) { const g0 = p.gold; rs(p, 1); g.push(p.gold - g0); } ok(g.join() === '1,1,2,2', `Inversión: +1 por ronda y sube a +2 a las 3 rondas con 20+ (${g.join()})`); }
  { const p = take('camino_campeon'); const i0 = items(p), g0 = p.gold; event(p, 'levelUp', { level: 6 }); ok(items(p) === i0 + 1, 'Camino del Campeón: nivel 6 → componente'); event(p, 'levelUp', { level: 7 }); ok(p.gold === g0 + 5, 'Camino del Campeón: nivel 7 → 5 de oro');
    event(p, 'levelUp', { level: 8 }); ok(items(p) === i0 + 2 && E.FULL_KEYS.includes(p.items[p.items.length - 1]), 'Camino del Campeón: nivel 8 → objeto completo'); const u0 = units(p); event(p, 'levelUp', { level: 9 }); ok(units(p) === u0 + 1 && p.bench.filter(Boolean).some(u => E.DEF[u.defId].cost === 5), 'Camino del Campeón: nivel 9 → Pokémon de coste 5'); }
  { const p = take('insignias'); for (const l of [5, 6]) event(p, 'levelUp', { level: l }); ok(!p.picks.length, 'Insignias de Gimnasio: 2 insignias aún no'); event(p, 'levelUp', { level: 7 }); ok(p.picks.length === 1 && p.picks[0].opts.length === 3, 'Insignias de Gimnasio: con 3, elección de 3 premios'); }
  { const p = take('regreso'); const g0 = p.gold; for (let i = 0; i < 3; i++) event(p, 'lose', {}); event(p, 'win', {}); ok(p.gold - g0 === 9, `El Regreso: 3 derrotas → 9 de oro al ganar (${p.gold - g0})`); }
  { const p = take('supervivientes'); const g0 = p.gold; event(p, 'survive', { n: 7 }); ok(p.gold - g0 === 3, 'Equipo de Supervivientes: +1 por cada 2 en pie, máx. 3'); event(p, 'survive', { n: 3 }); ok(p.gold - g0 === 4, 'Equipo de Supervivientes: 3 en pie → +1'); }
  { const p = take('crecimiento'); const xp = p.xp + p.level * 100; event(p, 'win', { pve: false }); ok(p.xp + p.level * 100 > xp, 'Crecimiento Acelerado: EXP por victoria PvP'); }
  { const p = take('campeon_sinnoh'); const i0 = items(p); for (let i = 0; i < 3; i++) event(p, 'win', { pve: false }); ok(items(p) === i0 + 1, 'Campeón de Sinnoh: 3 victorias → componente'); for (let i = 0; i < 3; i++) event(p, 'win', { pve: false }); ok(items(p) === i0 + 2, 'Campeón de Sinnoh: 6 → objeto completo'); const b0 = p.mods.boardBonus; for (let i = 0; i < 3; i++) event(p, 'win', { pve: false }); ok(p.mods.boardBonus === b0 + 1, 'Campeón de Sinnoh: 9 → +1 espacio'); }
  { const p = take('coleccionista', q => { for (const k of ['charmander', 'squirtle', 'bulbasaur', 'pichu', 'abra', 'gastly']) E.addUnitToBench(q, E.makeInst(k)); }); const g0 = p.gold; rs(p, 1); ok(p.gold - g0 === 1, 'Coleccionista: 6 especies → +1 de oro'); }
  { const p = take('pacto_rocket'); ok(p.gold === 58, 'Pacto del Team Rocket: +8 de oro al elegirlo'); event(p, 'lose', { pve: false }); const g0 = p.gold; rs(p, 5); ok(g0 - p.gold === 15, `Pacto del Team Rocket: la derrota alarga la deuda a 5 rondas de 3 (${g0 - p.gold})`); rs(p, 2); ok(g0 - p.gold === 15, 'Pacto del Team Rocket: después ya no cobra'); }
  { const p = take('maestro'); const x0 = p.xp + p.level * 1000; p.gold = 10; E.applyAct(p, { t: 'xp' }); ok(p.xp + p.level * 1000 >= x0 + 5 || p.level > 1, 'Maestro Pokémon: la EXP comprada da 5'); E.addUnitToBench(p, E.makeInst('charmander')); p.board = { '0,0': E.makeInst('charmander') };
    event(p, 'levelUp', { level: 9 }); const pk = p.picks.find(x => x.src === 'maestro'); ok(pk && pk.opts.length >= 1, 'Maestro Pokémon: elección de sinergia al nivel 9'); const t = pk.opts[0].v, n0 = E.traitCounts(p)[t] || 0; E.resolvePick(p, pk.id, 0); ok((E.traitCounts(p)[t] || 0) === n0 + 1, 'Maestro Pokémon: la sinergia elegida cuenta 1 más'); }
  { const p = take('h_meowth'); p.board = { '0,0': E.makeInst('meowth') }; const g0 = p.gold; event(p, 'win', { pve: false }); ok(p.gold - g0 === 2, 'Día de Pago: +2 de oro al ganar con Meowth en el tablero'); }
  { const p = take('proyecto_mew'); p.board = { '0,0': E.makeInst('charmander'), '1,0': E.makeInst('squirtle'), '2,0': E.makeInst('bulbasaur'), '3,0': E.makeInst('pichu') }; const g0 = p.gold; event(p, 'combatStart', {}); ok(p.gold - g0 === 6, 'Proyecto Mew: 4 tipos → 6 de oro'); }
}

// 13. Mewtwo inestable: con 10 de energía (bajas + rondas en el tablero) se vuelve Mega Mewtwo Y para siempre, más fuerte y escalando
{ const { G, p } = fresh(); for (const q of G.players) q.board = {}; const u = E.makeInst('mewtwo'); u.kills = 6; p.board = { '3,3': u };
  for (let i = 0; i < 3; i++) E.mewtwoUnstable(); ok(u.defId === 'mewtwo' && u.mwR === 3, 'Mewtwo: 6 bajas + 3 rondas = 9, aún no');
  E.mewtwoUnstable(); ok(u.defId === 'megamewtwo' && E.DEF.megamewtwo.evoOf === 'mewtwo', 'Mewtwo: con 10 de energía se vuelve Mega Mewtwo Y');
  const back = E.unpackInst(E.packInst(Object.assign(E.makeInst('mewtwo'), { mwR: 4 }))); ok(back.mwR === 4, 'la energía de Mewtwo viaja por red');
  const snap = k => ({ ag: [], m: {}, u: [['3,3', k, 2, [], 0, 0], ['3,0', 'onix', 2, [], 0, 0]] }), foe = { ag: [], m: {}, u: [['3,0', 'machop', 2, [], 0, 0], ['2,0', 'onix', 2, [], 0, 0], ['3,3', 'abra', 2, [], 0, 0]] };
  const a = E.createCombatSnap(snap('mewtwo'), foe, { s: 5, n: 2 }, { seed: 9 }), b = E.createCombatSnap(snap('megamewtwo'), foe, { s: 5, n: 2 }, { seed: 9 });
  const ma = a.units.find(x => x.d.key === 'mewtwo'), mb = b.units.find(x => x.d.key === 'megamewtwo'); ok(mb.maxHp > ma.maxHp * 1.3 && mb.ad > ma.ad * 1.3, 'Mega Mewtwo: más vida y ataque');
  const hp0 = mb.maxHp, ap0 = mb.ap; E.simulate(b); ok(mb.castN > 0 && mb.maxHp > hp0 && mb.ap > ap0, `Mega Mewtwo: cada lanzamiento le da vida máxima y poder (${Math.round(hp0)}→${Math.round(mb.maxHp)} vida, ${ap0}→${Math.round(mb.ap)} poder)`); }

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
