/* Pruebas del sistema de aumentos (sin navegador ni servidor): carga augments.js + game.js
   como hace cada sala del servidor y comprueba ofertas, efectos, rachas, emblemas, Caos,
   límites y que no haya bucles ni recursos infinitos. Uso: node test/augments.js */
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = ['augments.js', 'game.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8')).join('\n');
const ctx = { __SERVER__: true, module: { exports: {} }, console, setTimeout, clearTimeout, setInterval, clearInterval };
vm.createContext(ctx); vm.runInContext(src, ctx);
const E = ctx.module.exports;
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('FALLO:', msg); } };
const fresh = () => { E.newGame({ auto: true, diff: 'normal' }); const G = E.G; G.auto = false; const p = G.players[0]; p.isBot = false; p.gold = 50; return { G, p }; };
const AUGS = Object.values(E.AUG_BY);
const event = (p, evt, d) => E.augFire(p, evt, d || {});

// 1. Catálogo: cantidad, rarezas y datos completos
ok(AUGS.length >= 60, `hay ${AUGS.length} aumentos (mínimo 60)`);
for (const t of ['S', 'G', 'P']) ok(AUGS.filter(a => a.tier === t).length >= 12, `suficientes aumentos ${t}`);
for (const a of AUGS) ok(a.id && a.name && a.desc && a.icon && ['S', 'G', 'P'].includes(a.tier), `datos completos en ${a.id}`);
ok(new Set(AUGS.map(a => a.id)).size === AUGS.length, 'ids únicos');

// 2. Ofertas: 3 distintos, de la rareza pedida, sin repetidos, sin excluidos y cumpliendo requisitos
for (let k = 0; k < 300; k++) {
  const { G, p } = fresh(); const tier = ['S', 'G', 'P'][k % 3];
  if (k % 2) { E.addUnitToBench(p, E.makeInst('charmander')); E.addUnitToBench(p, E.makeInst('squirtle')); }
  const owned = E.augmentChoices(p, tier)[0]; if (owned) E.applyAugment(p, E.AUG_BY[owned]);
  const ch = E.augmentChoices(p, tier);
  ok(ch.length === 3, `oferta de 3 (${tier})`);
  ok(new Set(ch).size === ch.length, 'sin duplicados en la oferta');
  ok(ch.every(id => E.AUG_BY[id].tier === tier), 'rareza correcta');
  ok(!ch.some(id => p.augments.includes(id)), 'no ofrece los que ya tiene');
  const groups = new Set(p.augments.map(id => E.AUG_BY[id].ex).filter(Boolean));
  ok(!ch.some(id => E.AUG_BY[id].ex && groups.has(E.AUG_BY[id].ex)), 'respeta los grupos excluyentes');
  ok(ch.every(id => !E.AUG_BY[id].req || E.AUG_BY[id].req(p)), 'cumple requisitos');
}
// Reproducible con semilla
{ const { G, p } = fresh(); G.augSeed = 1234; G.augRng = null; const a = E.augmentChoices(p, 'G').join(); G.augRng = null; const b = E.augmentChoices(p, 'G').join(); ok(a === b, 'ofertas reproducibles con semilla'); }

// 3. Selección única
{ const { p } = fresh(); const a = E.AUG_BY.fondo_emergencia; ok(E.applyAugment(p, a) === true, 'se elige'); ok(E.applyAugment(p, a) === false, 'no se elige dos veces'); ok(p.augments.filter(x => x === 'fondo_emergencia').length === 1, 'registrado una vez'); }

// 4. Aplicación y caducidad de efectos temporales
{ const { p } = fresh(); E.applyAugment(p, E.AUG_BY.poder_prohibido); const seq = [];
  for (let i = 0; i < 7; i++) { const sn = E.augSnap(p).find(r => r[0] === 'poder_prohibido'); seq.push(sn ? sn[1] : 0); event(p, 'roundEnd', { won: true }); }
  ok(seq.join() === '5,4,3,2,1,0,0', 'Poder Prohibido: 3 combates de poder, 2 de debilidad y caduca (' + seq.join() + ')'); }

// 5. Rachas: cada premio una vez, aunque se repita el evento
{ const { p } = fresh(); E.applyAugment(p, E.AUG_BY.invicto); const g0 = p.gold;
  p.streak = 3; event(p, 'win', { pve: false }); event(p, 'win', { pve: false });
  ok(p.gold === g0 + 3, 'Campeón Invicto: 3 de oro una sola vez a racha 3');
  const it0 = p.items.length; p.streak = 5; event(p, 'win', {}); ok(p.items.length === it0 + 1, 'componente a racha 5'); }
{ const { p } = fresh(); E.applyAugment(p, E.AUG_BY.regreso); for (let i = 0; i < 10; i++) event(p, 'lose', {}); const g0 = p.gold; event(p, 'win', {}); ok(p.gold - g0 === 18, 'El Regreso: reserva con tope de 18'); event(p, 'win', {}); ok(p.gold - g0 === 18, 'la reserva se cobra una vez'); }

