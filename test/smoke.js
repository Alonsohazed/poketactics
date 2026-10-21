'use strict';
// Prueba de humo: cuentas + 2 jugadores en una sala jugando varias rondas.
const fs = require('fs');
const os = require('os');
const path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'poke-tactics-'));
process.env.DB_FILE = path.join(tmp, 'db.json');
delete process.env.DATABASE_URL;

const { server, ready } = require('../server');
const { io } = require('socket.io-client');
const assert = require('assert');

const sleep = ms => new Promise(r => setTimeout(r, ms));
ready.then(() => server.listen(0, async () => {
  const url = `http://localhost:${server.address().port}`;
  const post = (p, body, cookie, extra = {}) => fetch(url + p, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...extra }, body: JSON.stringify(body),
  });
  const cookieOf = res => (res.headers.get('set-cookie') || '').split(';')[0];

  // ---- cuentas ----
  let r = await post('/api/register', { user: 'Ana', pass: 'secreta1', trainer: 'bulbasaur' });
  assert.strictEqual(r.status, 201, 'registro');
  const cookieA = cookieOf(r);
  assert(/^pt_sid=/.test(cookieA), 'cookie de sesión');
  assert(/HttpOnly/i.test(r.headers.get('set-cookie')), 'cookie HttpOnly');
  assert.strictEqual((await post('/api/register', { user: 'ana', pass: 'otraclave' })).status, 409, 'usuario repetido (sin distinguir mayúsculas)');
  assert.strictEqual((await post('/api/register', { user: 'a', pass: 'secreta1' })).status, 400, 'usuario demasiado corto');
  assert.strictEqual((await post('/api/register', { user: 'Corto', pass: '123' })).status, 400, 'contraseña corta');
  assert.strictEqual((await post('/api/login', { user: 'Ana', pass: 'mala-clave' })).status, 401, 'contraseña incorrecta');
  assert.strictEqual((await post('/api/login', { user: 'Nadie', pass: 'secreta1' })).status, 401, 'usuario inexistente');
  assert.strictEqual((await post('/api/login', { user: 'Ana', pass: 'secreta1' }, '', { Origin: 'https://malo.example' })).status, 403, 'origen ajeno');
  r = await post('/api/login', { user: 'ANA', pass: 'secreta1' });
  assert.strictEqual(r.status, 200, 'login sin distinguir mayúsculas');
  let me = await (await fetch(url + '/api/me', { headers: { Cookie: cookieA } })).json();
  assert.strictEqual(me.user.trainer, 'bulbasaur', 'minileyenda guardada');
  assert.strictEqual(me.user.pass, undefined, 'nunca se envía la contraseña');
  assert.strictEqual((await fetch(url + '/api/me')).status, 401, 'sin sesión');
  assert.strictEqual((await post('/api/me', { trainer: 'noexiste' }, cookieA)).status, 400, 'entrenador no válido');
  assert.strictEqual((await post('/api/me', { trainer: 'squirtle', settings: { vol: 3, hack: 'x' } }, cookieA)).status, 200, 'cambiar minileyenda');
  me = await (await fetch(url + '/api/me', { headers: { Cookie: cookieA } })).json();
  assert.strictEqual(me.user.trainer, 'squirtle');
  assert.deepStrictEqual(me.user.settings, { vol: 1 }, 'ajustes saneados');
  r = await post('/api/register', { user: 'Beto', pass: 'secreta2', trainer: 'charmander' });
  const cookieB = cookieOf(r);
  // cerrar sesión invalida la cookie
  const tmpLogin = cookieOf(await post('/api/login', { user: 'Beto', pass: 'secreta2' }));
  await post('/api/logout', {}, tmpLogin);
  assert.strictEqual((await fetch(url + '/api/me', { headers: { Cookie: tmpLogin } })).status, 401, 'sesión cerrada');

  // socket sin sesión: rechazado
  const anon = io(url, { transports: ['websocket'] });
  const anonErr = await new Promise(res => { anon.on('connect_error', e => res(e.message)); anon.on('connect', () => res('conectado')); });
  assert.strictEqual(anonErr, 'auth', 'socket sin sesión rechazado');
  anon.close();

  // ---- emparejamiento al estilo TFT ----
  {
    const vm = require('vm');
    const ctx = { __SERVER__: true, module: { exports: {} }, console, setTimeout, clearTimeout, setInterval, clearInterval };
    vm.createContext(ctx);
    vm.runInContext(['augments.js', 'game.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8')).join('\n'), ctx);
    const E = ctx.module.exports;
    for (let rep = 0; rep < 20; rep++) {
      E.newGame({ auto: true, diff: 'normal' });
      const G = E.G, ps = G.players, seen = new Map(ps.map(p => [p.id, new Set()]));
      let last = new Map();
      for (let round = 0; round < 7; round++) {
        G.roundIdx = 10 + round;
        const fights = E.makeFights(ps);
        assert.strictEqual(fights.length, 4, '4 combates con 8 jugadores');
        for (const f of fights) {
          assert.notStrictEqual(last.get(f.a.id), f.b.id, 'nunca el mismo rival dos rondas seguidas');
          seen.get(f.a.id).add(f.b.id); seen.get(f.b.id).add(f.a.id);
          last.set(f.a.id, f.b.id); last.set(f.b.id, f.a.id); f.a.lastOpp = f.b.id; f.b.lastOpp = f.a.id;
        }
      }
      for (const [, s] of seen) assert(s.size >= 6, `en 7 rondas cada uno se enfrenta a casi todos (visto ${s.size})`);
      assert(E.possibleOpps(ps[0]).every(p => p.id !== ps[0].lastOpp), 'el último rival no sale como posible');
    }
  }

  // ---- partida ----
  const mk = cookie => io(url, { transports: ['websocket'], extraHeaders: { Cookie: cookie } });
  const A = mk(cookieA); let B = mk(cookieB);
  const st = { A: { pub: 0, priv: null, cmb: 0, rounds: new Set() }, B: { pub: 0, priv: null, cmb: 0, rounds: new Set() } };
  let lobby = null, started = 0, lastPub = null;
  for (const [k, s] of [['A', A], ['B', B]]) {
    s.on('lobby', d => { lobby = d; });
    s.on('start', () => started++);
    s.on('pub', d => { st[k].pub++; st[k].ph = d.ph; st[k].rounds.add(d.ri); st[k].over = d.ov; lastPub = d; });
    s.on('priv', d => { if (d.to === s.id) st[k].priv = d; });
    s.on('cmb', d => { if (d.to === s.id) st[k].cmb++; });
    s.on('cmbs', d => { st[k].cmbs = d.list.length; });
    s.on('err', m => console.log(k, 'err', m));
  }
  await sleep(300);
  A.emit('create', { name: 'Prueba', max: 4, diff: 'normal', nick: 'Impostor' });
  await sleep(200);
  assert(lobby && lobby.code, 'sala creada');
  assert.strictEqual(lobby.seats[0].nick, 'Ana', 'el nombre sale de la cuenta, no del navegador');
  assert.strictEqual(lobby.seats[0].tr, 'squirtle', 'la minileyenda sale de la cuenta');
  B.emit('join', { code: lobby.code });
  await sleep(200);
  assert.strictEqual(lobby.seats.length, 2, 'dos jugadores en la sala');
  A.emit('start', { timer: 30, speed: 4 });
  const t0 = Date.now();
  let tposSent = false, idA = -1, rejoined = false;
  while (Date.now() - t0 < 120000) {
    // Corte y reconexión de B a mitad de partida: su asiento lo recupera con otro id de conexión y recibe su estado
    if (!rejoined && st.A.rounds.size >= 5) { rejoined = true;
      B.disconnect(); await sleep(600);
      const B2 = mk(cookieB), got = { start: 0, seats: [], priv: null, resume: undefined, fail: null, pub: null };
      B2.on('start', d => { got.start++; got.seats = d.seats; }); B2.on('priv', d => { if (d.to === B2.id) { got.priv = d; st.B.priv = d; } }); B2.on('resume', d => { if (got.resume === undefined) got.resume = d; });
      B2.on('rejoinfail', d => { got.fail = d; }); B2.on('pub', d => { got.pub = d; st.B.ph = d.ph; }); B2.on('cmb', d => { if (d.to === B2.id) st.B.cmb++; }); B2.on('err', m => console.log('B2 err', m));
      await sleep(600);
      assert(got.resume && got.resume.round, 'el servidor avisa de que hay una partida a medias: ' + JSON.stringify(got.resume));
      B2.emit('rejoin'); await sleep(1000);
      assert.strictEqual(got.fail, null, 'la reconexión no falla: ' + JSON.stringify(got.fail));
      assert.strictEqual(got.start, 1, 'recibe start al volver');
      assert(got.seats.some(x => x.peer === B2.id), 'el asiento lleva su nueva conexión');
      assert(got.priv, 'recibe su estado privado al volver');
      assert(got.pub && got.pub.pl.some(p => p[8] === B2.id), 'el estado público apunta a su nueva conexión');
      B = B2; // sigue jugando con la conexión nueva
      // Burla de Charmander (H): solo cuenta quien lleva Charmander (Beto), una vez cada 1,4 s, y llega a todos en pub.pl[i][17]
      B.emit('act', { t: 'taunt' }); B.emit('act', { t: 'taunt' }); A.emit('act', { t: 'taunt' }); await sleep(700);
      const tn = nick => lastPub.pl.find(p => p[1] === nick)[17];
      assert.strictEqual(tn('Beto'), 1, 'la burla de Charmander llega a todos (y la segunda seguida se ignora)');
      assert.strictEqual(tn('Ana'), 0, 'quien no lleva Charmander no puede burlarse');
      // sin partida a medias no se puede «volver»: el usuario A tiene su asiento conectado, así que rejoin le cede el asiento solo a una ventana nueva (no se prueba aquí)
    }
    // Minileyenda de B en el tablero de A: entradas inválidas (jugador inexistente, tipos raros, fuera de rango) y luego una válida
    if (lastPub && !tposSent && rejoined) { tposSent = true; idA = lastPub.pl.find(p => p[1] === 'Ana')[0];
      B.emit('act', { t: 'tpos', b: 99, x: 1, y: 1 }); B.emit('act', { t: 'tpos', b: 'x', x: {}, y: [] }); B.emit('act', { t: 'tpos', b: idA, x: 1e9, y: -1e9 });
      B.emit('act', { t: 'tpos', b: idA, x: 4.5, y: 9.25 }); }
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
  assert(st.A.cmbs >= 4 && st.B.cmbs >= 4, 'cada jugador recibe todos los combates para poder verlos');
  assert(Array.isArray(st.A.priv.po), 'llegan los posibles rivales');
  assert(lastPub.pl.every(p => ['charmander', 'bulbasaur', 'squirtle', 'dratini', 'pichu', 'abra', 'eevee'].includes(p[14])), 'todos los jugadores llevan minileyenda');
  assert.strictEqual(lastPub.pl.find(p => p[1] === 'Ana')[14], 'squirtle', 'la minileyenda de la partida sale de la cuenta');
  const tpB = lastPub.pl.find(p => p[8] && p[1] !== 'Ana')[16];
  assert.deepStrictEqual(tpB, [idA, 4.5, 9.25], 'la posición de la minileyenda de B llega a todos (y las inválidas se ignoran): ' + JSON.stringify(tpB));
  assert(lastPub.pl.filter(p => !p[8]).every(p => p[16] === 0), 'los asientos sin persona no mandan posición');
  B.disconnect(); await sleep(400);
  A.disconnect(); await sleep(300);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('OK: prueba de humo superada');
  process.exit(0);
}));
