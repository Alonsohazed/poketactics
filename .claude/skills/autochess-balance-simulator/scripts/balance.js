#!/usr/bin/env node
'use strict';
/*
 * Balance por ficha y por sinergia con el motor real (SIMULACIÓN, no partidas de jugadores).
 *
 *   node balance.js unit  --cost 3 --star 2 [--n 8] [--only absol,ponyta] [--json]
 *       Cada ficha del coste como carry con sus 3 objetos ideales (por rol) contra cada otra ficha del mismo coste y estrella,
 *       también con los suyos. Dos escenarios:
 *         · espejo: los dos equipos llevan los MISMOS 6 compañeros al azar (2★; 2 de coste 4, 2 de 3 y 2 de 2): solo cambia la ficha;
 *         · sinergia: cada uno con 6 compañeros del mismo perfil de costes que comparten sus sinergias (su composición natural).
 *       Y «malos»: la ficha con objetos de otro rol (p. ej. de tanque en un asesino) contra rivales con los suyos ideales.
 *       Objetivo: espejo y sinergia ≤ 60 %; con objetos malos bastante menos.
 *   node balance.js trait --trait Depredadores [--n 40] [--json]
 *       Tableros de nivel 8 con 2/4/6/8 fichas de la sinergia (el 8 lleva un emblema para el nivel prismático) y objetos en las 2
 *       mejores, contra tableros de referencia del mismo coste hueco por hueco pero sin la sinergia (objetos en 2 fichas). Tasa de victoria por escalón.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const ctx = { __SERVER__: true, module: { exports: {} }, console, setTimeout, clearTimeout, setInterval, clearInterval }; vm.createContext(ctx);
vm.runInContext(['augments.js', 'game.js'].map(f => fs.readFileSync(path.join(ROOT, 'public', f), 'utf8')).join('\n'), ctx, { filename: 'game.js' });
const E = ctx.module.exports;
const args = process.argv.slice(2), mode = args[0];
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const flag = k => args.includes('--' + k);

// Objetos ideales por rol y «malos» (los de un rol opuesto)
const BIS = { r: ['band', 'rage', 'sharp'], a: ['band', 'blood', 'sharp'], b: ['blood', 'titan', 'sturdy'], m: ['moon', 'specs', 'wise'], h: ['moon', 'soothe', 'energy'], t: ['vest', 'leftovers', 'helmet'] };
const BAD = { r: BIS.t, a: BIS.t, b: BIS.m, m: BIS.t, h: BIS.a, t: BIS.m };
const front = ['3,0', '2,0', '4,0', '1,0', '5,0', '0,0', '6,0', '3,1', '2,1', '4,1', '1,1', '5,1'], rear = ['3,3', '2,3', '4,3', '1,3', '5,3', '0,3', '6,3', '3,2', '2,2', '4,2'];
const isFront = k => ['t', 'b'].includes(E.DEF[k].role);
// lista: [clave, estrellas, objetos]; el primero es el carry
function snap(list) { const used = new Set(); return { m: {}, u: list.map(([k, s, it]) => { const c = (isFront(k) ? front : rear).find(x => !used.has(x)) || front.find(x => !used.has(x)); used.add(c); return [c, k, s, it || [], 0, 0, 0]; }) }; }
function fight(A, B, seed) { const cb = E.createCombatSnap(A, B, { s: 5, n: 2 }, { seed }); E.simulate(cb); return cb.winner; }
let rs = 1; const rnd = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const POOL = E.UNIT_LIST.filter(u => u.cost >= 2 && u.cost <= 4 && !u.traits.includes('Legendario'));
const pct = x => (x * 100).toFixed(0) + '%';

function mates(excl) { const out = []; PROFILE.forEach((c, i) => { const p = shuffle(POOL.filter(u => u.cost === c && !excl.includes(u.key) && !out.includes(u) && (i > 1 || isFront(u.key)))); if (p[0]) out.push(p[0]); }); return out.map(u => [u.key, 2, []]); }
const PROFILE = [4, 4, 3, 3, 2, 2];
function synMates(d) { const own = d.traits.filter(t => t !== 'Legendario'), share = u => u.traits.filter(t => own.includes(t)).length, out = [];
  PROFILE.forEach((c, i) => { const p = E.UNIT_LIST.filter(u => u.cost === c && u.key !== d.key && !out.includes(u) && !u.traits.includes('Legendario') && (i > 1 || isFront(u.key))).sort((a, b) => share(b) - share(a) || a.key.localeCompare(b.key)); if (p[0]) out.push(p[0]); });
  return out.map(u => [u.key, 2, []]); }

function modeUnit() {
  const cost = +opt('cost', 3), star = +opt('star', 2), n = +opt('n', 8), list = E.UNIT_LIST.filter(u => u.cost === cost && !E.DEF[u.key].evoOf), out = [];
  const only = opt('only'); for (const x of list) { if (only && !only.split(',').includes(x.key)) continue; let wm = 0, gm = 0, ws = 0, gs = 0, wb = 0, gb = 0; const XS = synMates(x);
    for (const y of list) { if (y === x) continue; const YS = synMates(y);
      for (let s = 1; s <= n; s++) { rs = s * 7919 + cost * 13 + star; const F = mates([x.key, y.key]);
        const side = s % 2, run = (A, B) => side ? fight(A, B, s * 104729) === 0 : fight(B, A, s * 104729) === 1;
        const XI = [x.key, star, BIS[x.role]], YI = [y.key, star, BIS[y.role]], XB = [x.key, star, BAD[x.role]];
        if (run(snap([XI, ...F]), snap([YI, ...F]))) wm++; gm++;
        if (run(snap([XI, ...XS]), snap([YI, ...YS]))) ws++; gs++;
        if (run(snap([XB, ...F]), snap([YI, ...F]))) wb++; gb++; } }
    out.push({ ficha: x.key, coste: cost, estrellas: star, rol: x.role, rasgos: x.traits.join('/'), espejo: wm / gm, sinergia: ws / gs, malos: wb / gb }); }
  out.sort((a, b) => Math.max(b.espejo, b.sinergia) - Math.max(a.espejo, a.sinergia));
  if (flag('json')) return console.log(JSON.stringify(out));
  console.log(`Coste ${cost} a ${star}★ con objetos ideales contra los demás de su coste · ${n} semillas por pareja (SIMULACIÓN)`);
  console.log('ficha       rol  espejo sinergia  malos');
  for (const r of out) console.log(`${r.ficha.padEnd(11)} ${r.rol}   ${pct(r.espejo).padStart(6)} ${pct(r.sinergia).padStart(8)} ${pct(r.malos).padStart(6)}${Math.max(r.espejo, r.sinergia) > .6 ? '  ← >60%' : ''}`);
}

function modeTrait() {
  const T = opt('trait', 'Depredadores'), n = +opt('n', 40), out = [];
  const members = E.UNIT_LIST.filter(u => u.traits.includes(T) && u.cost <= 4).sort((a, b) => b.cost - a.cost || a.key.localeCompare(b.key));
  const others = POOL.filter(u => !u.traits.includes(T));
  const pr = E.TRAITS[T].pr ? E.TRAITS[T].pr[0] : 0, ks = [...E.TRAITS[T].bp, ...(pr ? [pr] : [])];
  for (const k of ks) { let w = 0, g = 0; const prism = k === pr;
    for (let s = 1; s <= n; s++) { rs = s * 31337 + k;
      // los miembros de más coste primero; el nivel prismático necesita al menos un emblema (en fichas de fuera de la sinergia)
      const mem = shuffle(members).sort((a, b) => b.cost - a.cost).slice(0, Math.min(prism ? k - 1 : k, members.length, 7));
      const fill = shuffle(others).filter(u => !mem.includes(u)); const need = 8 - mem.length;
      const fr = fill.filter(u => isFront(u.key)).slice(0, Math.min(need, Math.max(0, 2 - mem.filter(u => isFront(u.key)).length))); const rest = fill.filter(u => !fr.includes(u)).slice(0, Math.max(0, need - fr.length));
      const team = [...mem, ...fr, ...rest].map(u => [u.key, 2, []]);
      const carries = team.filter(r => !isFront(r[0]) || E.DEF[r[0]].role === 'b' || E.DEF[r[0]].role === 'a').slice(0, 2); for (const r of carries) r[2] = BIS[E.DEF[r[0]].role].slice();
      let embs = k - mem.length; for (const host of team.filter(r => !mem.some(u => u.key === r[0]))) { if (embs <= 0) break; host[2] = [...host[2].slice(0, 2), 'emb_' + T]; embs--; }
      const usedR = new Set(); const refT = team.map(r => { const c = E.DEF[r[0]].cost, fr = isFront(r[0]); const p = shuffle(E.UNIT_LIST.filter(u => u.cost === c && !u.traits.includes(T) && !u.traits.includes('Legendario') && !usedR.has(u.key) && isFront(u.key) === fr)); const u = p[0] || shuffle(E.UNIT_LIST.filter(u => u.cost === c && !u.traits.includes(T) && !u.traits.includes('Legendario') && !usedR.has(u.key)))[0] || shuffle(E.UNIT_LIST.filter(u => u.cost <= 4 && !u.traits.includes(T) && !u.traits.includes('Legendario') && !usedR.has(u.key)))[0]; usedR.add(u.key); return [u.key, 2, []]; });
      for (const r of refT.filter(r => !isFront(r[0]) || ['a', 'b'].includes(E.DEF[r[0]].role)).slice(0, 2)) r[2] = BIS[E.DEF[r[0]].role].slice();
      const A = snap(team), B = snap(refT), side = s % 2; if (side ? fight(A, B, s * 7) === 0 : fight(B, A, s * 7) === 1) w++; g++; }
    out.push({ sinergia: T, fichas: k, victoria: w / g }); }
  if (flag('json')) return console.log(JSON.stringify(out));
  console.log(`${T}: tableros de nivel 8 con N fichas de la sinergia contra tableros al azar · ${n} combates por escalón (SIMULACIÓN)`);
  for (const r of out) console.log(`  ${String(r.fichas).padStart(2)} fichas: ${pct(r.victoria)}`);
}
if (mode === 'unit') modeUnit(); else if (mode === 'trait') modeTrait(); else { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(1); }