// 6. Emblemas: 3 distintos, se asignan y la sinergia no cuenta doble
{ const { p } = fresh(); E.applyAugment(p, E.AUG_BY.emb_elemental); const pk = p.picks[0];
  ok(pk && pk.opts.length === 3 && new Set(pk.opts.map(o => o.v)).size === 3, '3 emblemas distintos');
  const v = pk.opts[0].v, t = v.slice(3); ok(E.resolvePick(p, pk.id, 0).ok, 'se elige un emblema'); ok(p.items.includes('emb_' + t), 'recibe el emblema');
  ok(E.resolvePick(p, pk.id, 0).ok === false, 'la misma elección no se resuelve dos veces');
  const host = Object.keys(E.DEF).find(k => !E.DEF[k].evoOf && E.DEF[k].cost && !E.DEF[k].traits.includes(t)); const u = E.makeInst(host); p.board['0,0'] = u;
  const before = E.traitCounts(p)[t] || 0; ok(E.addItemToUnit(u, 'emb_' + t).ok, 'el emblema se equipa'); ok((E.traitCounts(p)[t] || 0) === before + 1, 'el emblema añade la sinergia');
  const nat = Object.keys(E.DEF).find(k => E.DEF[k].traits.includes(t) && E.DEF[k].cost); const u2 = E.makeInst(nat);
  ok(E.addItemToUnit(u2, 'emb_' + t).ok === false, 'no se equipa a quien ya tiene esa sinergia'); }

// 7. Umbrales de sinergias según la composición real
{ const { p } = fresh(); p.board = {}; p.board['0,0'] = E.makeInst('charmander'); p.board['1,0'] = E.makeInst('growlithe');
  ok((E.traitTiers(p).Fuego || 0) === 1, 'Fuego activa su primer nivel con 2'); p.board['2,0'] = E.makeInst('charmander'); ok(E.traitCounts(p).Fuego === 2, 'la misma especie no cuenta dos veces'); }

// 8. Llamada al Caos (prismática) y Eco del Caos (oro): solo en 4-2, premio grande al azar, sin maldiciones
for (const [id, big] of [['llamada_caos', true], ['eco_caos', false]]) {
  const seen = new Set(); let minValue = 1e9;
  for (let i = 0; i < 300; i++) { const { G, p } = fresh(); G.round = { s: 4, n: 2 }; const g0 = p.gold, l0 = p.level, x0 = p.xp, r0 = p.freeRerolls, i0 = p.items.length, u0 = p.bench.filter(Boolean).length, hp0 = p.hp;
    E.applyAugment(p, E.AUG_BY[id]); const pk0 = p.picks.length; for (const q of p.picks.slice()) E.resolvePick(p, q.id, 0); const st = p.augSt[id]; seen.add(st.last);
    ok(p.hp === hp0, 'el Caos ya no quita vida'); ok(p.reveals && p.reveals.length > 0, 'el resultado se muestra en una ventana');
    const v = (p.gold - g0) + (p.level - l0) * 8 + (p.xp !== x0 || p.level !== l0 ? 10 : 0) + (p.freeRerolls - r0) + (p.items.length - i0) * 10 + p.items.filter(k => /^rad_/.test(k)).length * 10 + (p.bench.filter(Boolean).length - u0) * 10 + (st.egg ? 30 : 0); minValue = Math.min(minValue, v); }
  ok(seen.size === 9, `${id}: salen los 9 resultados (${seen.size})`); ok(minValue >= (big ? 20 : 10), `${id}: ningún resultado es pequeño (${minValue})`);
  const { G, p } = fresh(); G.round = { s: 3, n: 2 }; let offered = 0; for (let i = 0; i < 300; i++) offered += E.augmentChoices(p, E.AUG_BY[id].tier).includes(id) ? 1 : 0; ok(offered === 0, `${id}: no sale antes de 4-2`); }
{ let hatched = false; for (let k = 0; k < 300 && !hatched; k++) { const r = fresh(); r.G.round = { s: 4, n: 2 }; E.applyAugment(r.p, E.AUG_BY.llamada_caos); for (const q of r.p.picks.slice()) E.resolvePick(r.p, q.id, 0);
    if (r.p.augSt.llamada_caos.egg) { const u0 = r.p.bench.filter(Boolean).length, g0 = r.p.gold; for (let i = 0; i < 3; i++) E.augFire(r.p, 'roundStart', {}); hatched = r.p.bench.filter(Boolean).length === u0 + 2 && r.p.gold - g0 === 15; } }
  ok(hatched, 'Huevo de Oro: a las 3 rondas, 2 Legendarios y 15 de oro'); }

