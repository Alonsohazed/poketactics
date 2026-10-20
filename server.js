'use strict';
/*
 * Poké Tactics — servidor de juego
 * - Sirve el cliente (carpeta public/).
 * - Gestiona salas con Socket.io.
 * - Cada partida se ejecuta EN EL SERVIDOR (autoritativo): los jugadores solo envían acciones.
 *   Para aislar las salas, cada una carga public/game.js en su propio contexto vm.
 */
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { Server } = require('socket.io');
const crypto = require('crypto');
const db = require('./db');
const { createAuth } = require('./auth');
const CMP = require('./competitive');

const PORT = process.env.PORT || 3000;
const MAX_ROOMS = +process.env.MAX_ROOMS || 50;
const TICK_MS = 50;
// Cada sala ejecuta los aumentos (augments.js) y el juego (game.js) juntos, como en el navegador
const GAME_SRC = ['augments.js', 'game.js'].map(f => fs.readFileSync(path.join(__dirname, 'public', f), 'utf8')).join('\n');
const GAME_SCRIPT = new vm.Script(GAME_SRC, { filename: 'game.js' });
const DIFFS = ['facil', 'normal', 'dificil'];
// Colas: si no aparecen 8 personas compatibles, a los QUEUE_FILL_MS se completa la partida con bots
const QUEUE_FILL_MS = +process.env.QUEUE_FILL_MS || 12000;
const MODES = ['normal', 'ranked'];
// El campo «trainer» de las cuentas guarda ahora la minileyenda elegida en el menú
const TRAINER_KEYS = makeGame().TAC_KEYS;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render va detrás de un proxy: así req.ip y req.secure son correctos
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' });
  next();
});
const auth = createAuth(db, { trainers: TRAINER_KEYS });
app.get('/health', (req, res) => res.json({ ok: true, rooms: rooms.size }));
// Commit desplegado: el navegador pide los modelos animados (public/anims) a jsDelivr fijados a este commit, así no gastan
// el ancho de banda de Render. En local no hay commit y se sirven desde aquí.
app.get('/api/build', (req, res) => res.json({ commit: process.env.RENDER_GIT_COMMIT || '', repo: process.env.CDN_REPO || 'Alonsohazed/poketactics' }));
app.use('/api', auth.router);
// Sin caché larga: tras cada despliegue el navegador revalida (ETag) y nunca mezcla versiones
// Imágenes (arte de cartas, logo, iconos): caché de 7 días; HTML y JS se revalidan siempre porque cambian con cada despliegue
app.use(express.static(path.join(__dirname, 'public'), { setHeaders(res, file) { if (/\.(webp|png|jpe?g|svg)$/i.test(file)) res.setHeader('Cache-Control', 'public, max-age=604800'); } }));

const server = http.createServer(app);
// Mensajes de 1 KB o más comprimidos (estado de la partida en JSON: ocupa una fracción); los pequeños van tal cual para no gastar CPU
const io = new Server(server, { maxHttpBufferSize: 16 * 1024, perMessageDeflate: { threshold: 1024 } });
io.use(auth.socketGuard);

/** @type {Map<string, any>} */
const rooms = new Map();

// ---------- utilidades ----------
const clean = (v, max, fallback) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fallback);
function newCode() {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  let c;
  do { c = ''; for (let i = 0; i < 5; i++) c += a[Math.floor(Math.random() * a.length)]; } while (rooms.has(c));
  return c;
}
function roomList() {
  return [...rooms.values()].filter(r => r.state === 'lobby').map(r => ({
    code: r.code, name: r.name, n: r.seats.length, max: r.max, diff: r.diff,
    tr: (r.seats.find(s => s.peer === r.owner) || r.seats[0] || {}).tr || '',
  }));
}
const broadcastRooms = () => io.emit('rooms', roomList());
const publicSeats = seats => seats.map(s => ({ peer: s.peer, nick: s.nick, tr: s.tr, connected: s.connected }));
function lobbyState(r) { return { code: r.code, name: r.name, max: r.max, diff: r.diff, owner: r.owner, seats: publicSeats(r.seats) }; }
const emitLobby = r => io.to(r.code).emit('lobby', lobbyState(r));

