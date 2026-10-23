'use strict';
// Prueba de humo: cuentas + 2 jugadores en una sala jugando varias rondas.
const fs = require('fs');
const os = require('os');
const path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'poke-tactics-'));
process.env.DB_FILE = path.join(tmp, 'db.json');
delete process.env.DATABASE_URL;
process.env.PRESENCE_MS = '250'; // el estado de los amigos se revisa cada 250 ms en la prueba

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

  // ---- perfil: solo el propio; para cualquier otro nombre (exista o no), 404 igual; nada privado ----
  {
    const prof = (n, ck) => fetch(url + '/api/profile/' + encodeURIComponent(n), { headers: ck ? { Cookie: ck } : {} });
    assert.strictEqual((await prof('Ana')).status, 401, 'perfil sin sesión');
    const pr = await prof('ana', cookieA); assert.strictEqual(pr.status, 200, 'mi perfil (sin distinguir mayúsculas)');
    const P = (await pr.json()).profile, txt = JSON.stringify(P);
    assert(P.name === 'Ana' && P.trainer === 'squirtle' && P.account.level === 1 && P.ranked.placing && P.peak === null && P.byMode.normal.games === 0 && Array.isArray(P.history), 'perfil nuevo: nivel 1, sin clasificar y sin partidas');
    assert(!/pass|settings|mmr|scrypt|"id"/i.test(txt), 'el perfil no lleva contraseña, ajustes, MMR ni ids');
    const other = await prof('Beto', cookieA), none = await prof('NoExisteNadie', cookieA), bad = await prof('x<y>', cookieA);
    assert(other.status === 404 && none.status === 404 && bad.status === 404, 'perfil ajeno, inexistente o con nombre raro: el mismo 404');
    assert.strictEqual(JSON.stringify(await other.json()), JSON.stringify(await none.json()), 'una cuenta real y un nombre inventado responden igual');
  }

  // ---- amigos: validación, solicitudes indistinguibles, aceptar, bloquear, límites y estado en directo ----
  {
    const fr = async ck => (await (await fetch(url + '/api/friends', { headers: { Cookie: ck } })).json());
    const op = async (o, name, ck) => { const r = await post('/api/friends/' + o, { name }, ck); return { s: r.status, b: await r.json() }; };
    assert.strictEqual((await fetch(url + '/api/friends')).status, 401, 'amigos sin sesión');
    assert.strictEqual((await op('request', 'Ana', cookieA)).s, 400, 'no puedes agregarte a ti mismo');
    assert.strictEqual((await op('request', 'a<b', cookieA)).s, 400, 'nombre no válido');
    assert.strictEqual((await op('request', 7, cookieA)).s, 400, 'nombre que no es texto');
    assert.strictEqual((await op('hack', 'Beto', cookieA)).s, 404, 'acción inexistente');
    assert.strictEqual((await post('/api/friends/request', { name: 'Beto' }, cookieA, { Origin: 'https://malo.example' })).status, 403, 'solicitud desde otro origen');
    // a una cuenta real y a un nombre sin cuenta (o de un rival generado) se responde exactamente igual
    const real = await op('request', 'Beto', cookieA), ghost = await op('request', 'NoExiste_9', cookieA);
    assert(real.s === 200 && ghost.s === 200, 'solicitudes enviadas');
    assert.deepStrictEqual(Object.keys(real.b).sort(), Object.keys(ghost.b).sort(), 'misma forma de respuesta');
    assert.strictEqual(real.b.msg.replace('Beto', 'X'), ghost.b.msg.replace('NoExiste_9', 'X'), 'mismo mensaje');
    assert.deepStrictEqual(ghost.b.outgoing.map(o => o.name).sort(), ['Beto', 'NoExiste_9'], 'las dos se ven como enviadas');
    assert.strictEqual((await op('request', 'beto', cookieA)).s, 409, 'solicitud repetida (sin distinguir mayúsculas)');
    assert.strictEqual((await op('request', 'noexiste_9', cookieA)).s, 409, 'solicitud fantasma repetida');
    let B = await fr(cookieB); assert.deepStrictEqual(B.incoming.map(x => x.name), ['Ana'], 'Beto recibe la solicitud');
    assert(!/pass|settings|mmr|"id"/i.test(JSON.stringify(B)), 'la lista de amigos no lleva datos privados');
    assert.strictEqual((await fetch(url + '/api/profile/Ana', { headers: { Cookie: cookieB } })).status, 404, 'sin ser amigos no se ve el perfil');
    assert.strictEqual((await op('accept', 'NoExiste_9', cookieB)).s, 404, 'aceptar una solicitud que no existe');
    const acc = await op('accept', 'Ana', cookieB); assert(acc.s === 200 && acc.b.friends.some(f => f.name === 'Ana' && f.st), 'aceptar');
    let A = await fr(cookieA); assert(A.friends.some(f => f.name === 'Beto') && !A.outgoing.some(o => o.name === 'Beto'), 'amistad en las dos direcciones');
    const pB = await fetch(url + '/api/profile/beto', { headers: { Cookie: cookieA } }); const pj = await pB.json();
    assert(pB.status === 200 && pj.friend && pj.profile.name === 'Beto' && pj.presence && !/pass|settings|mmr/i.test(JSON.stringify(pj)), 'perfil de un amigo, sin datos privados');
    assert.strictEqual((await op('request', 'Beto', cookieA)).s, 409, 'ya sois amigos');
    assert.strictEqual((await op('cancel', 'NoExiste_9', cookieA)).s, 200, 'cancelar la fantasma'); assert.strictEqual((await op('cancel', 'NoExiste_9', cookieA)).s, 404, 'cancelar dos veces');
    assert.strictEqual((await op('block', 'NoExiste_9', cookieA)).s, 404, 'solo se bloquea a amigos o a quien te pide');
    // bloquear: la otra persona deja de verte como amigo; si te vuelve a pedir, para ella queda pendiente y tú no recibes nada
    assert.strictEqual((await op('block', 'Ana', cookieB)).s, 200, 'Beto bloquea a Ana');
    A = await fr(cookieA); assert(!A.friends.length, 'al bloquear se rompe la amistad');
    const again = await op('request', 'Beto', cookieA); assert(again.s === 200 && again.b.outgoing.some(o => o.name === 'Beto'), 'a quien te bloqueó le «envías» la solicitud igual');
    B = await fr(cookieB); assert(!B.incoming.length && B.blocked.some(x => x.name === 'Ana'), 'el que bloquea no recibe nada');
    assert.strictEqual((await op('request', 'Ana', cookieB)).s, 400, 'no puedes pedir amistad a quien tienes bloqueado');
    assert.strictEqual((await op('unblock', 'Ana', cookieB)).s, 200, 'desbloquear'); assert.strictEqual((await op('cancel', 'Beto', cookieA)).s, 200, 'cancelar');
    // rechazar: quien pidió no se entera (sigue viendo la solicitud pendiente)
    await op('request', 'Beto', cookieA); assert.strictEqual((await op('decline', 'Ana', cookieB)).s, 200, 'rechazar');
    A = await fr(cookieA); assert(A.outgoing.some(o => o.name === 'Beto') && !A.friends.length, 'tras rechazar, para Ana sigue pendiente');
    B = await fr(cookieB); assert(!B.incoming.length, 'y Beto ya no la tiene');
    await op('cancel', 'Beto', cookieA);
    // si los dos se piden amistad, se aceptan solos
    await op('request', 'Ana', cookieB); const both = await op('request', 'Beto', cookieA); assert(both.s === 200 && both.b.friends.some(f => f.name === 'Beto'), 'solicitud cruzada: amigos ' + JSON.stringify(both));
    // límite de 10 solicitudes por minuto
    const ckC = cookieOf(await post('/api/register', { user: 'Carla', pass: 'secreta3' })); let last;
    for (let i = 0; i < 11; i++) last = await op('request', 'Nadie_' + i, ckC);
    assert.strictEqual(last.s, 429, 'límite de solicitudes por minuto');
    // máximo de 20 enviadas sin respuesta y caducidad a los 14 días (directamente con la base)
    const db = require('../db'), FRM = require('../friends'), C = await db.userByName('Carla');
    for (let i = 10; i < 20; i++) await FRM.act(db, C, 'request', 'Nadie_' + i);
    const over = await FRM.act(db, C, 'request', 'Nadie_99'); assert(over.code === 400 && /20/.test(over.error), 'máximo de 20 solicitudes sin respuesta');
    const fdb = JSON.parse(fs.readFileSync(process.env.DB_FILE, 'utf8')); assert(fdb.ghosts.length >= 20, 'fantasmas guardadas');
    await db.purgeFriends(-1); assert.strictEqual((await FRM.view(db, C)).outgoing.length, 0, 'las solicitudes caducan');
    // estado en directo: al conectarse Beto, Ana recibe «En línea»; al desconectarse, «Desconectado»
    const sA = io(url, { transports: ['websocket'], extraHeaders: { Cookie: cookieA } }); const ups = []; sA.on('friendUpd', d => ups.push(d));
    await new Promise(r => sA.on('connect', r)); await sleep(400);
    const sB = io(url, { transports: ['websocket'], extraHeaders: { Cookie: cookieB } }); await new Promise(r => sB.on('connect', r)); await sleep(700);
    assert(ups.some(d => d.name === 'Beto' && d.st === 'menu'), 'Ana ve a Beto en línea');
    assert((await fr(cookieA)).friends.find(f => f.name === 'Beto').st === 'menu', 'la lista también lo dice');
    sB.emit('queue', { mode: 'normal' }); await sleep(600); assert(ups.some(d => d.name === 'Beto' && d.st === 'queue'), 'Ana ve a Beto en cola');
    sB.emit('unqueue'); sB.close(); await sleep(700); assert(ups[ups.length - 1].name === 'Beto' && ups[ups.length - 1].st === 'off', 'Ana ve a Beto desconectado');
    assert(!ups.some(d => 'id' in d || 'uid' in d), 'el estado no lleva ids');
    // avisos: si alguien te pide amistad, tu navegador recibe «friends» para recargar la lista
    let pinged = 0; sA.on('friends', () => pinged++); const ckD = cookieOf(await post('/api/register', { user: 'Dani', pass: 'secreta4' })); await op('request', 'Ana', ckD); await sleep(200); assert(pinged >= 1, 'aviso de solicitud nueva');
    sA.close();
  }

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

  // ---- desconexión: el asiento se guarda y el ausente es como un jugador presente que no toca nada (cobra su economía, su tablero pelea), sin que lo juegue un bot ----
  {
    const vm = require('vm');
    let T = Date.now(); // reloj simulado: el motor espera tiempo real para resolver combates y fases con plazo
    const ctx = { __SERVER__: true, module: { exports: {} }, console, setTimeout, clearTimeout, setInterval, clearInterval, Date: class extends Date { static now() { return T; } } };
    vm.createContext(ctx);
    vm.runInContext(['augments.js', 'game.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8')).join('\n'), ctx);
    const E = ctx.module.exports;
    E.serverCreate({ diff: 'normal', timer: 30, speed: 4, humans: [{ nick: 'Uno', peer: 'a', tr: 'charmander' }, { nick: 'Dos', peer: 'b', tr: 'squirtle' }] }, () => {});
    const G = E.G, uno = G.players.find(p => p.name === 'Uno'), dos = G.players.find(p => p.name === 'Dos');
    E.serverTick(.05);
    E.serverLeave('b');
    assert.strictEqual(dos.isBot, false, 'el ausente NO se convierte en bot'); assert.strictEqual(dos.away, true); assert.strictEqual(dos.remote, false);
    dos.gold = 45; // con oro, para comprobar también el interés
    const unidades = () => Object.keys(dos.board).length + dos.bench.filter(Boolean).length, unidades0 = unidades(), gold0 = dos.gold, vida0 = dos.hp;
    const r0 = G.roundIdx; let ticks = 0;
    for (; ticks < 6000 && G.roundIdx < r0 + 4 && !G.over; ticks++) { if (G.phase === 'planning') uno.ready = true; T += 50; E.serverTick(.05); if (G.resolving || G.phase === 'results') await sleep(25); } // resolveRound usa temporizadores reales
    assert(G.roundIdx >= r0 + 4, 'la partida avanza sin esperar al ausente (rondas: ' + (G.roundIdx - r0) + ')');
    assert.strictEqual(dos.isBot, false, 'sigue sin ser bot tras varias rondas');
    assert(unidades() >= unidades0, 'no vende nada; lo único que gana es el botín de las rondas salvajes que se abre solo (' + unidades0 + ' → ' + unidades() + ')');
    assert(Object.keys(dos.board).length > 0, 'su tablero sigue peleando: se le coloca lo que tenga, como a cualquier jugador que no actúa');
    assert(dos.gold >= gold0 + 20, 'la economía sigue: oro base + interés + racha (' + gold0 + ' → ' + dos.gold + ')');
    assert(dos.hp < vida0 || dos.streak > 0, 'su tablero ha peleado las rondas (vida ' + vida0 + ' → ' + dos.hp + ')');
        // aumentos: al acabar el plazo se le aplica uno al azar, como a cualquiera que no elige (2-1 es la primera ronda con aumento)
    // carrusel: el ausente no camina; cuando los presentes han elegido, se le da uno de los Pokémon que sobran (9 opciones para 8 jugadores)
    for (let i = 0; i < 12000 && G.phase !== 'carousel' && !G.over; i++) { if (G.phase === 'planning') uno.ready = true; T += 50; E.serverTick(.05); if (G.resolving || G.phase === 'results') await sleep(25); }
    assert.strictEqual(G.phase, 'carousel', 'se llega al primer carrusel (ronda ' + (G.round && G.round.s + '-' + G.round.n) + ')');
    assert(dos.augments.length >= 1, 'al ausente se le aplicó un aumento al azar en 2-1 (aumentos: ' + dos.augments.length + ')');
    const C = G.carousel, u0 = unidades();
    for (let i = 0; i < 6000 && G.carousel === C; i++) { T += 50; E.serverTick(.05); if (G.resolving) await sleep(25); }
    assert.notStrictEqual(G.carousel, C, 'el carrusel termina sin esperar al ausente');
    assert.strictEqual(C.opts.filter(o => o.taken === dos).length, 1, 'el ausente recibe exactamente uno de los sobrantes');
    assert(C.av[dos.id].carry, 'con su objeto'); assert.strictEqual(unidades(), u0 + 1, 'y ese Pokémon entra en su banquillo o tablero');
    // vuelve con otra conexión
    assert.strictEqual(E.serverRejoin('x-no-existe', 'z'), false, 'un id desconocido no recupera ningún asiento');
    assert.strictEqual(E.serverRejoin('b', 'b2'), true, 'recupera su asiento'); assert.strictEqual(dos.away, false); assert.strictEqual(dos.remote, true); assert.strictEqual(dos.peer, 'b2'); assert.strictEqual(dos.isBot, false);
    assert.strictEqual(E.serverRejoin('b', 'b3'), false, 'el asiento ya no está libre');
    // si no vuelve a tiempo, queda eliminado en el último puesto de los que siguen vivos
    E.serverLeave('b2'); const vivos = G.players.filter(p => p.alive).length; E.serverForfeit();
    assert.strictEqual(dos.alive, false); assert.strictEqual(dos.place, vivos, 'abandona en el último puesto de los vivos'); assert.strictEqual(uno.alive, true);
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
      B.emit('act', { t: 'tpos', b: idA, x: 4.5, y: 9.25 });
      // Acuse de acciones: el servidor devuelve en `aq` el número de la última acción numerada; un número inválido no lo cambia
      A.emit('act', { t: 'move', from: { i: 0 }, to: { i: 1 }, q: 41 }); A.emit('act', { t: 'lock', q: 'x' }); A.emit('act', { t: 'lock', q: -5 }); A.emit('act', { t: 'lock', q: 1e12 }); A.emit('act', { t: 'lock', q: 1.5 }); }
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
  assert.strictEqual(st.A.priv.aq, 41, 'el estado privado devuelve el número de la última acción (los inválidos se ignoran)');
  assert(lastPub.pl.every(p => ['charmander', 'bulbasaur', 'squirtle', 'dratini', 'pichu', 'abra', 'chikorita', 'eevee'].includes(p[14])), 'todos los jugadores llevan minileyenda');
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
