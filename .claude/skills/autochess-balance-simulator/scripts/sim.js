#!/usr/bin/env node
'use strict';
/*
 * Simulador de balance de Poké Tactics. Usa el MISMO motor que el juego (public/game.js cargado en un vm),
 * así que los combates son idénticos a los reales. Los resultados son de SIMULACIÓN, no de partidas de jugadores.
 *
 * Uso (desde la raíz del proyecto):
 *   node .claude/skills/autochess-balance-simulator/scripts/sim.js units [--cost 3] [--star 1] [--n 40]
 *       Cada Pokémon contra todos los de su mismo coste (1 contra 1). Ranking por tasa de victoria.
 *   node .claude/skills/autochess-balance-simulator/scripts/sim.js comp --a "charmander:2,growlithe:2" --b "squirtle:2,bulbasaur:2" [--n 200]
 *       Dos composiciones (clave:estrellas[:objeto+objeto], ...). Tasa de victoria, duración y supervivientes.
 *   node .claude/skills/autochess-balance-simulator/scripts/sim.js games [--n 30] [--diff normal]
 *       Partidas completas de 8 bots. Puesto medio por aumento y por sinergia principal.
 *   node .claude/skills/autochess-balance-simulator/scripts/sim.js carry [--cost 5] [--star 2] [--n 20] [--only kyogre]
 *       Cada Pokémon del coste como carry de un equipo (4 fichas de coste 3-4 a 2★) contra los demás de su coste,
 *       con/sin sinergias y con/sin sus 3 objetos recomendados.
 *   Añade --json para salida en JSON.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
function loadEngine() {
  const ctx = { __SERVER__: true, module: { exports: {} }, console, setTimeout, clearTimeout, setInterval, clearInterval };
  vm.createContext(ctx);
  // augments.js + game.js juntos, igual que server.js
  const src = ['augments.js', 'game.js'].map(f => fs.readFileSync(path.join(ROOT, 'public', f), 'utf8')).join(String.fromCharCode(10));
  vm.runInContext(src, ctx, { filename: 'game.js' });
  return ctx.module.exports;
}
const E = loadEngine();

const args = process.argv.slice(2);
const mode = args[0];
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const flag = k => args.includes('--' + k);
// --set "kyogre.mm=20,kyogre.big=1.5": cambia parámetros de habilidad solo en memoria, para probar valores sin tocar game.js
for (const kv of (opt('set', '') || '').split(',').filter(Boolean)) { const [path, v] = kv.split('='), [k, prm] = path.split('.'); if (!E.DEF[k]) throw new Error(`Pokémon desconocido: ${k}`); for (const ab of E.DEF[k].ab) ab[2][prm] = +v; }
const R = { s: +opt('stage', 4), n: 2 }; // ronda usada para los combates (afecta a nada salvo PvE)
const pct = x => (x * 100).toFixed(1) + '%';

// "clave:estrellas[:obj+obj]" → instantánea de equipo como la de teamSnap()
function compSnap(spec) {
  const cells = ['3,0', '2,0', '4,0', '1,0', '5,0', '3,1', '2,1', '4,1', '1,1', '5,1'];
  const u = spec.split(',').map(s => s.trim()).filter(Boolean).map((s, i) => {
    const [k, st = '1', it = ''] = s.split(':');
    if (!E.DEF[k]) throw new Error(`Pokémon desconocido: ${k}`);
    const items = it ? it.split('+').filter(x => E.ITEMS[x]) : [];
    // tanques y cuerpo a cuerpo delante (fila 0 = la más cercana al rival), el resto detrás
    const back = ['r', 'm', 'h'].includes(E.DEF[k].role);
    return [back ? '3,3' : cells[i], k, Math.min(3, Math.max(1, +st)), items, 0, 0, back];
  });
  // reparte posiciones sin repetir casilla
  const used = new Set(), front = ['3,0', '2,0', '4,0', '1,0', '5,0', '0,0', '6,0', '3,1', '2,1', '4,1'], rear = ['3,3', '2,3', '4,3', '1,3', '5,3', '0,3', '6,3', '3,2', '2,2', '4,2'];
  for (const row of u) { const list = row[6] ? rear : front; row[0] = list.find(c => !used.has(c)); used.add(row[0]); row.length = 6; }
  return { m: {}, u };
}
function fight(a, b, seed) {
  const cb = E.createCombatSnap(a, b, R, { seed });
  E.simulate(cb);
  return { w: cb.winner, t: cb.t, sa: cb.units.filter(x => !x.dead && x.side === 0).length, sb: cb.units.filter(x => !x.dead && x.side === 1).length };
}

function modeUnits() {
  const n = +opt('n', 40), star = +opt('star', 1), cost = opt('cost') ? +opt('cost') : null;
  const out = [];
  for (const c of cost ? [cost] : [1, 2, 3, 4, 5]) {
    const list = E.UNIT_LIST.filter(u => u.cost === c);
    for (const a of list) {
      let w = 0, g = 0;
      for (const b of list) { if (a === b) continue; for (let s = 1; s <= n; s++) { const r = fight(compSnap(`${a.key}:${star}`), compSnap(`${b.key}:${star}`), s * 7919); g++; if (r.w === 0) w++; } }
      out.push({ coste: c, pokemon: a.key, rol: a.role, rasgos: a.traits.join('/'), victorias: g ? w / g : 0, combates: g });
    }
  }
  out.sort((x, y) => x.coste - y.coste || y.victorias - x.victorias);
  if (flag('json')) return console.log(JSON.stringify(out, null, 2));
  console.log(`1 contra 1 dentro de cada coste · ${star}★ · ${n} semillas por emparejamiento (SIMULACIÓN)`);
  let last = 0;
  for (const r of out) { if (r.coste !== last) { console.log(`\n— Coste ${r.coste} —`); last = r.coste; } console.log(`${r.pokemon.padEnd(12)} ${r.rol}  ${pct(r.victorias).padStart(6)}  ${r.rasgos}`); }
}

function modeComp() {
  const a = compSnap(opt('a', '')), b = compSnap(opt('b', '')), n = +opt('n', 200);
  let wa = 0, wb = 0, dr = 0, t = 0, sa = 0, sb = 0;
  for (let s = 1; s <= n; s++) { const r = fight(a, b, s * 104729); if (r.w === 0) { wa++; sa += r.sa; } else if (r.w === 1) { wb++; sb += r.sb; } else dr++; t += r.t; }
  const res = { combates: n, victoriasA: wa / n, victoriasB: wb / n, empates: dr / n, duracionMedia: +(t / n).toFixed(2), supervivientesA: wa ? +(sa / wa).toFixed(2) : 0, supervivientesB: wb ? +(sb / wb).toFixed(2) : 0 };
  if (flag('json')) return console.log(JSON.stringify(res, null, 2));
  console.log(`A: ${opt('a')}\nB: ${opt('b')}\n${n} combates (SIMULACIÓN)\nA gana ${pct(res.victoriasA)} · B gana ${pct(res.victoriasB)} · empates ${pct(res.empates)}\nDuración media ${res.duracionMedia}s · supervivientes A ${res.supervivientesA} · B ${res.supervivientesB}`);
}

async function modeGames() {
  const n = +opt('n', 30), diff = opt('diff', 'normal');
  const byAug = {}, byTrait = {}, places = [];
  for (let k = 0; k < n; k++) {
    E.newGame({ auto: true, diff });
    const G0 = E.G;
    await new Promise(res => { const t0 = Date.now(); const iv = setInterval(() => { if (E.G !== G0 || G0.over || Date.now() - t0 > 60000) { clearInterval(iv); res(); } }, 5); });
    // La partida automática acaba cuando cae el jugador 0: los que siguen vivos se ordenan por vida
    const alive = G0.players.filter(p => !p.place).sort((a, b) => b.hp - a.hp); alive.forEach((p, i) => { p.place = i + 1; });
    for (const p of G0.players) {
      const place = p.place; places.push(place);
      for (const a of p.augments) (byAug[a] = byAug[a] || []).push(place);
      const c = {}; for (const u of Object.values(p.board)) for (const t of E.DEF[u.defId].traits) c[t] = (c[t] || 0) + 1;
      const top = Object.entries(c).filter(e => e[0] !== 'Legendario').sort((x, y) => y[1] - x[1])[0];
      if (top) (byTrait[top[0]] = byTrait[top[0]] || []).push(place);
    }
  }
  const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
  const table = o => Object.entries(o).map(([k, v]) => ({ k, puestoMedio: +avg(v).toFixed(2), top4: +(v.filter(x => x <= 4).length / v.length).toFixed(3), muestras: v.length })).sort((x, y) => x.puestoMedio - y.puestoMedio);
  const res = { partidas: n, dificultad: diff, aumentos: table(byAug), sinergiaPrincipal: table(byTrait) };
  if (flag('json')) return console.log(JSON.stringify(res, null, 2));
  console.log(`${n} partidas de 8 bots (${diff}) · SIMULACIÓN, no partidas reales. Puesto medio esperado al azar: 4.5`);
  console.log('\nAumentos (mejor puesto medio arriba):'); for (const r of res.aumentos) console.log(`  ${r.k.padEnd(12)} ${String(r.puestoMedio).padStart(5)}  top4 ${pct(r.top4).padStart(6)}  n=${r.muestras}`);
  console.log('\nSinergia principal del tablero final:'); for (const r of res.sinergiaPrincipal) console.log(`  ${r.k.padEnd(12)} ${String(r.puestoMedio).padStart(5)}  top4 ${pct(r.top4).padStart(6)}  n=${r.muestras}`);
  console.log('\nOjo: muestras < 20 no son fiables; los bots no juegan como humanos.');
  process.exit(0);
}

// Cada Pokémon del coste pedido (2★ por defecto) como carry de un equipo de 4 fichas de coste 3-4 a 2★, contra todos los demás del mismo coste.
// 4 escenarios: con/sin sinergias (compañeros que comparten sus rasgos o que no comparten ninguno) × con/sin sus 3 objetos recomendados (GLOVE_BIS del rol).
const BIS = { r: ['band', 'rage', 'sharp'], a: ['band', 'blood', 'sharp'], b: ['blood', 'titan', 'sturdy'], m: ['moon', 'specs', 'wise'], h: ['moon', 'soothe', 'energy'], t: ['vest', 'leftovers', 'helmet'] };
function carryTeam(d, syn, items, star) {
  const own = d.traits.filter(t => t !== 'Legendario'), pool = E.UNIT_LIST.filter(u => (u.cost === 3 || u.cost === 4) && !u.traits.includes('Legendario') && !E.DEF[u.key].evoOf);
  const share = u => u.traits.filter(t => own.includes(t)).length, front = u => ['t', 'b'].includes(u.role), pick = [];
  const take = (ok, n) => { for (const u of pool) { if (pick.length >= n) break; if (!pick.includes(u) && ok(u)) pick.push(u); } };
  if (syn) { pool.sort((a, b) => share(b) - share(a) || b.cost - a.cost || a.key.localeCompare(b.key)); take(u => front(u) && share(u) > 0, 1); take(u => front(u), 1); take(() => true, 4); }
  else { const free = u => share(u) === 0 && pick.every(p => !p.traits.some(t => u.traits.includes(t))); take(u => front(u) && free(u), 2); take(free, 4); take(u => share(u) === 0, 4); }
  return compSnap([`${d.key}:${star}${items ? ':' + BIS[d.role].join('+') : ''}`, ...pick.map(u => `${u.key}:2`)].join(','));
}
function modeCarry() {
  const n = +opt('n', 20), star = +opt('star', 2), cost = +opt('cost', 5), only = opt('only');
  const list = E.UNIT_LIST.filter(u => u.cost === cost && !E.DEF[u.key].evoOf), cfg = [['sinSin', 0, 0], ['sinObj', 1, 0], ['objSin', 0, 1], ['ambos', 1, 1]], out = [];
  for (const a of list) { if (only && !only.split(',').includes(a.key)) continue; const row = { pokemon: a.key, rol: a.role, rasgos: a.traits.join('/') };
    for (const [name, syn, it] of cfg) { let w = 0, g = 0, t = 0; const A = carryTeam(a, syn, it, star);
      for (const b of list) { if (a === b) continue; const B = carryTeam(b, syn, it, star);
        for (let s = 1; s <= n; s++) { const r = s % 2 ? fight(A, B, s * 7919) : fight(B, A, s * 7919); g++; t += r.t; if (r.w === (s % 2 ? 0 : 1)) w++; } }
      row[name] = g ? w / g : 0; row['t_' + name] = +(t / g).toFixed(1); }
    out.push(row); }
  out.sort((x, y) => y.ambos - x.ambos);
  if (flag('json')) return console.log(JSON.stringify(out, null, 2));
  console.log(`Coste ${cost} como carry (${star}★) + 4 fichas de coste 3-4 a 2★ contra los demás de su coste · ${n} semillas por emparejamiento (SIMULACIÓN)`);
  console.log(`${'pokemon'.padEnd(11)} rol  ${'nada'.padStart(6)} ${'sinerg'.padStart(6)} ${'objet'.padStart(6)} ${'ambos'.padStart(6)}   duración media (s)`);
  for (const r of out) console.log(`${r.pokemon.padEnd(11)} ${r.rol}   ${pct(r.sinSin).padStart(6)} ${pct(r.sinObj).padStart(6)} ${pct(r.objSin).padStart(6)} ${pct(r.ambos).padStart(6)}   ${r.t_sinSin}/${r.t_sinObj}/${r.t_objSin}/${r.t_ambos}`);
}

if (mode === 'units') modeUnits();
else if (mode === 'comp') modeComp();
else if (mode === 'carry') modeCarry();
else if (mode === 'games') modeGames();
else { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(1); }
