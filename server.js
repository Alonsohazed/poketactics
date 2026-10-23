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
const COSM = require('./public/cosmetics');

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
const auth = createAuth(db, { trainers: TRAINER_KEYS, presence: presenceOf, onFriends, onEevee });
app.get('/health', (req, res) => res.json({ ok: true, rooms: rooms.size }));
// Commit desplegado: el navegador pide los modelos animados (public/anims) a jsDelivr fijados a este commit, así no gastan
// el ancho de banda de Render. En local no hay commit y se sirven desde aquí.
app.get('/api/build', (req, res) => res.json({ commit: process.env.RENDER_GIT_COMMIT || '', repo: process.env.CDN_REPO || 'Alonsohazed/poketactics' }));
app.use('/api', auth.router);
// Sin caché larga: tras cada despliegue el navegador revalida (ETag) y nunca mezcla versiones
// Imágenes (arte de cartas, logo, iconos): caché de 7 días; HTML y JS se revalidan siempre porque cambian con cada despliegue
express.static.mime.define({ 'image/avif': ['avif'] }); // los retratos van en AVIF y esta versión de Express no conoce el tipo
app.use(express.static(path.join(__dirname, 'public'), { setHeaders(res, file) { if (/\.(webp|avif|png|jpe?g|svg)$/i.test(file)) res.setHeader('Cache-Control', 'public, max-age=604800'); } }));

const server = http.createServer(app);
// Mensajes de 1 KB o más comprimidos (estado de la partida en JSON: ocupa una fracción); los pequeños van tal cual para no gastar CPU
// pingInterval/pingTimeout más generosos que los de serie (25 s + 20 s): una pestaña en segundo plano o una red lenta no se toma por desconexión
const io = new Server(server, { maxHttpBufferSize: 16 * 1024, perMessageDeflate: { threshold: 256 }, pingInterval: 15000, pingTimeout: 40000 });
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
  if (topic === 'cmbs' && data && data.to) io.to(data.to).emit(topic, data);
  else if (topic === 'pub' || topic === 'car' || topic === 'cmbs' || topic === 'cmbev') io.to(room.code).emit(topic, data);
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
    { diff: room.diff, humans: publicSeats(room.seats), bots: room.botInfo.map(b => ({ skill: b.skill })), taken: n => db.nameTaken(n), timer: [30, 45, 60].includes(opts.timer) ? opts.timer : 30, speed: [1, 2, 4].includes(opts.speed) ? opts.speed : 1 },
    (t, d) => route(room, t, d)
  );
  let last = Date.now();
  room.timer = setInterval(() => {
    const now = Date.now();
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    // La partida NUNCA se pausa: el ausente sigue cobrando su economía y su tablero pelea (sin que nadie lo juegue). Si no queda ninguna persona conectada, la sala
    // espera REJOIN_MS por si vuelven; pasado el plazo los ausentes quedan eliminados (último puesto entre los vivos) y se apunta su resultado
    try { room.game.serverTick(dt); }
    catch (e) { console.error(`[${room.code}] error en la partida`, e); closeRoom(room, 'error'); return; }
    const info = room.game.serverInfo();
    recordPlaces(room, info);
    if (info.over) { if (!room.endAt) room.endAt = now + 30000; else if (now > room.endAt) closeRoom(room, 'fin'); }
    else if (!room.seats.some(s => s.connected)) {
      if (!room.seats.some(s => !s.recorded)) closeRoom(room, 'vacía'); // todos eliminados y fuera
      else {
        room.emptySince = room.emptySince || now;
        if (now - room.emptySince > REJOIN_MS) { try { room.game.serverForfeit(); recordPlaces(room, room.game.serverInfo()); } catch (e) { console.error(e); } closeRoom(room, 'abandono'); }
      }
    } else room.emptySince = 0;
  }, TICK_MS);
  broadcastRooms();
}

