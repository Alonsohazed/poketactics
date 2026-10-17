'use strict';
// Prueba de humo: levanta el servidor, conecta 2 jugadores, crea sala, juega varias rondas.
const { server } = require('../server');
const { io } = require('socket.io-client');
const assert = require('assert');

const sleep = ms => new Promise(r => setTimeout(r, ms));
server.listen(0, async () => {
  const url = `http://localhost:${server.address().port}`;
  const mk = () => io(url, { transports: ['websocket'] });
  const A = mk(), B = mk();
  const st = { A: { pub: 0, priv: null, cmb: 0, rounds: new Set() }, B: { pub: 0, priv: null, cmb: 0, rounds: new Set() } };
  let lobby = null, started = 0;
  for (const [k, s] of [['A', A], ['B', B]]) {
    s.on('lobby', d => { lobby = d; });
    s.on('start', () => started++);
    s.on('pub', d => { st[k].pub++; st[k].ph = d.ph; st[k].rounds.add(d.ri); st[k].over = d.ov; });
    s.on('priv', d => { if (d.to === s.id) st[k].priv = d; });
    s.on('cmb', d => { if (d.to === s.id) st[k].cmb++; });
    s.on('err', m => console.log(k, 'err', m));
  }
  await sleep(300);
  A.emit('create', { name: 'Prueba', max: 4, diff: 'normal', nick: 'Ana', av: '⭐' });
  await sleep(200);
  assert(lobby && lobby.code, 'sala creada');
  B.emit('join', { code: lobby.code, nick: 'Beto', av: '🔥' });
  await sleep(200);
  assert.strictEqual(lobby.seats.length, 2, 'dos jugadores en la sala');
  A.emit('start', { timer: 30, speed: 4 });
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    for (const [k, s] of [['A', A], ['B', B]]) {
      const p = st[k].priv; if (!p) continue;
      s.emit('act', { t: 'buy', i: Math.floor(Math.random() * 5) });
      if (p.ac && p.ac.length) s.emit('act', { t: 'aug', i: 0 });
      if (st[k].ph === 'carousel') s.emit('act', { t: 'car', i: Math.floor(Math.random() * 9) });
      if (st[k].ph === 'planning') s.emit('act', { t: 'ready' });
      s.emit('act', { t: 'nonsense', x: {} }); // debe ignorarse sin romper nada
    }
    if (st.A.rounds.size >= 12 || st.A.over) break;
    await sleep(150);
  }
  console.log('rondas vistas', st.A.rounds.size, '| combates A', st.A.cmb, 'B', st.B.cmb, '| oro A', st.A.priv.g, 'B', st.B.priv.g, '| tablero A', st.A.priv.bo.length);
  assert.strictEqual(started, 2, 'ambos recibieron start');
  assert(st.A.rounds.size >= 8, 'la partida avanza');
  assert(st.A.cmb > 0 && st.B.cmb > 0, 'cada jugador recibe su combate');
  B.disconnect(); await sleep(400);
  A.disconnect(); await sleep(300);
  console.log('OK: prueba de humo superada');
  process.exit(0);
});
