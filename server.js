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
const db = require('./db');
const { createAuth } = require('./auth');

const PORT = process.env.PORT || 3000;
const MAX_ROOMS = +process.env.MAX_ROOMS || 50;
const TICK_MS = 50;
// Cada sala ejecuta los aumentos (augments.js) y el juego (game.js) juntos, como en el navegador
const GAME_SRC = ['augments.js', 'game.js'].map(f => fs.readFileSync(path.join(__dirname, 'public', f), 'utf8')).join('\n');
const GAME_SCRIPT = new vm.Script(GAME_SRC, { filename: 'game.js' });
const DIFFS = ['facil', 'normal', 'dificil'];
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
app.use('/api', auth.router);
// Sin caché larga: tras cada despliegue el navegador revalida (ETag) y nunca mezcla versiones
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 16 * 1024 });
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
  io.to(room.code).emit('start', { seats: publicSeats(room.seats) });
  room.game.serverCreate(
    { diff: room.diff, humans: publicSeats(room.seats), timer: [30, 45, 60].includes(opts.timer) ? opts.timer : 30, speed: [1, 2, 4].includes(opts.speed) ? opts.speed : 1 },
    (t, d) => route(room, t, d)
  );
  let last = Date.now();
  room.timer = setInterval(() => {
    const now = Date.now();
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    try { room.game.serverTick(dt); }
    catch (e) { console.error(`[${room.code}] error en la partida`, e); closeRoom(room, 'error'); return; }
    const info = room.game.serverInfo();
    recordPlaces(room, info.places);
    if (info.over) { if (!room.endAt) room.endAt = now + 30000; else if (now > room.endAt) closeRoom(room, 'fin'); }
    else if (info.humans === 0 && !room.seats.some(s => s.connected)) closeRoom(room, 'vacía');
  }, TICK_MS);
  broadcastRooms();
}

// Apunta en la cuenta de cada jugador su puesto final (una sola vez por asiento)
function recordPlaces(room, places) {
  for (const [peer, place] of places) {
    const seat = room.seats.find(s => s.peer === peer);
    if (!seat || seat.recorded) continue;
    seat.recorded = true;
    db.addResult(seat.uid, place).catch(e => console.error(`[${room.code}] no se pudo guardar el resultado`, e.message));
  }
}
// Asiento con los datos de la cuenta (no se fía de lo que mande el navegador)
async function seatFor(socket) {
  const u = socket.data.user;
  const fresh = await db.userById(u.id).catch(() => null);
  return { peer: socket.id, uid: u.id, nick: u.name.slice(0, 14), tr: (fresh || u).trainer || '', connected: true };
}

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

  socket.on('create', async cfg => {
    if (limited() || !cfg || typeof cfg !== 'object') return;
    if (socket.data.room) leave(socket);
    if (rooms.size >= MAX_ROOMS) return socket.emit('err', 'El servidor está lleno, prueba en un rato');
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
  socket.on('disconnect', () => leave(socket));
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
module.exports = { server, rooms, ready };
