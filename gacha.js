'use strict';
/*
 * Gacha (solo servidor). Funciones puras sobre (comp, cosm): la base de datos las ejecuta dentro de una transacción
 * (db.gachaTx), así el descuento de caramelos y la entrega del premio son atómicos.
 * - El azar lo da crypto.randomInt (se puede sustituir en las pruebas).
 * - Eevee: 0,1 % fijo por tirada y garantizada en la tirada COSM.PITY; la tirada diaria también cuenta.
 * - Repetidos → Polvo Estelar; colecciones completas → título exclusivo.
 * - nonce: la misma petición repetida (doble clic, reintento) devuelve el mismo resultado sin volver a cobrar.
 */
const crypto = require('crypto');
const COSM = require('./public/cosmetics');
const { normComp } = require('./competitive');

const NONCE_RE = /^[A-Za-z0-9_-]{8,40}$/;
const cryptoRng = () => crypto.randomInt(0, 1e9) / 1e9;
const fail = (code, error) => ({ code, error });

function normCosm(c) {
  c = c && typeof c === 'object' ? JSON.parse(JSON.stringify(c)) : {};
  c.inv = Array.isArray(c.inv) ? c.inv.filter(k => typeof k === 'string') : [];
  c.eq = c.eq && typeof c.eq === 'object' ? c.eq : {};
  c.pity = Math.max(0, Math.min(COSM.PITY - 1, +c.pity | 0)); c.dust = Math.max(0, +c.dust | 0);
  c.hist = Array.isArray(c.hist) ? c.hist.slice(-COSM.HIST) : [];
  return c;
}
const pick = (arr, rng) => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
function rarity(rng) { const r = rng(); let acc = 0; for (const t of COSM.TIERS) { acc += t.p; if (r < acc) return t.k; } return 'c'; }

// Entrega una clave (de tirada o de la tienda): nueva → inventario; repetida → polvo. Devuelve el resultado visible
function grant(c, key) {
  const it = COSM.BY[key], tier = COSM.TIER[it.t];
  if (c.inv.includes(key)) { const d = tier ? tier.dust : 0; c.dust += d; return { key, t: it.t, dup: true, dust: d }; }
  c.inv.push(key); if (key === COSM.EEVEE) c.eevee = new Date().toISOString().slice(0, 10);
  return { key, t: it.t, new: true };
}
// Colecciones recién completadas → su título
function collections(c) { const out = [];
  for (const col of COSM.COLLECTIONS) if (!c.inv.includes(col.reward) && col.items.every(k => c.inv.includes(k))) { c.inv.push(col.reward); out.push({ key: col.reward, t: 'x', new: true, col: col.k }); }
  return out; }

// Una tirada: rareza → premio. Cuenta para la garantía de Eevee (si aún no la tienes)
function rollOne(comp, c, rng) {
  const has = COSM.hasEevee(c); if (!has) c.pity++;
  let t = rarity(rng); // un solo sorteo: la mítica es el primer tramo (0,1 %)
  if (!has && c.pity >= COSM.PITY) t = 'm'; // garantía
  if (t === 'm') {
    if (has) { c.dust += COSM.BIG_DUST; return { key: 'dust', t: 'm', dust: COSM.BIG_DUST }; } // ya la tienes: Polvo Estelar
    c.pity = 0; return grant(c, COSM.EEVEE);
  }
  if (t === 'c' && rng() < COSM.REFUND_SHARE) { comp.candies += COSM.REFUND; return { key: 'cd', t: 'c', candy: COSM.REFUND }; }
  return grant(c, pick(COSM.POOL[t], rng));
}

