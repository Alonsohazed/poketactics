#!/usr/bin/env node
'use strict';
/*
 * Mide lo ordenada que es una pelea (movimiento y objetivo), con el motor real: pasos por ficha, pasos dejando a un enemigo a su alcance
 * (y cuántos son de provocados), vueltas rápidas (volver a una casilla en menos de 1,5 s), giros bruscos, persecuciones de 4 pasos o más,
 * cambios de objetivo y empates de distancia al elegir objetivo. Mismas semillas: sirve para comparar antes y después.
 * Uso (desde la raíz del proyecto): node .claude/skills/autochess-balance-simulator/scripts/estructura.js [game.js] [n=600] [azar|guardian|demo]
 *   azar: equipos al azar · guardian: 2 Guardianes por equipo · demo: 3 empujadores contra 4 Guardianes
 * Para «antes», copia el game.js de un commit anterior (git show <commit>:public/game.js > /tmp/antes.js) y pásalo como primer argumento.
 * Resultados de SIMULACIÓN, no de partidas reales.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..'), gp = process.argv[2] || path.join(ROOT, 'public', 'game.js'), N = +(process.argv[3] || 600), MODE = process.argv[4] || 'azar';
const src = fs.readFileSync(path.join(ROOT, 'public/augments.js'), 'utf8') + '\n' + fs.readFileSync(gp, 'utf8');
const ctx = { __SERVER__: true, module: { exports: {} }, console, setTimeout, clearTimeout, setInterval, clearInterval }; vm.createContext(ctx); vm.runInContext(src, ctx); const E = ctx.module.exports;
const step = vm.runInContext('stepCombat', ctx), dU = vm.runInContext('dU', ctx), hexDist = vm.runInContext('hexDist', ctx);
const hxy = (c, r) => [c + .5 * (r & 1), r * .866];
const S = ctx.__S = { steps: 0, stepsR: 0, stepsM: 0, unitsR: 0, unitsM: 0, inRange: 0, inRangeT: 0, taunted: 0, loops: 0, sharp: 0, sw: 0, runs4: 0, rngTies: 0, loopsT: 0, loopsP: 0, sharpT: 0 };
// Cada paso que da una ficha pasa por nextStep: ahí se mira qué tenía alrededor y cómo se mueve
vm.runInContext(`(()=>{ const ns=nextStep, S=__S;
 nextStep=function(cb,u,t,...rest){ const s=ns(cb,u,t,...rest); if(s){ S.steps++; if(['r','m','h'].includes(u.role)) S.stepsR++; else S.stepsM++;
   const near=cb.units.some(e=>!e.dead&&e.side!==u.side&&!(e.stealth>0)&&dU(u,e)<=u.range); const tt=u.taunt&&t===u.taunt; if(tt) S.taunted++; if(near){ S.inRange++; if(tt) S.inRangeT++; }
   const h=u.__h||(u.__h=[]); const k=s[0]+','+s[1]; if(h.slice(-3).some(([k2,t2])=>k2===k&&cb.t-t2<1.5)){ S.loops++; if(tt) S.loopsT++; else if(u.plantT>0) S.loopsP++; }
   const v=[s[0]+.5*(s[1]&1)-(u.c+.5*(u.r&1)), (s[1]-u.r)*.866]; if(u.__v&&cb.t-u.__vt<1.2&&v[0]*u.__v[0]+v[1]*u.__v[1]<-.05){ S.sharp++; if(tt) S.sharpT++; } u.__v=v; u.__vt=cb.t;
   if(u.__rt===s[2]) { u.__rn++; if(u.__rn===4) S.runs4++; } else { u.__rt=s[2]; u.__rn=1; }
   h.push([u.c+','+u.r,cb.t]); } return s; };
})()`, ctx);
// Cuántas veces el azar decide un empate de distancia al elegir objetivo (en la versión de antes, nearestEnemy suma cb.rng()*.1)
vm.runInContext(`(()=>{ const ne=nearestEnemy, S=__S; nearestEnemy=function(cb,u,except,ok){ let b=1e9,n=0; for(const e of cb.units){ if(e.dead||e.side===u.side||e===except||e.stealth>0||(ok&&!ok(e))) continue; const d=dU(u,e); if(d<b){b=d;n=1;} else if(d===b) n++; } if(n>1) S.rngTies++; return ne(cb,u,except,ok); }; })()`, ctx);
const keys = E.UNIT_LIST.map(u => u.key), GUARD = E.UNIT_LIST.filter(u => u.traits.includes('Guardián')).map(u => u.key);
function team(seed) { let s = seed >>> 0; const rnd = n => (s = (s * 1103515245 + 12345) >>> 0) % n; const n = 6 + rnd(3), used = new Set(), cells = new Set(), u = [];
  const pick = list => { let k; do k = list[rnd(list.length)]; while (used.has(k)); used.add(k); return k; };
  const ks = []; if (MODE === 'guardian') { ks.push(pick(GUARD)); ks.push(pick(GUARD)); } while (ks.length < n) ks.push(pick(keys));
  for (const k of ks) { const back = ['r', 'm', 'h'].includes(E.DEF[k].role); let c; do c = rnd(7) + ',' + (back ? 2 + rnd(2) : rnd(2)); while (cells.has(c)); cells.add(c); u.push([c, k, 1 + (rnd(3) === 0 ? 1 : 0) + (rnd(12) === 0 ? 1 : 0), [], 0, 0]); }
  return { ag: [], m: {}, u }; }
const DA = { ag: [], m: {}, u: [['2,0', 'machop', 2], ['3,0', 'bulbasaur', 2], ['4,0', 'nidoranf', 1], ['1,0', 'charmander', 2], ['5,0', 'growlithe', 2], ['3,1', 'rattata', 2], ['2,3', 'pichu', 2], ['4,3', 'abra', 1]].map(r => [...r, [], 0, 0]) };
const DB = { ag: [], m: {}, u: [['3,0', 'squirtle', 2], ['2,0', 'voltorb', 2], ['4,0', 'hitmonchan', 1], ['1,0', 'vaporeon', 1], ['3,3', 'abra', 2], ['2,3', 'gastly', 2], ['4,3', 'pichu', 2]].map(r => [...r, [], 0, 0]) };
const deaths = {}, alive = {}; let w = [0, 0, 0], tsum = 0;
for (let i = 1; i <= N; i++) { const a = MODE === 'demo' ? DA : team(i * 7919), b = MODE === 'demo' ? DB : team(i * 104729 + 17);
  const cb = E.createCombatSnap(a, b, { s: 5, n: 2 }, { seed: i * 31 + 5 });
  for (const u of cb.units) if (['r', 'm', 'h'].includes(u.role)) S.unitsR++; else S.unitsM++;
  let g = 0; while (!cb.done && g++ < 2000) { const tg = cb.units.map(u => u.target); step(cb); cb.units.forEach((u, j) => { const p = tg[j]; if (!u.dead && p && u.target && u.target !== p && !p.dead && !(p.stealth > 0)) S.sw++; }); }
  w[cb.winner === 0 ? 0 : cb.winner === 1 ? 1 : 2]++; tsum += cb.t;
  for (const u of cb.units) { alive[u.role] = (alive[u.role] || 0) + 1; if (u.dead) deaths[u.role] = (deaths[u.role] || 0) + 1; } }
const U = S.unitsR + S.unitsM, f = x => +(x / N).toFixed(2);
console.log(JSON.stringify({ modo: MODE, combates: N,
  pasos_por_ficha: +(S.steps / U).toFixed(2), pasos_por_ficha_cuerpo: +(S.stepsM / S.unitsM).toFixed(2), pasos_por_ficha_distancia: +(S.stepsR / S.unitsR).toFixed(2),
  pasos_con_enemigo_a_su_alcance_por_combate: f(S.inRange), de_ellos_provocados: f(S.inRangeT), pasos_de_provocados_por_combate: f(S.taunted),
  vueltas_por_combate: f(S.loops), vueltas_provocados: f(S.loopsT), giros_bruscos_por_combate: f(S.sharp), giros_provocados: f(S.sharpT), persecuciones_4_pasos_por_combate: f(S.runs4),
  cambios_de_objetivo_por_combate: f(S.sw), empates_de_objetivo_por_combate: f(S.rngTies),
  victorias: w, duracion: +(tsum / N).toFixed(2), bajas_por_rol: Object.fromEntries(Object.keys(alive).sort().map(r => [r, ((deaths[r] || 0) / alive[r] * 100).toFixed(1)])) }));
