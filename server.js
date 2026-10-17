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

const PORT = process.env.PORT || 3000;
const MAX_ROOMS = +process.env.MAX_ROOMS || 50;
const TICK_MS = 50;
const GAME_SRC = fs.readFileSync(path.join(__dirname, 'public', 'game.js'), 'utf8');
const GAME_SCRIPT = new vm.Script(GAME_SRC, { filename: 'game.js' });
const DIFFS = ['facil', 'normal', 'dificil'];

const app = express();
app.disable('x-powered-by');
app.get('/health', (req, res) => res.json({ ok: true, rooms: rooms.size }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 16 * 1024 });

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
    av: (r.seats.find(s => s.peer === r.owner) || r.seats[0] || {}).av || '🧢',
  }));
}
const broadcastRooms = () => io.emit('rooms', roomList());
function lobbyState(r) { return { code: r.code, name: r.name, max: r.max, diff: r.diff, owner: r.owner, seats: r.seats }; }
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
  if (topic === 'pub' || topic === 'car') io.to(room.code).emit(topic, data);
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
  io.to(room.code).emit('start', { seats: room.seats });
  room.game.serverCreate(
    { diff: room.diff, humans: room.seats, timer: [30, 45, 60].includes(opts.timer) ? opts.timer : 30, speed: [1, 2, 4].includes(opts.speed) ? opts.speed : 1 },
    (t, d) => route(room, t, d)
  );
  let last = Date.now();
  room.timer = setInterval(() => {
    const now = Date.now();
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    try { room.game.serverTick(dt); }
    catch (e) { console.error(`[${room.code}] error en la partida`, e); closeRoom(room, 'error'); return; }
    const info = room.game.serverInfo();
    if (info.over) { if (!room.endAt) room.endAt = now + 30000; else if (now > room.endAt) closeRoom(room, 'fin'); }
    else if (info.humans === 0 && !room.seats.some(s => s.connected)) closeRoom(room, 'vacía');
  }, TICK_MS);
  broadcastRooms();
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

  socket.on('create', cfg => {
    if (limited() || !cfg || typeof cfg !== 'object') return;
    if (socket.data.room) leave(socket);
    if (rooms.size >= MAX_ROOMS) return socket.emit('err', 'El servidor está lleno, prueba en un rato');
    const room = {
      code: newCode(),
      name: clean(cfg.name, 24, 'Sala'),
      max: Math.min(8, Math.max(2, cfg.max | 0 || 8)),
      diff: DIFFS.includes(cfg.diff) ? cfg.diff : 'normal',
      owner: socket.id, state: 'lobby', game: null, timer: null,
      seats: [{ peer: socket.id, nick: clean(cfg.nick, 14, 'Entrenador'), av: clean(cfg.av, 4, '🧢'), connected: true }],
    };
    rooms.set(room.code, room);
    socket.join(room.code); socket.data.room = room.code;
    emitLobby(room); broadcastRooms();
  });

  socket.on('join', d => {
    if (limited() || !d || typeof d !== 'object') return;
    const code = typeof d.code === 'string' ? d.code.toLowerCase() : '';
    const room = rooms.get(code);
    if (!room) return socket.emit('err', 'No existe ninguna sala con ese código');
    if (room.state !== 'lobby') return socket.emit('err', 'Esa partida ya empezó');
    if (room.seats.length >= room.max) return socket.emit('err', 'La sala está llena');
    if (socket.data.room) leave(socket);
    room.seats.push({ peer: socket.id, nick: clean(d.nick, 14, 'Entrenador'), av: clean(d.av, 4, '🧢'), connected: true });
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

if (require.main === module) {
  server.listen(PORT, () => console.log(`Poké Tactics escuchando en el puerto ${PORT}`));
}
module.exports = { server, rooms };