// Crea el motor de juego de una sala en un contexto aislado
function makeGame(room) {
  const ctx = {
    __SERVER__: true,
    module: { exports: {} },
    console, setTimeout, clearTimeout, setInterval, clearInterval,
  };
  vm.createContext(ctx);
  GAME_SCRIPT.runInContext(ctx);
  return ctx.module.exports;
}
// Reparte los mensajes que genera el motor
function route(room, topic, data) {
  if (topic === 'pub' || topic === 'car' || topic === 'cmbs' || topic === 'cmbev') io.to(room.code).emit(topic, data);
  else if ((topic === 'priv' || topic === 'cmb') && data && data.to) io.to(data.to).emit(topic, data);
}

function closeRoom(room, reason) {
  if (room.timer) clearInterval(room.timer);
  room.timer = null;
  io.to(room.code).emit('bye', { reason });
  io.in(room.code).socketsLeave(room.code);
  rooms.delete(room.code);
  broadcastRooms();
}

function startGame(room, opts) {
  room.state = 'game';
  room.game = makeGame(room);
  room.matchId = room.matchId || crypto.randomUUID(); room.startedAt = Date.now(); room.mode = room.mode || 'custom';
  if (!room.botInfo) room.botInfo = CMP.botsFor('normal', room.seats.map(s => s.nmmr || CMP.CFG.START_MMR), 8 - room.seats.length);
  io.to(room.code).emit('start', { seats: publicSeats(room.seats) });
  room.game.serverCreate(
    { diff: room.diff, humans: publicSeats(room.seats), bots: room.botInfo.map(b => ({ skill: b.skill })), timer: [30, 45, 60].includes(opts.timer) ? opts.timer : 30, speed: [1, 2, 4].includes(opts.speed) ? opts.speed : 1 },
    (t, d) => route(room, t, d)
  );
  let last = Date.now();
  room.timer = setInterval(() => {
    const now = Date.now();
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    try { room.game.serverTick(dt); }
    catch (e) { console.error(`[${room.code}] error en la partida`, e); closeRoom(room, 'error'); return; }
    const info = room.game.serverInfo();
    recordPlaces(room, info);
    if (info.over) { if (!room.endAt) room.endAt = now + 30000; else if (now > room.endAt) closeRoom(room, 'fin'); }
    else if (info.humans === 0 && !room.seats.some(s => s.connected)) closeRoom(room, 'vacía');
  }, TICK_MS);
  broadcastRooms();
}

// Apunta el resultado de cada persona en cuanto queda eliminada: MMR, LP, caramelos e historial (una sola vez por asiento;
// además la base rechaza repetir la misma partida y usuario). Los rivales que siguen vivos cuentan como por encima.
function recordPlaces(room, info) {
  const pl = info.plist || [];
  pl.forEach((e, i) => {
    if (!e.peer || !e.place) return;
    const seat = room.seats.find(s => s.peer === e.peer);
    if (!seat || seat.recorded) return;
    seat.recorded = true;
    const mode = room.mode, mmrOf = (x, j) => { if (x.peer) { const s = room.seats.find(q => q.peer === x.peer); return s ? (mode === 'ranked' ? s.rmmr : s.nmmr) || CMP.CFG.START_MMR : CMP.CFG.START_MMR; } const b = room.botInfo[j - room.seats.length]; return b ? b.mmr : CMP.CFG.START_MMR; };
    const opps = pl.map((x, j) => j === i ? null : { mmr: mmrOf(x, j), place: x.place || 0 }).filter(Boolean);
    const participants = pl.map((x, j) => ({ name: x.name, place: x.place || null, me: j === i }));
    db.recordMatch(seat.uid, room.matchId, mode, comp => {
      const r = CMP.applyMatch(comp, { mode, place: e.place, opps });
      Object.assign(r.rec, { comp: e.comp || null, participants, duration: Math.round((Date.now() - room.startedAt) / 1000) });
      return r;
    }).then(r => { if (r && !r.dup) io.to(seat.peer).emit('result', { mode, rec: r.rec, comp: CMP.publicComp(r.comp) }); })
      .catch(err => console.error(`[${room.code}] no se pudo guardar el resultado`, err.message));
  });
}
// Asiento con los datos de la cuenta (no se fía de lo que mande el navegador)
async function seatFor(socket) {
  const u = socket.data.user;
  const fresh = await db.userById(u.id).catch(() => null);
  const c = CMP.normComp(fresh && fresh.comp);
  return { peer: socket.id, uid: u.id, nick: u.name.slice(0, 14), tr: (fresh || u).trainer || '', connected: true, nmmr: c.nmmr, rmmr: c.rmmr };
}