// Pantalla de resultados: los 8 jugadores tal y como estaban al terminar esta persona (los eliminados con su equipo final,
// los vivos con el de ahora y place 0). Personas y rivales generados con la misma forma; las personas con su nombre completo
// de cuenta, para poder pedirles amistad por nombre (los rivales nunca se llaman como una cuenta).
function resultBoard(room, meIdx) {
  let B = []; try { B = room.game.serverBoards(); } catch (e) { /* noop */ }
  return B.map((b, j) => { const s = b.peer && room.seats.find(q => q.peer === b.peer), c = b.comp || {};
    return { n: s ? s.full || s.nick : b.name, pl: b.place || 0, tac: b.tac, tf: b.tf, lvl: c.lvl || 0, rd: c.round || '', u: c.units || [], t: c.traits || [], a: c.augs || [], me: j === meIdx }; });
}
// Último resultado de cada persona hasta que su navegador confirma que lo recibió (resultSeen): si se corta justo al
// terminar, se le reenvía al volver a conectar (como mucho 15 min)
const lastResults = new Map();
setInterval(() => { const lim = Date.now() - 15 * 60 * 1000; for (const [u, v] of lastResults) if (v.at < lim) lastResults.delete(u); }, 60 * 1000).unref();
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
    const board = resultBoard(room, i), uid = seat.uid;
    db.recordMatch(seat.uid, room.matchId, mode, comp => {
      const r = CMP.applyMatch(comp, { mode, place: e.place, opps });
      Object.assign(r.rec, { comp: e.comp || null, participants, duration: Math.round((Date.now() - room.startedAt) / 1000) });
      return r;
    }).then(r => { if (!r || r.dup) return; const msg = { mode, rec: r.rec, comp: CMP.publicComp(r.comp), board };
      lastResults.set(uid, { msg, at: Date.now() }); io.to(seat.peer).emit('result', msg); })
      .catch(err => console.error(`[${room.code}] no se pudo guardar el resultado`, err.message));
  });
}
// Asiento con los datos de la cuenta (no se fía de lo que mande el navegador)
async function seatFor(socket) {
  const u = socket.data.user;
  const fresh = await db.userById(u.id).catch(() => null);
  const c = CMP.normComp(fresh && fresh.comp);
  const tr = (fresh || u).trainer || ''; // nunca una minileyenda que la cuenta no tenga (por si quedó de antes de la migración)
  return { peer: socket.id, uid: u.id, nick: u.name.slice(0, 14), full: u.name, tr: COSM.ownsTac(fresh && fresh.cosm, tr) ? tr : COSM.DEFAULT_TAC, connected: true, nmmr: c.nmmr, rmmr: c.rmmr };
}

// ---------- colas Normal y Clasificatoria ----------
const queues = { normal: [], ranked: [] };
const inQueue = uid => MODES.some(m => queues[m].some(e => e.uid === uid));
const REJOIN_MS = +process.env.REJOIN_MS || 4 * 60 * 1000; // una sala sin nadie conectado espera tanto antes de cerrarse (para poder volver)
const inGame = uid => [...rooms.values()].some(r => r.seats.some(s => s.uid === uid && (r.state === 'lobby' || (r.state === 'game' && !s.recorded))));
// La partida que puede retomar un usuario: sala en juego, su asiento sin cerrar (no eliminado) y sin conexión
function resumable(uid) { for (const r of rooms.values()) { if (r.state !== 'game' || !r.game) continue; const s = r.seats.find(x => x.uid === uid && !x.recorded); if (s) return { room: r, seat: s }; } return null; }
const resumeInfo = (uid) => { const x = resumable(uid); return x ? { mode: x.room.mode || 'custom', round: (x.room.game.serverInfo() || {}).round || '', connected: !!x.seat.connected } : null; };
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
    // Si el asiento ya pasó a otra conexión (volvió antes de que el servidor notara el corte), la vieja no lo toca
    const seat = room.seats.find(s => s.peer === socket.id);
    if (!seat) return;
    seat.connected = false; seat.lostAt = Date.now();
    try { room.game.serverLeave(socket.id); } catch (e) { /* noop */ }
  }
}

// ---------- amigos: estado en directo ----------
// online: conexiones de cada usuario. Cada 2 s se calcula el estado de los usuarios conocidos y, si cambia, se avisa a
// sus amigos conectados (sala de Socket.io «u:<id>»). Las listas de amigos se guardan en memoria hasta que cambian.
const online = new Map(), userNames = new Map(), lastPres = new Map(), friendCache = new Map();
function presenceOf(uid) {
  for (const r of rooms.values()) { const s = r.seats.find(x => x.uid === uid); if (!s) continue;
    if (r.state === 'lobby') return { st: 'lobby' };
    if (r.state === 'game' && !s.recorded) { let round = ''; try { round = (r.game.serverInfo() || {}).round || ''; } catch (e) { /* noop */ } return { st: 'game', r: round, mode: r.mode || 'custom' }; } }
  if (inQueue(uid)) return { st: 'queue' };
  return online.has(uid) ? { st: 'menu' } : { st: 'off' };
}
const friendsOf = uid => { if (!friendCache.has(uid)) friendCache.set(uid, db.friendIds(uid).then(a => new Set(a), () => (friendCache.delete(uid), new Set()))); return friendCache.get(uid); };
// Alguien ha conseguido a Eevee: aviso a quien está en el menú (no a quien está jugando una partida)
function onEevee(name) { for (const s of io.sockets.sockets.values()) if (!s.data.room && !inQueue(s.data.user.id)) s.emit('ann', { name: String(name).slice(0, 20) }); }
// La lista de alguien cambió (solicitud, aceptar, eliminar…): se olvida su caché y se le pide al navegador que la recargue
function onFriends(uids) { for (const u of new Set(uids)) { friendCache.delete(u); io.to('u:' + u).emit('friends'); } }
setInterval(async () => {
  for (const uid of new Set([...online.keys(), ...lastPres.keys()])) {
    const p = presenceOf(uid), k = JSON.stringify(p); if (lastPres.get(uid) === k) continue;
    if (p.st === 'off') lastPres.delete(uid); else lastPres.set(uid, k);
    const name = userNames.get(uid); if (!name) continue;
    for (const f of await friendsOf(uid)) if (online.has(f)) io.to('u:' + f).emit('friendUpd', Object.assign({ name }, p));
  }
}, +process.env.PRESENCE_MS || 2000).unref();

