'use strict';
/*
 * Cuentas: registro, inicio de sesión y sesiones por cookie.
 * - Contraseñas con scrypt (sal aleatoria por usuario) y comparación en tiempo constante.
 * - La cookie de sesión es HttpOnly + SameSite=Lax (+ Secure en https) y en la base
 *   de datos solo se guarda su hash: aunque alguien leyera la base, no podría usarla.
 * - Límite de intentos por IP y por cuenta para frenar a quien pruebe contraseñas.
 */
const crypto = require('crypto');
const express = require('express');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);

const COOKIE = 'pt_sid';
const SESSION_DAYS = 30;
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const PASS_MIN = 6, PASS_MAX = 72;
const SETTINGS_KEYS = { vol: 'number', muted: 'boolean', timer: 'number', speed: 'number', theme: 'string', diff: 'string' };

async function hashPassword(pass) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pass, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}
async function checkPassword(pass, stored) {
  const [kind, salt, hash] = String(stored).split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64');
  const got = await scrypt(pass, Buffer.from(salt, 'base64'), want.length);
  return crypto.timingSafeEqual(want, got);
}
// Si el usuario no existe se compara igualmente con esto, para tardar lo mismo
const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString('hex'));

const tokenHash = t => crypto.createHash('sha256').update(t).digest('hex');
function readCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}

// Ventana deslizante sencilla en memoria
function limiter(max, windowMs) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, windowMs).unref();
  return {
    blocked(key) { const v = hits.get(key); return !!v && v.reset > Date.now() && v.n >= max; },
    hit(key) {
      const now = Date.now(); let v = hits.get(key);
      if (!v || v.reset < now) { v = { n: 0, reset: now + windowMs }; hits.set(key, v); }
      v.n++;
    },
    clear(key) { hits.delete(key); },
  };
}

const { publicComp, profileView } = require('./competitive');
// Lo que ve el navegador de su cuenta: nunca el MMR, solo su rango (o el posicionamiento) y sus caramelos
function publicUser(u) {
  return { id: u.id, name: u.name, trainer: u.trainer || '', settings: u.settings || {}, stats: u.stats || {}, comp: publicComp(u.comp) };
}
function cleanSettings(s) {
  const out = {};
  if (!s || typeof s !== 'object') return out;
  for (const [k, t] of Object.entries(SETTINGS_KEYS)) if (typeof s[k] === t && (t !== 'string' || s[k].length <= 12)) out[k] = s[k];
  if (typeof out.vol === 'number') out.vol = Math.min(1, Math.max(0, out.vol));
  return out;
}