// ---------- colas Normal y Clasificatoria ----------
const queues = { normal: [], ranked: [] };
const inQueue = uid => MODES.some(m => queues[m].some(e => e.uid === uid));
const inGame = uid => [...rooms.values()].some(r => r.seats.some(s => s.uid === uid && (r.state === 'lobby' || (s.connected && !s.recorded))));
function unqueue(socket) { for (const m of MODES) { const i = queues[m].findIndex(e => e.sid === socket.id); if (i >= 0) { queues[m].splice(i, 1); socket.emit('queue', { mode: m, state: 'off' }); } } }
// Cada segundo: el más antiguo de cada cola busca compañeros con MMR parecido (margen que crece con la espera);
// con 8 personas, o al cumplirse el tiempo de espera, empieza la partida y los asientos libres son bots
function matchmake() {
  const now = Date.now();
  for (const mode of MODES) {
    const q = queues[mode];
    while (q.length) {
      q.sort((a, b) => a.since - b.since); const A = q[0], wait = (now - A.since) / 1000, win = 150 + 60 * wait;
      const group = q.filter(e => Math.abs(e.mmr - A.mmr) <= win).slice(0, 8);
      if (group.length < 8 && now - A.since < QUEUE_FILL_MS) { for (const e of q) e.socket.emit('queue', { mode, state: 'on', wait: Math.floor((now - e.since) / 1000), found: q.filter(x => Math.abs(x.mmr - e.mmr) <= 150 + 60 * (now - e.since) / 1000).length, fill: Math.ceil(QUEUE_FILL_MS / 1000) }); break; }
      for (const e of group) q.splice(q.indexOf(e), 1);
      const live = group.filter(e => e.socket.connected && !e.socket.data.room);
      if (!live.length) continue;
      if (rooms.size >= MAX_ROOMS) { for (const e of live) e.socket.emit('err', 'El servidor está lleno, prueba en un rato'), e.socket.emit('queue', { mode, state: 'off' }); continue; }
      const room = { code: newCode(), name: mode === 'ranked' ? 'Clasificatoria' : 'Partida normal', mode, max: 8, diff: 'normal', owner: null, state: 'lobby', game: null, timer: null, seats: live.map(e => e.seat) };
      room.botInfo = CMP.botsFor(mode, live.map(e => e.mmr), 8 - live.length);
      rooms.set(room.code, room);
      for (const e of live) { e.socket.join(room.code); e.socket.data.room = room.code; e.socket.emit('queue', { mode, state: 'matched', humans: live.length }); }
      startGame(room, { timer: 30, speed: 1 });
    }
  }
}
setInterval(matchmake, 1000).unref();

function leave(socket) {
  const code = socket.data.room;
  if (!code) return;
  socket.data.room = null;
  socket.leave(code);
  const room = rooms.get(code);
  if (!room) return;
  if (room.state === 'lobby') {
    room.seats = room.seats.filter(s => s.peer !== socket.id);
    if (!room.seats.length) { rooms.delete(code); broadcastRooms(); return; }
    if (room.owner === socket.id) room.owner = room.seats[0].peer;
    emitLobby(room); broadcastRooms();
  } else {
    const seat = room.seats.find(s => s.peer === socket.id);
    if (seat) seat.connected = false;
    try { room.game.serverLeave(socket.id); } catch (e) { /* noop */ }
  }
}