// op: 'roll' {n}, 'daily', 'buy' {key}. ctx: {today: 'AAAA-MM-DD', playedToday: bool, rng}
function apply(comp0, cosm0, req, ctx) {
  const comp = normComp(comp0), c = normCosm(cosm0), rng = ctx.rng || cryptoRng;
  if (typeof req.nonce !== 'string' || !NONCE_RE.test(req.nonce)) return fail(400, 'Petición no válida');
  if (c.nonce && c.nonce.id === req.nonce) return { comp: comp0, cosm: cosm0, out: c.nonce.res, replay: true }; // repetida: mismo resultado, sin cobrar
  let res = [], cost = 0;
  if (req.op === 'roll') {
    const n = req.n === 1 || req.n === 10 ? req.n : 0; if (!n) return fail(400, 'Solo se puede tirar 1 o 10 veces');
    cost = n === 10 ? COSM.PRICE10 : COSM.PRICE;
    if (comp.candies < cost) return fail(400, `Necesitas ${cost} caramelos`);
    comp.candies -= cost; for (let i = 0; i < n; i++) res.push(rollOne(comp, c, rng));
  } else if (req.op === 'daily') {
    if (c.day === ctx.today) return fail(400, 'Ya usaste la tirada gratis de hoy');
    if (!ctx.playedToday) return fail(400, 'Termina una partida hoy para desbloquear la tirada gratis');
    c.day = ctx.today; res.push(rollOne(comp, c, rng));
  } else if (req.op === 'buy') {
    const it = COSM.BY[req.key], tier = it && COSM.TIER[it.t];
    if (!it || !tier || !tier.price) return fail(400, 'Eso no se puede comprar con Polvo Estelar');
    if (c.inv.includes(req.key)) return fail(409, 'Ya lo tienes');
    if (c.dust < tier.price) return fail(400, `Necesitas ${tier.price} de Polvo Estelar`);
    c.dust -= tier.price; res.push(grant(c, req.key));
  } else return fail(404, 'Acción no válida');
  res = res.concat(collections(c));
  const now = Math.floor(Date.now() / 1000); if (req.op !== 'buy') for (const r of res) if (r.t !== 'x') c.hist.push([now, r.key]);
  c.hist = c.hist.slice(-COSM.HIST);
  const out = { res, candies: comp.candies, dust: c.dust, pity: c.pity, eevee: res.some(r => r.key === COSM.EEVEE && r.new) };
  c.nonce = { id: req.nonce, res: out };
  return { comp, cosm: c, out };
}

// Equipar (o quitar con key vacía) un cosmético que tienes en su hueco. Sin coste: no lleva nonce
function equip(comp0, cosm0, { slot, key }) {
  const c = normCosm(cosm0);
  if (!COSM.SLOTS.includes(slot)) return fail(400, 'Hueco no válido');
  if (key === '' || key == null) delete c.eq[slot];
  else { if (typeof key !== 'string' || !COSM.validEq(slot, key)) return fail(400, 'Eso no va en ese hueco');
    if (!c.inv.includes(key)) return fail(403, 'Aún no lo tienes');
    if (slot === 'sh' && !COSM.ownsTac(c, COSM.BY[key].d.tac)) return fail(400, 'No tienes esa minileyenda');
    c.eq[slot] = key; }
  for (const s of Object.keys(c.eq)) if (!COSM.validEq(s, c.eq[s]) || !c.inv.includes(c.eq[s])) delete c.eq[s];
  return { comp: comp0, cosm: c, out: { eq: c.eq } };
}

// Estado para la pantalla del gacha (solo lo propio)
function view(comp0, cosm0, ctx) {
  const comp = normComp(comp0), c = normCosm(cosm0);
  return { candies: comp.candies, dust: c.dust, pity: c.pity, pityLeft: COSM.pityLeft(c), eevee: COSM.hasEevee(c), inv: c.inv, eq: c.eq, hist: c.hist,
    daily: c.day === ctx.today ? 'usada' : ctx.playedToday ? 'lista' : 'jugar', price: COSM.PRICE, price10: COSM.PRICE10 };
}

module.exports = { apply, equip, view, normCosm, rollOne, rarity, NONCE_RE };