function createAuth(db, { trainers }) {
  const ipLimit = limiter(+process.env.AUTH_IP_LIMIT || 30, 15 * 60 * 1000);      // 30 intentos de login/registro cada 15 min por IP
  const accountLimit = limiter(10, 15 * 60 * 1000); // 10 contraseñas fallidas cada 15 min por cuenta
  const validTrainer = t => typeof t === 'string' && trainers.includes(t);

  async function startSession(req, res, user) {
    const token = crypto.randomBytes(32).toString('base64url');
    const expires = Date.now() + SESSION_DAYS * 864e5;
    await db.createSession(tokenHash(token), user.id, expires);
    res.cookie(COOKIE, token, {
      httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/', maxAge: SESSION_DAYS * 864e5,
    });
  }
  async function userFromCookie(cookieHeader) {
    const token = readCookie(cookieHeader, COOKIE);
    if (!token || token.length > 100) return null;
    return db.sessionUser(tokenHash(token));
  }

  const router = express.Router();
  router.use(express.json({ limit: '4kb' }));
  // Las peticiones que cambian algo solo se aceptan desde la propia página
  router.use((req, res, next) => {
    if (req.method === 'GET') return next();
    const origin = req.get('origin');
    if (origin) {
      let host = '';
      try { host = new URL(origin).host; } catch (e) { /* noop */ }
      if (host !== req.get('host')) return res.status(403).json({ error: 'Origen no permitido' });
    }
    if (!req.is('application/json')) return res.status(415).json({ error: 'Formato no válido' });
    next();
  });
  // Errores de la base de datos: respuesta clara y el detalle en el registro del servidor
  const wrap = fn => (req, res) => fn(req, res).catch(e => {
    console.error('[auth]', e);
    if (!res.headersSent) res.status(500).json({ error: 'Error del servidor, inténtalo en un momento' });
  });
  const needUser = fn => wrap(async (req, res) => {
    const user = await userFromCookie(req.headers.cookie);
    if (!user) return res.status(401).json({ error: 'Tu sesión ha caducado. Vuelve a entrar.' });
    return fn(req, res, user);
  });

  router.post('/register', wrap(async (req, res) => {
    const ip = req.ip;
    if (ipLimit.blocked(ip)) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
    ipLimit.hit(ip);
    const { user, pass, trainer } = req.body || {};
    if (typeof user !== 'string' || !NAME_RE.test(user)) return res.status(400).json({ error: 'El usuario debe tener de 3 a 16 letras, números o _', field: 'user' });
    if (typeof pass !== 'string' || pass.length < PASS_MIN) return res.status(400).json({ error: `La contraseña debe tener al menos ${PASS_MIN} caracteres`, field: 'pass' });
    if (pass.length > PASS_MAX) return res.status(400).json({ error: `La contraseña puede tener como mucho ${PASS_MAX} caracteres`, field: 'pass' });
    if (pass.toLowerCase() === user.toLowerCase()) return res.status(400).json({ error: 'La contraseña no puede ser igual que el usuario', field: 'pass' });
    const created = await db.createUser({ name: user, pass: await hashPassword(pass), trainer: validTrainer(trainer) ? trainer : '' });
    if (!created) return res.status(409).json({ error: 'Ese nombre de usuario ya está en uso', field: 'user' });
    await startSession(req, res, created);
    res.status(201).json({ user: publicUser(created) });
  }));

  router.post('/login', wrap(async (req, res) => {
    const ip = req.ip;
    const { user, pass } = req.body || {};
    if (typeof user !== 'string' || typeof pass !== 'string' || !user || !pass || user.length > 16 || pass.length > PASS_MAX) {
      return res.status(400).json({ error: 'Escribe tu usuario y tu contraseña' });
    }
    const acct = 'u:' + user.toLowerCase();
    if (ipLimit.blocked(ip) || accountLimit.blocked(acct)) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
    const found = await db.userByName(user);
    const ok = await checkPassword(pass, found ? found.pass : await DUMMY_HASH);
    if (!found || !ok) {
      ipLimit.hit(ip); accountLimit.hit(acct);
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    accountLimit.clear(acct);
    await startSession(req, res, found);
    res.json({ user: publicUser(found) });
  }));

  router.post('/logout', wrap(async (req, res) => {
    const token = readCookie(req.headers.cookie, COOKIE);
    if (token) await db.deleteSession(tokenHash(token));
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  }));

  router.get('/me', needUser(async (req, res, user) => res.json({ user: publicUser(user) })));

  router.post('/me', needUser(async (req, res, user) => {
    const b = req.body || {}, fields = {};
    if (b.trainer !== undefined) {
      if (!validTrainer(b.trainer)) return res.status(400).json({ error: 'Ese entrenador no existe' });
      fields.trainer = b.trainer;
    }
    if (b.settings !== undefined) fields.settings = cleanSettings(b.settings);
    const updated = Object.keys(fields).length ? await db.updateUser(user.id, fields) : user;
    res.json({ user: publicUser(updated) });
  }));

  // Ya no se aceptan resultados enviados por el navegador: todas las partidas que cuentan las ejecuta y apunta el servidor
  router.post('/result', (req, res) => res.status(410).json({ error: 'Los resultados los registra el servidor' }));

  // Historial: las 6 partidas más recientes (en la base se guardan todas)
  router.get('/history', needUser(async (req, res, user) => res.json({ matches: await db.matches(user.id, 6) })));

  // Perfil: el propio (y, cuando haya amigos, el de un amigo). Para cualquier otro nombre, 404, exista o no la cuenta:
  // así no se puede comprobar qué nombres son personas (ni distinguir a los rivales generados).
  const profileLimit = limiter(60, 60 * 1000);
  router.get('/profile/:name', needUser(async (req, res, user) => {
    if (profileLimit.blocked(user.id)) return res.status(429).json({ error: 'Demasiadas peticiones. Espera un momento.' });
    profileLimit.hit(user.id);
    const name = String(req.params.name || '');
    if (!NAME_RE.test(name) || name.toLowerCase() !== user.name.toLowerCase()) return res.status(404).json({ error: 'Perfil no disponible' });
    const [agg, list] = await Promise.all([db.modeStats(user.id), db.matches(user.id, 10)]);
    res.json({ profile: profileView(user, agg, list), self: true });
  }));

  // Socket.io: solo entran jugadores con sesión
  function socketGuard(socket, next) {
    const origin = socket.handshake.headers.origin;
    if (origin) {
      let host = '';
      try { host = new URL(origin).host; } catch (e) { /* noop */ }
      if (host !== socket.handshake.headers.host) return next(new Error('origen'));
    }
    userFromCookie(socket.handshake.headers.cookie).then(user => {
      if (!user) return next(new Error('auth'));
      socket.data.user = { id: user.id, name: user.name, trainer: user.trainer || '' };
      next();
    }, e => { console.error('[auth] socket', e); next(new Error('servidor')); });
  }

  setInterval(() => db.purgeSessions().catch(() => {}), 6 * 3600 * 1000).unref();
  return { router, socketGuard };
}

module.exports = { createAuth, hashPassword, checkPassword };