// ---------- conexiones ----------
io.on('connection', socket => {
  socket.data.room = null;
  const me = socket.data.user; socket.join('u:' + me.id); userNames.set(me.id, me.name);
  if (!online.has(me.id)) online.set(me.id, new Set()); online.get(me.id).add(socket.id);
  let bucket = 0, bucketAt = Date.now();
  const limited = () => { // máx. ~40 mensajes por segundo por jugador
    const now = Date.now();
    if (now - bucketAt > 1000) { bucket = 0; bucketAt = now; }
    return ++bucket > 40;
  };

  socket.on('list', () => socket.emit('rooms', roomList()));
  // resultado que no llegó a confirmarse (corte justo al terminar): se reenvía una vez conectado
  { const lr = lastResults.get(me.id); if (lr) socket.emit('result', Object.assign({ late: true }, lr.msg)); }
  socket.on('resultSeen', () => lastResults.delete(me.id));
  // ¿tengo una partida a medias? (al conectar, y cada vez que el menú lo pregunta)
  socket.emit('resume', resumeInfo(socket.data.user.id));
  socket.on('resumable', () => { if (!limited()) socket.emit('resume', resumeInfo(socket.data.user.id)); });
  // Volver a tu asiento: el servidor cambia el id de conexión del asiento y del jugador, y reenvía el estado completo
  socket.on('rejoin', () => {
    if (limited()) return;
    const uid = socket.data.user.id;
    if (socket.data.room) leave(socket);
    if (inQueue(uid)) return socket.emit('rejoinfail', { why: 'Sal de la cola antes de volver a tu partida' });
    const x = resumable(uid);
    if (!x) return socket.emit('rejoinfail', { why: 'No tienes ninguna partida en curso (ya terminó o te eliminaron)' });
    const { room, seat } = x, old = seat.peer;
    if (seat.connected && old !== socket.id) { // otra ventana tuya sigue conectada: se cede el asiento a esta
      const prev = io.sockets.sockets.get(old); if (prev) { prev.data.room = null; prev.leave(room.code); prev.emit('bye', { reason: 'otra ventana' }); }
    }
    seat.peer = socket.id; seat.connected = true; seat.lostAt = 0; room.emptySince = 0;
    socket.join(room.code); socket.data.room = room.code;
    let ok = false; try { ok = room.game.serverRejoin(old, socket.id); } catch (e) { console.error(e); }
    if (!ok) { seat.peer = old; seat.connected = false; socket.leave(room.code); socket.data.room = null; return socket.emit('rejoinfail', { why: 'No se pudo recuperar tu asiento' }); } // deshace el cambio: si no, asiento y jugador quedaban con ids distintos y ningún intento posterior funcionaba
    console.log(`[${room.code}] ${seat.nick} vuelve a la partida (${old === socket.id ? 'misma conexión' : 'conexión nueva'})`);
    socket.emit('start', { seats: publicSeats(room.seats) });
    room.game.serverResend(socket.id);
  });

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
  socket.on('disconnect', reason => {
    // Registro de cortes en partida (se ve en los logs de Render) para saber por qué se cae la gente: ping timeout, transport close…
    const room = rooms.get(socket.data.room); if (room && room.state === 'game') console.log(`[${room.code}] ${socket.data.user.name} se desconecta: ${reason}`);
    unqueue(socket); leave(socket);
    const set = online.get(me.id); if (set) { set.delete(socket.id); if (!set.size) online.delete(me.id); }
  });
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
