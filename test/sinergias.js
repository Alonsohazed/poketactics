/* Pruebas rápidas de sinergias (sin navegador ni servidor): tipos, fusiones, nivel prismático y forja de insignias.
   Carga augments.js + game.js como cada sala del servidor. Uso: node test/sinergias.js */
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = ['augments.js', 'game.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8')).join('\n');
const ctx = { __SERVER__: true, module: { exports: {} }, console, setTimeout, clearTimeout, setInterval, clearInterval };
vm.createContext(ctx); vm.runInContext(src, ctx);
const E = ctx.module.exports;
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
    p.board = { '0,0': E.makeInst('charmander'), '1,0': E.makeInst('growlithe'), '2,0': E.makeInst('squirtle'), '3,0': E.makeInst('psyduck') };
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
{ const { G, p } = fresh(); G.round = { s: 2, n: 1 }; const u0 = p.bench.filter(Boolean).length; E.applyAugment(p, E.AUG_BY.reparto); ok(p.bench.filter(Boolean).length === u0 + 3, 'Reparto Pokémon: 3 Pokémon de coste 2');
  for (let i = 0; i < 6; i++) event(p, 'roundStart', {}); ok(p.bench.filter(Boolean).length === u0 + 6, 'Reparto Pokémon: 3 más a las 6 rondas'); }
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

console.log(`\n${checks - fails}/${checks} comprobaciones correctas`);
if (fails) { console.log('FALLO: pruebas de sinergias'); process.exit(1); }
console.log('OK: pruebas de sinergias superadas');
