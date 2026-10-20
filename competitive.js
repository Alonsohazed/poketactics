'use strict';
/*
 * Sistema competitivo de Poké Tactics (solo servidor, funciones puras y deterministas).
 * - Dos MMR independientes: normal (dificultad adaptativa) y clasificatoria (rango).
 * - Ligas de la imagen de referencia (Hierro → Retador). De Hierro a Diamante hay 5 divisiones (V a I) de 100 LP;
 *   Maestro, Gran Maestro y Retador no tienen divisiones (son escalones de LP dentro de la cumbre).
 * - El progreso visible se guarda como «escalera»: LP totales desde Hierro V con 0 LP. Así ascender, descender y
 *   pasar el exceso de LP de una división a otra es una suma, sin estados imposibles.
 * - 3 partidas de posicionamiento antes de revelar el rango; caramelos por puesto; todo se calcula aquí.
 */
const CFG = {
  START_MMR: 1000,            // MMR inicial de los dos modos
  DIV_LP: 100,                // LP por división
  DIVS: 5,                    // divisiones por liga (V, IV, III, II, I)
  PLACEMENTS: 3,              // partidas de posicionamiento
  CANDY: [100, 95, 90, 85, 80, 75, 70, 65], // caramelos por puesto (1.º a 8.º)
  // Rango inicial tras posicionarse: como mínimo Hierro III y como máximo Oro IV (entrada tipo Bronce/Plata)
  PLACE_MIN: 200, PLACE_MAX: 1600,
  // LP base por puesto (1.º a 8.º): el 1.º gana mucho, 2.º-4.º ganan poco, 5.º-8.º pierden (más cuanto más abajo)
  LP_BASE: [42, 28, 18, 8, -12, -22, -32, -45],
  LP_MIN: -50, LP_MAX: 55,
  NORMAL_K: [44, 24], RANKED_K: [60, 28], PLACEMENT_K: 90, // K inicial y final (baja con las partidas jugadas)
};
// Ligas (orden de la imagen 9). apex: sin divisiones; at: escalera mínima para entrar
const LEAGUES = [
  { key: 'iron', name: 'Hierro', color: '#8b7d78' }, { key: 'bronze', name: 'Bronce', color: '#c0784f' },
  { key: 'silver', name: 'Plata', color: '#a9b6c8' }, { key: 'gold', name: 'Oro', color: '#e0b04a' },
  { key: 'platinum', name: 'Platino', color: '#4fc1c9' }, { key: 'emerald', name: 'Esmeralda', color: '#37b26c' },
  { key: 'diamond', name: 'Diamante', color: '#6a8dff' },
  { key: 'master', name: 'Maestro', color: '#b05cff', apex: true, at: 3500 },
  { key: 'grandmaster', name: 'Gran Maestro', color: '#ff5a4a', apex: true, at: 3700 },
  { key: 'challenger', name: 'Retador', color: '#ffd76a', apex: true, at: 4000 },
];
const APEX = 3500; // escalera de Maestro con 0 LP
const ROMAN = ['V', 'IV', 'III', 'II', 'I'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Escalera → rango visible {league, name, div ('I'..'V' o ''), lp, ladder}
function rankOf(ladder) {
  const L = Math.max(0, Math.round(ladder));
  if (L >= APEX) { let i = LEAGUES.length - 1; while (L < LEAGUES[i].at) i--; return { league: LEAGUES[i].key, name: LEAGUES[i].name, div: '', lp: L - APEX, ladder: L, apex: true }; }
  const per = CFG.DIV_LP * CFG.DIVS, t = Math.floor(L / per), d = Math.floor((L % per) / CFG.DIV_LP);
  return { league: LEAGUES[t].key, name: LEAGUES[t].name, div: ROMAN[d], lp: L % CFG.DIV_LP, ladder: L, apex: false };
}
const rankLabel = r => r ? `${r.name}${r.div ? ' ' + r.div : ''} · ${r.lp} LP` : 'Sin clasificar';
// MMR equivalente a un rango visible (para comparar habilidad y rango) y su inversa
const mmrOfLadder = L => 700 + L * .36;
const ladderOfMMR = m => (m - 700) / .36;

// Elo por puestos: cada rival es un duelo (gano si quedo por encima). Los bots cuentan con su MMR estimado.
function eloDelta(mmr, place, opps, K) {
  if (!opps.length) return 0; let s = 0;
  for (const o of opps) { const E = 1 / (1 + Math.pow(10, (o.mmr - mmr) / 400)), S = place < o.place ? 1 : place > o.place ? 0 : .5; s += S - E; }
  return K * s / opps.length;
}
const kOf = (games, [k0, k1]) => Math.max(k1, k0 - games * 1.5);
const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;

/* ---------- perfil competitivo (lo que se guarda en la cuenta) ---------- */
function freshComp() { return { nmmr: CFG.START_MMR, rmmr: CFG.START_MMR, ngames: 0, rgames: 0, placed: 0, ladder: null, candies: 0, recentN: [] }; }
function normComp(c) { const f = freshComp(), o = Object.assign(freshComp(), c || {}); for (const k of ['nmmr', 'rmmr', 'ngames', 'rgames', 'placed', 'candies']) o[k] = Number.isFinite(+o[k]) && o[k] !== null && o[k] !== '' ? Math.max(k === 'nmmr' || k === 'rmmr' ? 0 : 0, +o[k]) : f[k];
  if (o.ladder != null && !Number.isFinite(+o.ladder)) o.ladder = null; if (!Array.isArray(o.recentN)) o.recentN = []; return o; }
// Lo que ve el jugador: nunca el MMR, solo su rango (o el progreso del posicionamiento) y sus caramelos
function publicComp(c) {
  c = normComp(c); const placing = c.ladder == null;
  return { candies: c.candies, ranked: placing ? { placing: true, done: c.placed, of: CFG.PLACEMENTS } : Object.assign({ placing: false, games: c.rgames }, rankOf(c.ladder), { next: nextOf(c.ladder) }), normalGames: c.ngames };
}
// Siguiente escalón (para la barra de progreso)
function nextOf(L) { const r = rankOf(L), i = LEAGUES.findIndex(l => l.key === r.league), nx = LEAGUES[i + 1];
  if (r.apex) return nx ? { name: nx.name, need: nx.at - r.ladder } : null;
  if (r.div !== 'I') return { name: r.name + ' ' + ROMAN[ROMAN.indexOf(r.div) + 1], need: CFG.DIV_LP - r.lp };
  return { name: nx.apex ? nx.name : nx.name + ' V', need: CFG.DIV_LP - r.lp }; }

/* ---------- dificultad de los bots según el MMR ---------- */
// Niveles internos (no se muestran): las diferencias están en sus decisiones, no en sus estadísticas
const SKILLS = ['principiante', 'intermedio', 'avanzado', 'experto', 'maestro'];
const SKILL_MMR = { principiante: 800, intermedio: 1000, avanzado: 1200, experto: 1450, maestro: 1700 };
function skillFor(mode, mmr) {
  if (mode === 'ranked') return mmr < 1050 ? 'avanzado' : mmr < 1500 ? 'experto' : 'maestro'; // en clasificatoria, bastante mejores
  return mmr < 880 ? 'principiante' : mmr < 1100 ? 'intermedio' : mmr < 1350 ? 'avanzado' : 'experto';
}
// Bots de una partida: rodean el MMR medio de las personas (con variación fija por asiento, sin azar)
function botsFor(mode, humansMMR, n) {
  const m = avg(humansMMR) || CFG.START_MMR, out = [];
  for (let i = 0; i < n; i++) { const mm = Math.round(m + [-60, 40, -20, 70, -90, 10, 50][i % 7] * (mode === 'ranked' ? .6 : 1)); const skill = skillFor(mode, mm); out.push({ skill, mmr: Math.round((mm + SKILL_MMR[skill]) / 2) }); }
  return out;
}

/* ---------- resultado de una partida para una persona ---------- */
// mode: 'normal' | 'ranked' | 'custom'. place: 1..8. opps: [{mmr, place}] (los 7 rivales, personas y bots).
// Devuelve el perfil nuevo y el registro de la partida (todo lo que explica el cambio). Determinista.
function applyMatch(comp0, { mode, place, opps }) {
  const c = normComp(JSON.parse(JSON.stringify(comp0 || {}))), rec = { mode, place, candies: CFG.CANDY[clamp(place, 1, 8) - 1] || 0 };
  c.candies += rec.candies;
  const oppAvg = Math.round(avg(opps.map(o => o.mmr)));
  rec.oppAvg = oppAvg;
  if (mode === 'normal') {
    const before = c.nmmr; let d = eloDelta(before, place, opps, kOf(c.ngames, CFG.NORMAL_K));
    // Dificultad adaptativa: con rachas (3 de las últimas 4) se acelera un poco el ajuste, sin cambios bruscos
    const rec4 = [...c.recentN.slice(-3), place], low = rec4.filter(p => p >= 5).length, high = rec4.filter(p => p <= 2).length;
    if (rec4.length >= 3 && low >= 3) d -= 6; if (rec4.length >= 3 && high >= 3) d += 6;
    d = clamp(d, -45, 45); c.nmmr = Math.round(before + d); c.ngames++; c.recentN = rec4.slice(-4);
    Object.assign(rec, { mmrBefore: before, mmrAfter: c.nmmr });
  } else if (mode === 'ranked') {
    const before = c.rmmr, placing = c.ladder == null;
    const K = placing ? CFG.PLACEMENT_K : kOf(c.rgames, CFG.RANKED_K);
    c.rmmr = Math.round(before + clamp(eloDelta(before, place, opps, K), -70, 70)); c.rgames++;
    Object.assign(rec, { mmrBefore: before, mmrAfter: c.rmmr });
    if (placing) {
      c.placed++; rec.placement = { done: c.placed, of: CFG.PLACEMENTS };
      if (c.placed >= CFG.PLACEMENTS) { // se revela el rango: a partir del MMR (con los 3 resultados), acotado a una entrada baja o media
        c.ladder = Math.round(clamp(ladderOfMMR(c.rmmr), CFG.PLACE_MIN, CFG.PLACE_MAX));
        rec.revealed = rankOf(c.ladder); rec.rankAfter = rec.revealed;
      }
    } else {
      const L0 = c.ladder, r0 = rankOf(L0);
      // LP: base por puesto + diferencia entre MMR y rango visible (converge hacia la habilidad real) + fuerza de la sala
      const gap = c.rmmr - mmrOfLadder(L0), base = CFG.LP_BASE[place - 1];
      const adjGap = clamp(gap / 12, -12, 12), adjLobby = clamp((oppAvg - before) / 40, -6, 6);
      let lp = base + adjGap + adjLobby;
      if (place <= 4) lp = Math.max(place === 1 ? 20 : 3, lp); else lp = Math.min(-3, lp); // arriba siempre suma, abajo siempre resta
      lp = Math.round(clamp(lp, CFG.LP_MIN, CFG.LP_MAX));
      c.ladder = Math.max(0, L0 + lp); const r1 = rankOf(c.ladder);
      Object.assign(rec, { lp: c.ladder - L0, rankBefore: r0, rankAfter: r1, why: { base, mmrVsRank: Math.round(adjGap), lobby: Math.round(adjLobby) } });
      const ord = r => LEAGUES.findIndex(l => l.key === r.league) * 10 + (r.div ? ROMAN.indexOf(r.div) : 0);
      if (ord(r1) > ord(r0)) rec.promoted = true; else if (ord(r1) < ord(r0)) rec.demoted = true;
    }
  }
  return { comp: c, rec };
}

module.exports = { CFG, LEAGUES, ROMAN, rankOf, rankLabel, mmrOfLadder, ladderOfMMR, eloDelta, freshComp, normComp, publicComp, nextOf, SKILLS, SKILL_MMR, skillFor, botsFor, applyMatch };