// ---------- conexiones ----------
io.on('connection', socket => {
  socket.data.room = null;
  let bucket = 0, bucketAt = Date.now();
  const limited = () => { // máx. ~40 mensajes por segundo por jugador
    const now = Date.now();
    if (now - bucketAt > 1000) { bucket = 0; bucketAt = now; }
    return ++bucket > 40;
  };

  socket.on('list', () => socket.emit('rooms', roomList()));

  // Entrar en la cola de un modo (un usuario solo puede estar en una cola o partida a la vez)
  socket.on('queue', async d => {
    if (limited() || !d || typeof d !== 'object' || !MODES.includes(d.mode)) return;
    const uid = socket.data.user.id;
    if (socket.data.room || inQueue(uid) || inGame(uid)) return socket.emit('err', 'Ya estás en una cola o en una partida');
    const seat = await seatFor(socket);
    if (!socket.connected || socket.data.room || inQueue(uid)) return;
    queues[d.mode].push({ sid: socket.id, socket, uid, seat, mmr: d.mode === 'ranked' ? seat.rmmr : seat.nmmr, since: Date.now() });
    socket.emit('queue', { mode: d.mode, state: 'on', wait: 0, found: 1, fill: Math.ceil(QUEUE_FILL_MS / 1000) });
  });
  socket.on('unqueue', () => unqueue(socket));

  socket.on('create', async cfg => {
    if (limited() || !cfg || typeof cfg !== 'object') return;
    if (socket.data.room) leave(socket);
    if (rooms.size >= MAX_ROOMS) return socket.emit('err', 'El servidor está lleno, prueba en un rato');
    if (inQueue(socket.data.user.id)) return socket.emit('err', 'Sal de la cola antes de crear una sala');
    const seat = await seatFor(socket);
    if (!socket.connected || socket.data.room) return;
    const room = {
      code: newCode(),
      name: clean(cfg.name, 24, 'Sala'),
      max: Math.min(8, Math.max(2, cfg.max | 0 || 8)),
      diff: DIFFS.includes(cfg.diff) ? cfg.diff : 'normal',
      owner: socket.id, state: 'lobby', game: null, timer: null,
      seats: [seat],
    };
    rooms.set(room.code, room);
    socket.join(room.code); socket.data.room = room.code;
    emitLobby(room); broadcastRooms();
  });

  socket.on('join', async d => {
    if (limited() || !d || typeof d !== 'object') return;
    const code = typeof d.code === 'string' ? d.code.toLowerCase() : '';
    const seat = await seatFor(socket);
    if (!socket.connected) return;
    const room = rooms.get(code);
    if (!room) return socket.emit('err', 'No existe ninguna sala con ese código');
    if (room.state !== 'lobby') return socket.emit('err', 'Esa partida ya empezó');
    if (room.seats.some(s => s.peer === socket.id)) return;
    if (room.seats.length >= room.max) return socket.emit('err', 'La sala está llena');
    if (inQueue(seat.uid)) return socket.emit('err', 'Sal de la cola antes de unirte a una sala');
    if (socket.data.room) leave(socket);
    room.seats.push(seat);
    socket.join(code); socket.data.room = code;
    emitLobby(room); broadcastRooms();
  });

  socket.on('start', opts => {
    const room = rooms.get(socket.data.room);
    if (!room || room.state !== 'lobby' || room.owner !== socket.id) return;
    startGame(room, opts && typeof opts === 'object' ? opts : {});
  });

  socket.on('act', a => {
    if (limited()) return;
    const room = rooms.get(socket.data.room);
    if (!room || room.state !== 'game' || !a || typeof a !== 'object') return;
    try { room.game.serverAct(socket.id, a); } catch (e) { console.error(`[${room.code}] acción no válida`, e.message); }
  });

  socket.on('leave', () => leave(socket));
  socket.on('disconnect', () => { unqueue(socket); leave(socket); });
});

if (process.env.RENDER && !process.env.DATABASE_URL) {
  console.warn('AVISO: falta DATABASE_URL. Las cuentas se guardan en un archivo y se BORRARÁN en el próximo despliegue o reinicio.');
}
const ready = db.init();
if (require.main === module) {
  ready.then(() => {
    server.listen(PORT, () => console.log(`Poké Tactics escuchando en el puerto ${PORT} · cuentas en ${db.kind}`));
  }, e => { console.error('No se pudo abrir la base de datos', e); process.exit(1); });
}
module.exports = { server, rooms, ready, queues };
