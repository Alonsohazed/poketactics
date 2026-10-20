'use strict';
/*
 * Almacenamiento de cuentas y sesiones.
 * - Con DATABASE_URL (Neon, Render…): PostgreSQL.
 * - Sin ella (en tu ordenador): un archivo JSON en data/db.json.
 * Todas las funciones son asíncronas y devuelven usuarios con la misma forma:
 *   { id, name, pass, trainer, settings, stats, comp, created }
 * comp: perfil competitivo (MMR normal y clasificatorio, rango, caramelos; ver competitive.js).
 * matches: registro de partidas; (partida, usuario) es único, así un resultado se procesa una sola vez.
 */
const fs = require('fs');
const path = require('path');

const EMPTY_STATS = () => ({ games: 0, wins: 0, top4: 0, best: 0 });
const keyOf = name => String(name).toLowerCase();
function applyResult(stats, place) {
  const s = Object.assign(EMPTY_STATS(), stats || {});
  s.games++;
  if (place === 1) s.wins++;
  if (place <= 4) s.top4++;
  if (!s.best || place < s.best) s.best = place;
  return s;
}

// ---------- archivo JSON (desarrollo local) ----------
function fileStore(file) {
  let db = { seq: 0, users: [], sessions: {} };
  let writing = Promise.resolve();
  const save = () => {
    writing = writing.then(async () => {
      const tmp = file + '.tmp';
      await fs.promises.writeFile(tmp, JSON.stringify(db));
      await fs.promises.rename(tmp, file);
    }).catch(e => console.error('No se pudo guardar data/db.json', e));
    return writing;
  };
  const byId = id => db.users.find(u => u.id === id) || null;
  return {
    kind: 'archivo',
    async init() {
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      try { db = JSON.parse(await fs.promises.readFile(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      db.matches = db.matches || []; for (const u of db.users) u.comp = u.comp || {};
    },
    async createUser({ name, pass, trainer }) {
      if (db.users.some(u => keyOf(u.name) === keyOf(name))) return null;
      const u = { id: ++db.seq, name, pass, trainer: trainer || '', settings: {}, stats: EMPTY_STATS(), comp: {}, created: new Date().toISOString() };
      db.users.push(u); await save(); return u;
    },
    async userByName(name) { return db.users.find(u => keyOf(u.name) === keyOf(name)) || null; },
    async userById(id) { return byId(id); },
    async updateUser(id, fields) {
      const u = byId(id); if (!u) return null;
      if (fields.trainer !== undefined) u.trainer = fields.trainer;
      if (fields.settings !== undefined) u.settings = fields.settings;
      await save(); return u;
    },
    async addResult(id, place) { const u = byId(id); if (!u) return; u.stats = applyResult(u.stats, place); await save(); },
    // Aplica el resultado de una partida una sola vez: fn(comp) devuelve {comp, rec}; si ya estaba, no hace nada
    async recordMatch(userId, matchId, mode, fn) {
      const u = byId(userId); if (!u) return null;
      if (db.matches.some(m => m.matchId === matchId && m.userId === userId)) return { dup: true };
      const { comp, rec } = fn(u.comp || {}); u.comp = comp; u.stats = applyResult(u.stats, rec.place);
      const m = { id: db.matches.length + 1, matchId, userId, mode, created: new Date().toISOString(), data: rec }; db.matches.push(m); await save();
      return { comp, rec: m.data, created: m.created };
    },
    async matches(userId, limit = 6) { return db.matches.filter(m => m.userId === userId).sort((a, b) => b.id - a.id).slice(0, limit).map(m => ({ matchId: m.matchId, mode: m.mode, created: m.created, data: m.data })); },
    async createSession(token, userId, expires) { db.sessions[token] = { userId, expires: +expires }; await save(); },
    async sessionUser(token) {
      const s = db.sessions[token]; if (!s) return null;
      if (s.expires < Date.now()) { delete db.sessions[token]; await save(); return null; }
      return byId(s.userId);
    },
    async deleteSession(token) { if (db.sessions[token]) { delete db.sessions[token]; await save(); } },
    async purgeSessions() {
      let n = 0; for (const [t, s] of Object.entries(db.sessions)) if (s.expires < Date.now()) { delete db.sessions[t]; n++; }
      if (n) await save();
    },
  };
}

// ---------- PostgreSQL (producción) ----------
function pgStore(url) {
  const { Pool } = require('pg');
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const pool = new Pool({ connectionString: url, max: 5, ssl: local ? false : { rejectUnauthorized: true } });
  pool.on('error', e => console.error('Error en la conexión con la base de datos', e.message));
  const row = r => r && { id: r.id, name: r.name, pass: r.pass, trainer: r.trainer, settings: r.settings || {}, stats: Object.assign(EMPTY_STATS(), r.stats || {}), comp: r.comp || {}, created: r.created_at };
  const one = async (sql, args) => row((await pool.query(sql, args)).rows[0]);
  return {
    kind: 'postgres',
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          name_key TEXT NOT NULL UNIQUE,
          pass TEXT NOT NULL,
          trainer TEXT NOT NULL DEFAULT '',
          settings JSONB NOT NULL DEFAULT '{}',
          stats JSONB NOT NULL DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at TIMESTAMPTZ NOT NULL
        );
        CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS comp JSONB NOT NULL DEFAULT '{}';
        CREATE TABLE IF NOT EXISTS matches (
          id SERIAL PRIMARY KEY,
          match_id TEXT NOT NULL,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          mode TEXT NOT NULL,
          data JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (match_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS matches_user_idx ON matches(user_id, id DESC);`);
    },
    createUser: ({ name, pass, trainer }) => one(
      `INSERT INTO users (name, name_key, pass, trainer) VALUES ($1, $2, $3, $4)
       ON CONFLICT (name_key) DO NOTHING RETURNING *`, [name, keyOf(name), pass, trainer || '']),
    userByName: name => one('SELECT * FROM users WHERE name_key = $1', [keyOf(name)]),
    userById: id => one('SELECT * FROM users WHERE id = $1', [id]),
    updateUser: (id, f) => one(
      `UPDATE users SET trainer = COALESCE($2::text, trainer), settings = COALESCE($3::jsonb, settings) WHERE id = $1 RETURNING *`,
      [id, f.trainer === undefined ? null : f.trainer, f.settings === undefined ? null : JSON.stringify(f.settings)]),
    async addResult(id, place) {
      // Se hace en una sola sentencia para que dos partidas que acaban a la vez no se pisen
      await pool.query(
        `UPDATE users SET stats = jsonb_build_object(
           'games', COALESCE((stats->>'games')::int, 0) + 1,
           'wins',  COALESCE((stats->>'wins')::int, 0) + CASE WHEN $2::int = 1 THEN 1 ELSE 0 END,
           'top4',  COALESCE((stats->>'top4')::int, 0) + CASE WHEN $2::int <= 4 THEN 1 ELSE 0 END,
           'best',  CASE WHEN COALESCE((stats->>'best')::int, 0) = 0 THEN $2::int ELSE LEAST((stats->>'best')::int, $2::int) END)
         WHERE id = $1`, [id, place]);
    },
    // Transacción: bloquea la fila del usuario, inserta la partida (única) y actualiza el perfil; si ya existía, no cambia nada
    async recordMatch(userId, matchId, mode, fn) {
      const cl = await pool.connect();
      try {
        await cl.query('BEGIN');
        const u = (await cl.query('SELECT comp, stats FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0];
        if (!u) { await cl.query('ROLLBACK'); return null; }
        const { comp, rec } = fn(u.comp || {});
        const ins = await cl.query('INSERT INTO matches (match_id, user_id, mode, data) VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT (match_id, user_id) DO NOTHING RETURNING created_at', [matchId, userId, mode, JSON.stringify(rec)]);
        if (!ins.rows.length) { await cl.query('ROLLBACK'); return { dup: true }; }
        await cl.query('UPDATE users SET comp = $2::jsonb, stats = $3::jsonb WHERE id = $1', [userId, JSON.stringify(comp), JSON.stringify(applyResult(u.stats, rec.place))]);
        await cl.query('COMMIT'); return { comp, rec, created: ins.rows[0].created_at };
      } catch (e) { await cl.query('ROLLBACK').catch(() => {}); throw e; } finally { cl.release(); }
    },
    async matches(userId, limit = 6) {
      const r = await pool.query('SELECT match_id, mode, data, created_at FROM matches WHERE user_id = $1 ORDER BY id DESC LIMIT $2', [userId, limit]);
      return r.rows.map(x => ({ matchId: x.match_id, mode: x.mode, created: x.created_at, data: x.data }));
    },
    async createSession(token, userId, expires) {
      await pool.query('INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)', [token, userId, new Date(expires)]);
    },
    sessionUser: token => one(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1 AND s.expires_at > now()`, [token]),
    async deleteSession(token) { await pool.query('DELETE FROM sessions WHERE token = $1', [token]); },
    async purgeSessions() { await pool.query('DELETE FROM sessions WHERE expires_at < now()'); },
  };
}

module.exports = process.env.DATABASE_URL
  ? pgStore(process.env.DATABASE_URL)
  : fileStore(process.env.DB_FILE || path.join(__dirname, 'data', 'db.json'));