// 9. Combinaciones extremas: sin bucles, sin oro infinito y sin duplicar unidades
{ const { G, p } = fresh(); for (const a of AUGS) E.applyAugment(p, a); for (const q of p.picks.slice()) E.resolvePick(p, q.id, 0);
  const evts = ['roundStart', 'combatStart', 'win', 'lose', 'roundEnd', 'buy', 'sell', 'reroll', 'gain', 'starUp', 'levelUp', 'kills', 'survive', 'damaged'];
  const t0 = Date.now(); let err = null;
  try { for (let i = 0; i < 3000; i++) { const e = evts[i % evts.length]; p.gold = Math.min(p.gold, 400); event(p, e, { key: 'charmander', star: 2, cost: 1, pve: false, n: 3, level: 9, dup: true }); for (const q of p.picks.slice()) E.resolvePick(p, q.id, 0); } } catch (e) { err = e; }
  ok(!err, 'todos los aumentos juntos no lanzan errores ' + (err ? err.stack : ''));
  ok(Date.now() - t0 < 20000, 'sin bucles infinitos');
  const st = p.augSt; ok((st.cadena_evo.n || 0) <= 15, 'Cadena de Evolución con tope'); }
{ const { G, p } = fresh(); E.addUnitToBench(p, E.makeInst('pichu')); E.addUnitToBench(p, E.makeInst('pichu')); E.addUnitToBench(p, E.makeInst('abra')); E.applyAugment(p, E.AUG_BY.crianza);
  const pool0 = G.pool.pichu; event(p, 'roundStart', {}); ok(G.pool.pichu === pool0 - 1, 'Crianza: copia del Pokémon barato con más copias, sacada del pool');
  for (let i = 0; i < 6; i++) event(p, 'roundStart', {}); ok(p.augSt.crianza.n === 7, 'Crianza: una copia cada ronda, sin tope'); }
{ // Reroll + economía + efectos al comprar: la reserva de unidades del juego no crece de la nada
  const { G, p } = fresh(); ['crianza', 'llamada_clan', 'investigacion_campo'].forEach(id => E.applyAugment(p, E.AUG_BY[id]));
  const total = () => Object.values(G.pool).reduce((a, b) => a + b, 0) + G.players.reduce((a, q) => a + [...Object.values(q.board), ...q.bench.filter(Boolean)].reduce((s, u) => s + Math.pow(3, u.star - 1), 0) + q.shop.filter(Boolean).length, 0);
  const t0 = total(); p.gold = 300;
  for (let i = 0; i < 80; i++) { E.reroll(p); for (let j = 0; j < 5; j++) if (p.shop[j]) E.buy(p, j); const loc = p.bench.findIndex(Boolean); if (loc >= 0 && i % 3 === 0) E.sellAt(p, { i: loc }); for (const q of p.picks.slice()) E.resolvePick(p, q.id, 0); }
  ok(total() <= t0, `no se crean unidades de la nada (${t0} → ${total()})`); }

// 10. Estados incompletos: sin aumentos, elecciones inexistentes, Pokémon que ya no están
{ const { p } = fresh(); ok(E.resolvePick(p, 999, 0).ok === false, 'elección inexistente'); event(p, 'win', {});
  E.applyAugment(p, E.AUG_BY.rivalidad); p.board = {}; let err = null; try { E.augSnap(p); event(p, 'win', {}); } catch (e) { err = e; } ok(!err, 'Rivalidad sin Pokémon en el tablero no falla'); }

// 11. Combates deterministas con efectos de aumentos (los clientes reconstruyen el mismo combate)
{ const { G, p } = fresh(); p.board = { '0,0': E.makeInst('charmander'), '1,1': E.makeInst('abra'), '3,3': E.makeInst('cleffa') };
  ['formacion_kanto', 'relampago', 'depredadores', 'cazadores', 'impulso', 'entreno_diario'].forEach(id => E.applyAugment(p, E.AUG_BY[id])); event(p, 'win', {}); event(p, 'win', {});
  const q = G.players[1]; q.board = { '2,0': E.makeInst('geodude'), '4,1': E.makeInst('machop') };
  const sa = E.teamSnap(p), sb = E.teamSnap(q); const sa2 = JSON.parse(JSON.stringify(sa)), sb2 = JSON.parse(JSON.stringify(sb));
  const c1 = E.createCombatSnap(sa, sb, G.round || { s: 2, n: 2 }, { seed: 77 }), c2 = E.createCombatSnap(sa2, sb2, G.round || { s: 2, n: 2 }, { seed: 77 }); E.simulate(c1); E.simulate(c2);
  ok(c1.winner === c2.winner && Math.abs(c1.t - c2.t) < 1e-9 && c1.gold.join() === c2.gold.join(), 'mismo combate con la misma semilla (también tras pasar por JSON)'); }

// 12. Partidas completas con bots que eligen aumentos (el flujo automático real del juego)
(async () => {
  let err = null, augs = 0;
  try { for (let g = 0; g < 4; g++) { E.newGame({ auto: true, diff: ['facil', 'normal', 'dificil'][g % 3] }); const t0 = Date.now(); while (!E.G.over && Date.now() - t0 < 60000) await new Promise(r => setTimeout(r, 5)); ok(E.G.over, 'la partida termina'); augs += E.G.players.reduce((s, q) => s + q.augments.length, 0); } } catch (e) { err = e; }
  ok(!err, 'partidas completas sin errores ' + (err ? err.stack : '')); ok(augs > 0, 'los bots eligen aumentos');
  console.log(`${checks - fails}/${checks} comprobaciones correctas`);
  if (fails) { console.log('ERROR: hay pruebas de aumentos que fallan'); process.exit(1); }
  console.log('OK: pruebas de aumentos superadas'); process.exit(0);
})();
