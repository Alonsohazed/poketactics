#!/usr/bin/env node
'use strict';
/*
 * Valida los datos y recursos de Poké Tactics usando el propio motor (public/game.js).
 *   node .claude/skills/pokemon-data-asset-pipeline/scripts/validate.js          → solo datos (sin red)
 *   node .claude/skills/pokemon-data-asset-pipeline/scripts/validate.js --net    → además comprueba que cada sprite existe (HEAD)
 * Sale con código 1 si encuentra errores.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
// augments.js + game.js juntos, igual que server.js
const src = ['augments.js', 'game.js'].map(f => fs.readFileSync(path.join(ROOT, 'public', f), 'utf8')).join(String.fromCharCode(10));
const ctx = { __SERVER__: true, module: { exports: {} }, console, setTimeout, clearTimeout, setInterval, clearInterval };
vm.createContext(ctx);
vm.runInContext(src + '\n;module.exports.__extra={TRAITS,ROLE,KIND_NAME,ITEM_ART:typeof ITEM_ART!=="undefined"?ITEM_ART:null,BADGE_OF,EVOS,POOL_SIZE,SPRITE,ITEM_SPRITE,TRAINER_SPRITE,BADGE_SPRITE:typeof BADGE_SPRITE!=="undefined"?BADGE_SPRITE:null,GEN3:typeof GEN3!=="undefined"?GEN3:null};', ctx, { filename: 'game.js' });
const E = ctx.module.exports, X = E.__extra;

const errors = [], warns = [];
const err = m => errors.push(m), warn = m => warns.push(m);

// --- Pokémon ---
const keys = new Set();
for (const d of [...E.UNIT_LIST, ...X.EVOS]) {
  if (keys.has(d.key)) err(`clave repetida: ${d.key}`); keys.add(d.key);
  if (!X.ROLE[d.role]) err(`${d.key}: rol desconocido ${d.role}`);
  if (!(d.cost >= 1 && d.cost <= 5)) err(`${d.key}: coste fuera de 1-5`);
  for (const t of d.traits) if (!X.TRAITS[t]) err(`${d.key}: sinergia desconocida ${t}`);
  if (d.names.length !== d.dex.length) err(`${d.key}: ${d.names.length} nombres pero ${d.dex.length} números de Pokédex`);
  // abOf/nameOf/dexOf usan la última entrada para estrellas superiores: una línea de 2 formas repite su 2.ª forma a 3★
  if (d.ab.length < d.names.length) warn(`${d.key}: ${d.names.length} formas pero solo ${d.ab.length} habilidades`);
  for (const ab of d.ab) if (!X.KIND_NAME[ab[0]]) err(`${d.key}: tipo de habilidad desconocido ${ab[0]}`);
}
// cada sinergia con al menos un Pokémon y breakpoints alcanzables
for (const [t, T] of Object.entries(X.TRAITS)) {
  const n = E.UNIT_LIST.filter(u => u.traits.includes(t)).length;
  if (!n) warn(`sinergia ${t} sin ningún Pokémon`);
  const max = T.bp[T.bp.length - 1];
  if (n && max > n + 2) warn(`sinergia ${t}: breakpoint ${max} con solo ${n} Pokémon (+insignias)`);
  if (T.lv.length !== T.bp.length) err(`sinergia ${t}: ${T.bp.length} breakpoints pero ${T.lv.length} descripciones`);
}
// --- objetos ---
for (const [k, I] of Object.entries(E.ITEMS)) {
  if (I.from) for (const c of I.from) if (!E.ITEMS[c]) err(`objeto ${k}: componente desconocido ${c}`);
  if (I.emblem && !X.TRAITS[I.emblem]) err(`insignia ${k}: sinergia desconocida ${I.emblem}`);
  if (!I.emblem && X.ITEM_ART && !X.ITEM_ART[k]) warn(`objeto ${k} sin sprite (usará el emoji ${I.icon})`);
}
for (const a of E.BASIC) for (const b of [...E.BASIC, 'medal']) { const r = E.RECIPE[[a, b].sort().join('+')] || Object.values(E.ITEMS).find(I => I.from && I.from.slice().sort().join() === [a, b].sort().join()); if (!r) err(`receta ${a}+${b} sin resultado`); }
// --- aumentos ---
const ids = new Set();
for (const a of E.AUGS) { if (ids.has(a.id)) err(`aumento repetido: ${a.id}`); ids.add(a.id); if (!['S', 'G', 'P'].includes(a.tier)) err(`aumento ${a.id}: rareza ${a.tier}`); if (typeof a.apply !== 'function') err(`aumento ${a.id} sin apply`); }
for (const t of ['S', 'G', 'P']) if (E.AUGS.filter(a => a.tier === t).length < 6) warn(`pocos aumentos de rareza ${t} (se ofrecen 3 + 1 cambio)`);
// --- entrenadores ---
const tk = new Set(); for (const t of E.TRAINERS) { if (tk.has(t.key)) err(`entrenador repetido: ${t.key}`); tk.add(t.key); }

async function checkUrls() {
  const urls = new Map();
  for (const d of [...E.UNIT_LIST, ...X.EVOS]) for (const n of d.dex) urls.set(X.SPRITE(n), `sprite de ${d.key} (#${n})`);
  if (X.ITEM_ART) for (const [k, n] of Object.entries(X.ITEM_ART)) urls.set(X.ITEM_SPRITE(n), `objeto ${k}`);
  if (X.BADGE_SPRITE) for (const [c, [n]] of Object.entries(X.BADGE_OF)) { const p = X.BADGE_SPRITE(n); if (/^https?:/.test(p)) urls.set(p, `medalla de insignia ${c}`); else if (!fs.existsSync(path.join(__dirname, '..', '..', '..', '..', 'public', p))) errors.push(`medalla de insignia ${c}: falta public/${p}`); }
  for (const t of E.TRAINERS) urls.set(X.TRAINER_SPRITE(t.key), `entrenador ${t.key}`);
  if (X.GEN3) for (const n of [278, 380, 381]) urls.set(X.GEN3(n), `sprite del menú #${n}`);
  const list = [...urls], out = [];
  let i = 0;
  await Promise.all(Array.from({ length: 12 }, async () => {
    while (i < list.length) {
      const [u, what] = list[i++];
      try { const r = await fetch(u, { method: 'HEAD' }); if (!r.ok) out.push(`${what}: HTTP ${r.status} ${u}`); }
      catch (e) { out.push(`${what}: sin conexión (${e.message})`); }
    }
  }));
  out.forEach(err);
  return list.length;
}

(async () => {
  let n = 0;
  if (process.argv.includes('--net')) n = await checkUrls();
  console.log(`Pokémon: ${E.UNIT_LIST.length} (+${X.EVOS.length} evoluciones de Eevee) · objetos: ${Object.keys(E.ITEMS).length} · aumentos: ${E.AUGS.length} · entrenadores: ${E.TRAINERS.length}${n ? ` · URLs comprobadas: ${n}` : ''}`);
  for (const w of warns) console.log('AVISO  ' + w);
  for (const e of errors) console.log('ERROR  ' + e);
  console.log(errors.length ? `${errors.length} errores` : 'Sin errores');
  process.exit(errors.length ? 1 : 0);
})();
