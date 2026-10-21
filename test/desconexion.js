'use strict';
// Desconexión y reconexión con el servidor real: la partida NO se pausa (el ausente sigue cobrando y su tablero pelea), el asiento se recupera con «rejoin»
// y, si no se vuelve a tiempo, el ausente queda eliminado en el último puesto y su resultado se apunta (desconectarse no evita perder puntos).
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'poke-tactics-desc-'));
process.env.DB_FILE = path.join(tmp, 'db.json'); process.env.REJOIN_MS = '5000'; delete process.env.DATABASE_URL;
const { server, rooms, ready } = require('../server');
const { io } = require('socket.io-client');
const sleep = ms => new Promise(r => setTimeout(r, ms));
ready.then(() => server.listen(0, async () => {
  const url = `http://localhost:${server.address().port}`;
  const post = (p, body, cookie) => fetch(url + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: url, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  const r = await post('/api/register', { user: 'Solo', pass: 'secreta1', trainer: 'pichu' });
  assert(r.status === 200 || r.status === 201, 'registro'); const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  const conn = () => { const s = io(url, { transports: ['websocket'], extraHeaders: { Cookie: cookie } }); s.st = { ri: -1, start: 0, resume: undefined, fail: null }; s.on('pub', d => { s.st.ri = d.ri; s.st.ph = d.ph; }); s.on('start', () => s.st.start++); s.on('resume', d => { if (s.st.resume === undefined) s.st.resume = d; }); s.on('rejoinfail', d => { s.st.fail = d; }); return s; };

  let S = conn(); await sleep(300);
  S.emit('create', { name: 'Desc', max: 2, diff: 'normal' }); await sleep(300);
  S.emit('start', { timer: 30, speed: 4 });
  for (let i = 0; i < 400 && S.st.ri < 1; i++) { if (S.st.ph === 'planning') S.emit('act', { t: 'ready' }); await sleep(100); }
  assert(S.st.ri >= 1, 'la partida avanza'); assert.strictEqual(rooms.size, 1);

  // 1) Se va: la partida sigue (no se pausa), nadie lo juega y puede volver a su asiento
  const G = () => [...rooms.values()][0].game.G, yo = () => G().players.find(p => p.name.startsWith('Solo'));
  const antes = S.st.ri, oro0 = yo().gold; S.disconnect(); await sleep(1500);
  assert.strictEqual(yo().isBot, false, 'no se convierte en bot'); assert.strictEqual(yo().away, true, 'queda ausente');
  assert(G().phase && !G().over, 'la partida sigue en marcha');
  S = conn(); await sleep(500);
  assert(S.st.resume && S.st.resume.round, 'el servidor avisa de la partida a medias: ' + JSON.stringify(S.st.resume));
  S.emit('rejoin'); await sleep(800);
  assert.strictEqual(S.st.fail, null, 'vuelve sin error'); assert.strictEqual(S.st.start, 1, 'recibe start');
  assert(S.st.ri >= antes, 'la partida no retrocede (ronda ' + antes + ' → ' + S.st.ri + ')'); assert.strictEqual(yo().away, false, 'vuelve a estar presente'); assert(yo().remote);
  assert.strictEqual(rooms.size, 1, 'la sala sigue viva');

  // 2) Se va y no vuelve: pasado el plazo queda eliminado en el último puesto y se apunta el resultado
  S.disconnect(); await sleep(6500);
  assert.strictEqual(rooms.size, 0, 'la sala se cierra tras el plazo');
  const h = await (await fetch(url + '/api/history', { headers: { Cookie: cookie } })).json();
  const m = (h.matches || [])[0]; assert(m, 'el resultado se apunta: ' + JSON.stringify(h).slice(0, 200));
  const place = m.place ?? (m.data && m.data.place) ?? (m.rec && m.rec.place); assert.strictEqual(place, 8, 'abandono = último puesto: ' + JSON.stringify(m).slice(0, 160));

  // 3) Ya no tiene partida a la que volver
  const T = conn(); await sleep(400); assert.strictEqual(T.st.resume, null, 'sin partida a medias'); T.emit('rejoin'); await sleep(400);
  assert(T.st.fail && T.st.fail.why, 'rejoin sin partida falla con un motivo'); T.disconnect();
  console.log('OK: pruebas de desconexión superadas'); process.exit(0);
}));
