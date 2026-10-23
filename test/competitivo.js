'use strict';
/* Pruebas del sistema competitivo (npm run test:comp):
   1) funciones puras de competitive.js (MMR, LP, ascensos, descensos, Maestro, posicionamiento, caramelos, bots);
   2) base de datos (idempotencia, historial de 6, sin historial);
   3) servidor real con Socket.io: colas, personas + bots, relleno por tiempo, duplicados, manipulación,
      un resultado procesado de verdad (recompensa una sola vez) y partida cancelada sin recompensas. */
const fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-comp-'));
process.env.DB_FILE = path.join(tmp, 'db.json'); delete process.env.DATABASE_URL;
process.env.QUEUE_FILL_MS = '1500'; // en las pruebas la cola se completa con bots a los 1,5 s
const C = require('../competitive');
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('FALLO:', m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const opps7 = (mmr, myPlace) => [1, 2, 3, 4, 5, 6, 7, 8].filter(p => p !== myPlace).map(place => ({ mmr, place }));

// ---------- 1. funciones puras ----------
{ // usuario nuevo en Normal: sube su MMR normal con un 1.º, el clasificatorio no cambia, recibe 100 caramelos
  const { comp, rec } = C.applyMatch({}, { mode: 'normal', place: 1, opps: opps7(1000, 1) });
  ok(comp.nmmr > 1000 && comp.rmmr === 1000, 'Normal: el 1.º sube el MMR normal y no toca el clasificatorio');
  ok(rec.candies === 100 && comp.candies === 100, 'Normal: 100 caramelos por el 1.º'); ok(rec.lp === undefined, 'Normal: sin LP');
  const b = C.applyMatch({}, { mode: 'normal', place: 8, opps: opps7(1000, 8) }); ok(b.comp.nmmr < 1000 && b.rec.candies === 65, 'Normal: el 8.º baja el MMR y recibe 65 caramelos'); }
{ // adaptativo: rachas malas bajan más que un mal resultado aislado, pero nunca de golpe
  let c = {}; for (let i = 0; i < 4; i++) c = C.applyMatch(c, { mode: 'normal', place: 7, opps: opps7(1000, 7) }).comp;
  ok(c.nmmr < 1000 - 60 && c.nmmr > 1000 - 4 * 45, `Normal: cuatro 7.º seguidos bajan el MMR de forma gradual (${c.nmmr})`);
  ok(C.skillFor('normal', c.nmmr) !== 'experto', 'Normal: tras perder, bots de nivel más bajo');
  // ganar contra rivales muy inferiores casi no sube
  const easy = C.applyMatch({ nmmr: 1400 }, { mode: 'normal', place: 1, opps: opps7(800, 1) }).comp.nmmr - 1400;
  const hard = C.applyMatch({ nmmr: 1400 }, { mode: 'normal', place: 1, opps: opps7(1600, 1) }).comp.nmmr - 1400;
  ok(easy < hard && easy < 10, `Normal: ganar a rivales muy inferiores sube poco (${easy} frente a ${hard})`); }
{ // posicionamiento: 3 partidas, sin rango hasta la tercera; determinista
  let c = {}; const seq = [2, 4, 3]; const recs = [];
  for (const p of seq) { const r = C.applyMatch(c, { mode: 'ranked', place: p, opps: opps7(1000, p) }); c = r.comp; recs.push(r.rec); }
  ok(recs[0].placement.done === 1 && recs[1].placement.done === 2 && !recs[1].revealed, 'Clasificatoria: posicionamiento 1/3 y 2/3 sin rango');
  ok(C.publicComp({ placed: 2, ladder: null }).ranked.placing === true, 'Clasificatoria: durante el posicionamiento no hay insignia');
  ok(recs[2].revealed && c.ladder >= C.CFG.PLACE_MIN && c.ladder <= C.CFG.PLACE_MAX, `Clasificatoria: la 3.ª revela un rango de entrada (${C.rankLabel(recs[2].revealed)})`);
  let c2 = {}; for (const p of seq) c2 = C.applyMatch(c2, { mode: 'ranked', place: p, opps: opps7(1000, p) }).comp; ok(c2.ladder === c.ladder, 'Clasificatoria: mismo historial → mismo rango (determinista)');
  ok(c.nmmr === 1000, 'Clasificatoria: no toca el MMR normal');
  let good = {}, bad = {}; for (let i = 0; i < 3; i++) { good = C.applyMatch(good, { mode: 'ranked', place: 1, opps: opps7(1000, 1) }).comp; bad = C.applyMatch(bad, { mode: 'ranked', place: 8, opps: opps7(1000, 8) }).comp; }
  ok(good.ladder > bad.ladder && good.ladder <= C.CFG.PLACE_MAX && bad.ladder >= C.CFG.PLACE_MIN, `Clasificatoria: quien rinde mejor entra más arriba, con límites (${C.rankLabel(C.rankOf(good.ladder))} / ${C.rankLabel(C.rankOf(bad.ladder))})`);
  ok(C.rankOf(good.ladder).league !== 'iron' || C.rankOf(bad.ladder).league === 'iron', 'Clasificatoria: no todos entran en Hierro'); }
{ // LP: 1.º gana mucho, 8.º pierde; más ganancia contra rivales más fuertes; promoción y descenso
  const base = { ladder: 1250, rmmr: C.mmrOfLadder(1250), placed: 3, rgames: 10 };
  const w = C.applyMatch(base, { mode: 'ranked', place: 1, opps: opps7(base.rmmr, 1) }).rec, l = C.applyMatch(base, { mode: 'ranked', place: 8, opps: opps7(base.rmmr, 8) }).rec;
  ok(w.lp >= 20 && l.lp < 0, `LP: 1.º +${w.lp}, 8.º ${l.lp}`); ok(w.lp > C.applyMatch(base, { mode: 'ranked', place: 4, opps: opps7(base.rmmr, 4) }).rec.lp, 'LP: el 1.º gana más que el 4.º');
  const strong = C.applyMatch(base, { mode: 'ranked', place: 1, opps: opps7(base.rmmr + 250, 1) }).rec.lp; ok(strong > w.lp, `LP: ganar a rivales más fuertes da más (${strong} > ${w.lp})`);
  const hiMMR = C.applyMatch({ ...base, rmmr: base.rmmr + 300 }, { mode: 'ranked', place: 1, opps: opps7(base.rmmr, 1) }).rec.lp; ok(hiMMR > w.lp, 'LP: con MMR por encima del rango se sube más rápido');
  for (const p of [1, 2, 3, 4, 5, 6, 7, 8]) { const r = C.applyMatch(base, { mode: 'ranked', place: p, opps: opps7(base.rmmr, p) }).rec; ok(r.lp >= C.CFG.LP_MIN && r.lp <= C.CFG.LP_MAX && (p <= 4 ? r.lp > 0 : r.lp < 0), `LP acotado y con signo correcto en el puesto ${p} (${r.lp})`); }
  const div = C.applyMatch({ ...base, ladder: 1295 }, { mode: 'ranked', place: 1, opps: opps7(base.rmmr, 1) }).rec;
  ok(div.promoted && div.rankBefore.div === 'III' && div.rankAfter.div === 'II' && div.rankAfter.name === 'Plata', `asciende de división: ${C.rankLabel(div.rankBefore)} → ${C.rankLabel(div.rankAfter)}`);
  const pro = C.applyMatch({ ...base, ladder: 1495 }, { mode: 'ranked', place: 1, opps: opps7(base.rmmr, 1) }).rec;
  ok(pro.promoted && pro.rankBefore.div === 'I' && pro.rankAfter.name === 'Oro' && pro.rankAfter.div === 'V', `ascenso de liga con el exceso de LP: ${C.rankLabel(pro.rankBefore)} → ${C.rankLabel(pro.rankAfter)}`);
  const dem = C.applyMatch({ ...base, ladder: 1505 }, { mode: 'ranked', place: 8, opps: opps7(base.rmmr, 8) }).rec;
  ok(dem.demoted && dem.rankAfter.name === 'Plata' && dem.rankAfter.div === 'I', `desciende: ${C.rankLabel(dem.rankBefore)} → ${C.rankLabel(dem.rankAfter)}`);
  const floor = C.applyMatch({ ...base, ladder: 10, rmmr: 700 }, { mode: 'ranked', place: 8, opps: opps7(700, 8) }).comp; ok(floor.ladder === 0, 'nunca LP negativos (Hierro V con 0 LP)'); }
{ // Maestro sin divisiones y su descenso a Diamante I
  const r = C.rankOf(3620); ok(r.league === 'master' && r.div === '' && r.lp === 120, 'Maestro: sin división, 120 LP');
  ok(C.rankOf(3700).league === 'grandmaster' && C.rankOf(4000).league === 'challenger', 'Gran Maestro y Retador por LP');
  const m = C.applyMatch({ ladder: 3510, rmmr: 1960, placed: 3, rgames: 50 }, { mode: 'ranked', place: 8, opps: opps7(1960, 8) }).rec;
  ok(m.demoted && m.rankAfter.league === 'diamond' && m.rankAfter.div === 'I', `de Maestro a ${C.rankLabel(m.rankAfter)}`);
  ok(C.LEAGUES.length === 10 && C.LEAGUES.filter(l => !l.apex).length === 7, '10 ligas; de Hierro a Diamante con 5 divisiones');
  ok(C.nextOf(3499).name === 'Maestro', 'Diamante I → Maestro'); }
{ // bots: en Clasificatoria mejores que en Normal para el mismo MMR; nunca se mezclan los MMR
  const n = C.botsFor('normal', [1000], 7), r = C.botsFor('ranked', [1000], 7);
  ok(n.length === 7 && r.every(b => C.SKILLS.indexOf(b.skill) >= 2), 'bots de Clasificatoria de nivel avanzado o más');
  ok(C.SKILLS.indexOf(r[0].skill) > C.SKILLS.indexOf(n[0].skill), 'en Clasificatoria los bots son mejores que en Normal');
  const pc = C.publicComp({ nmmr: 1234, rmmr: 1500, ladder: 800 }); ok(pc.nmmr === undefined && pc.rmmr === undefined && JSON.stringify(pc).indexOf('1234') < 0, 'el navegador nunca recibe el MMR'); }
{ // caramelos: tabla configurada, todos los puestos reciben algo y nunca negativos
  ok(C.CFG.CANDY.join() === '100,95,90,85,80,75,70,65', 'caramelos por puesto'); ok(C.normComp({ candies: 'x' }).candies === 0, 'saldo inválido → 0 (nunca NaN)'); }

// ---------- 2 y 3. base de datos y servidor ----------
const { server, ready, rooms, queues } = require('../server');
const db = require('../db');
const { io } = require('socket.io-client');
ready.then(() => server.listen(0, async () => {
  const url = `http://localhost:${server.address().port}`;
  const post = (p, body, cookie) => fetch(url + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  const cookieOf = r => (r.headers.get('set-cookie') || '').split(';')[0];
  const reg = async (u, tr) => cookieOf(await post('/api/register', { user: u, pass: 'secreta1', trainer: tr || 'bulbasaur' }));
  const me = async ck => (await (await fetch(url + '/api/me', { headers: { Cookie: ck } })).json()).user;
  const hist = async ck => (await (await fetch(url + '/api/history', { headers: { Cookie: ck } })).json()).matches;
  const sock = ck => new Promise(res => { const s = io(url, { transports: ['websocket'], extraHeaders: { Cookie: ck } }); s.on('connect', () => res(s)); });
  const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(50); } return null; };
  try {
    // idempotencia y límite de 6 en la base
    const ckX = await reg('Xenia'); const X = await me(ckX);
    ok(X.comp && X.comp.candies === 0 && X.comp.ranked.placing, 'usuario nuevo: 0 caramelos y en posicionamiento');
    ok((await hist(ckX)).length === 0, 'sin historial: lista vacía');
    const fn = comp => C.applyMatch(comp, { mode: 'normal', place: 3, opps: opps7(1000, 3) });
    const r1 = await db.recordMatch(X.id, 'm-1', 'normal', fn), r2 = await db.recordMatch(X.id, 'm-1', 'normal', fn);
    ok(r1 && !r1.dup && r2 && r2.dup, 'el mismo resultado no se procesa dos veces');
    ok((await me(ckX)).comp.candies === 90, 'los caramelos se dan una sola vez (90)');
    for (let i = 2; i <= 8; i++) await db.recordMatch(X.id, 'm-' + i, 'normal', fn);
    const h = await hist(ckX); ok(h.length === 6 && h[0].matchId === 'm-8' && h[5].matchId === 'm-3', 'historial: las 6 más recientes, de la más nueva a la más antigua');
    ok((await db.matches(X.id, 100)).length === 8, 'los registros antiguos siguen guardados');
    // perfil: estadísticas por modo calculadas de la tabla de partidas, mejor rango y nivel de cuenta
    const ag = await db.modeStats(X.id); ok(ag.normal && ag.normal.g === 8 && ag.normal.t4 === 8 && ag.normal.sp === 24 && ag.normal.cd === 720 && !ag.ranked, `estadísticas por modo de la base (${JSON.stringify(ag)})`);
    const ckY = await reg('Yago'), Y = await me(ckY); const rk = (pl, i) => comp => C.applyMatch(comp, { mode: 'ranked', place: pl, opps: opps7(1000, pl) });
    for (let i = 0; i < 6; i++) await db.recordMatch(Y.id, 'y-' + i, 'ranked', rk(i < 4 ? 1 : 8));
    await db.recordMatch(Y.id, 'y-c', 'custom', comp => C.applyMatch(comp, { mode: 'custom', place: 5, opps: opps7(1000, 5) }));
    const PY = (await (await fetch(url + '/api/profile/Yago', { headers: { Cookie: ckY } })).json()).profile;
    ok(PY.byMode.ranked.games === 6 && PY.byMode.ranked.wins === 4 && PY.byMode.ranked.avg === 3.3 && PY.byMode.custom.games === 1 && PY.byMode.normal.games === 0, 'perfil: partidas, victorias y puesto medio por modo');
    ok(PY.peak && PY.peak.ladder > PY.ranked.ladder, `perfil: el mejor rango recuerda el pico (${C.rankLabel(PY.peak)} frente a ${C.rankLabel(PY.ranked)})`);
    ok(PY.account.level === 1 + Math.floor((4 * 100 + 2 * 65 + 80) / 500) && PY.history.length === 7, 'perfil: nivel de cuenta por caramelos ganados y 7 partidas en el historial');
    ok(PY.history.every(m => m.mmrBefore === undefined && m.participants === undefined && m.why === undefined && m.oppAvg === undefined) && !/mmr/i.test(JSON.stringify(PY)), 'perfil: el historial no lleva MMR, rivales ni el porqué de los LP');
    ok(PY.history[1].lp < 0 && PY.history[0].mode === 'custom' && PY.history.some(m => m.revealed), 'perfil: LP, rango revelado y modo de cada partida');
    // nombres de los rivales: nunca el de una cuenta real
    { const vm = require('vm'), ctx = { __SERVER__: true, module: { exports: {} }, console, setTimeout, clearTimeout, setInterval, clearInterval }; vm.createContext(ctx);
      vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/augments.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '../public/game.js'), 'utf8'), ctx); const E = ctx.module.exports;
      const libres = []; for (let i = 0; i < 30; i++) libres.push(E.generateBotName(libres)); const taken = new Set(libres.slice(0, 25).map(n => n.toLowerCase()));
      let bad = 0; for (let i = 0; i < 20; i++) { E.newGame({ mp: true, server: true, humans: [], taken: n => taken.has(n.toLowerCase()) }); bad += E.G.players.filter(p => taken.has(p.name.toLowerCase())).length; }
      ok(bad === 0, 'los rivales generados nunca se llaman como una cuenta real');
      ok(db.nameTaken('xenia') && db.nameTaken('YAGO') && !db.nameTaken('Nadie_123'), 'nameTaken conoce las cuentas sin distinguir mayúsculas');
      // pantalla de resultados (datos): los 8 con la misma forma, sin ids de cuenta ni MMR, y pocos KB
      const B = E.serverBoards(); ok(B.length === 8 && B.every(b => b.comp && Array.isArray(b.comp.units) && 'tac' in b && Array.isArray(b.tf) && !('uid' in b) && !('isBot' in b) && !('skill' in b)), 'tableros de los 8: misma forma para todos y sin marcas de bot');
      ok(JSON.stringify(B).length < 6000, `tableros de los 8: ${JSON.stringify(B).length} bytes`); }
    // manipulación: no se aceptan resultados del navegador ni colas inválidas
    ok((await post('/api/result', { place: 1 }, ckX)).status === 410, 'POST /api/result rechazado (los resultados los apunta el servidor)');
    const sx = await sock(ckX); const errs = []; sx.on('err', m => errs.push(m)); const qx = []; sx.on('queue', d => qx.push(d));
    sx.emit('queue', { mode: 'hack' }); sx.emit('queue', { mode: 'ranked', lp: 999, mmr: 5000 }); await sleep(200); sx.emit('queue', { mode: 'normal' }); await sleep(200);
    ok(queues.ranked.length === 1 && queues.normal.length === 0, 'modo inválido ignorado y una sola cola por usuario');
    ok(queues.ranked[0].mmr === 1000, 'el MMR de la cola sale de la cuenta, no del mensaje');
    ok(errs.some(m => /cola/.test(m)), 'aviso al intentar entrar en otra cola');
    sx.emit('unqueue'); await sleep(100); ok(!queues.ranked.length, 'salir de la cola');
    // cola sin más personas: a los 1,5 s empieza con 7 bots
    sx.emit('queue', { mode: 'ranked' }); const matched = await until(() => qx.find(d => d.state === 'matched'), 6000);
    ok(matched && matched.humans === 1, 'cola vacía: partida con 1 persona y 7 bots tras la espera');
    const room = [...rooms.values()].find(r => r.seats.some(s => s.uid === X.id));
    ok(room && room.mode === 'ranked' && room.botInfo.length === 7 && room.matchId, 'la sala clasificatoria tiene id de partida y 7 bots');
    const G = room.game.G; ok(G.players.filter(p => p.isBot).length === 7 && G.players.filter(p => p.isBot).every(p => !/bot|🤖/i.test(p.name) && p.skill), 'los rivales no se delatan en el nombre y tienen nivel');
    ok(G.players.filter(p => p.isBot).every(p => ['avanzado', 'experto', 'maestro'].includes(p.skill)), 'bots de Clasificatoria de nivel alto');
    // resultado real: se fuerza la eliminación en el motor del servidor y se espera el registro
    const res = []; sx.on('result', d => res.push(d));
    const meP = G.players.find(p => p.peer === sx.id); meP.hp = -999; G.timer = 0;
    await until(() => G.phase === 'combat', 5000); G.resolveNotBefore = 0;
    const got = await until(() => res[0], 15000);
    ok(got && got.mode === 'ranked' && got.rec.place === 8 && got.rec.candies === 65, `resultado del servidor: puesto ${got && got.rec.place}, ${got && got.rec.candies} caramelos`);
    ok(got && got.rec.placement && got.rec.placement.done === 1 && got.comp.ranked.placing, 'primera partida clasificatoria: posicionamiento 1/3');
    ok(got && got.rec.comp && Array.isArray(got.rec.comp.units) && got.rec.participants.length === 8 && got.rec.participants.every(p => !('bot' in p)), 'el registro guarda la composición y no marca bots');
    // pantalla de resultados: los 8 jugadores, misma forma para personas y rivales generados, sin ids ni MMR
    const B = got && got.board; const KEYS = 'a,lvl,me,n,pl,rd,t,tac,tf,u';
    ok(Array.isArray(B) && B.length === 8 && B.every(b => Object.keys(b).sort().join() === KEYS), 'resultado: 8 tableros con las mismas claves para todos');
    ok(B && B.filter(b => b.me).length === 1 && B.find(b => b.me).pl === 8 && B.find(b => b.me).n === 'Xenia', 'resultado: mi fila, con mi puesto y mi nombre de cuenta');
    ok(B && B.filter(b => !b.me).every(b => b.pl === 0 && b.u.length >= 0), 'resultado: los que siguen vivos van sin puesto (en juego)');
    ok(B && !/uid|mmr|skill|isBot|peer/i.test(JSON.stringify(B)) && JSON.stringify(B).length < 8000, `resultado: sin ids, MMR ni nivel de bot (${B && JSON.stringify(B).length} bytes)`);
    // si el navegador no confirma el resultado (corte justo al terminar), se reenvía al volver a conectar; tras confirmarlo, ya no
    const s2 = await new Promise(res => { const s = io(url, { transports: ['websocket'], extraHeaders: { Cookie: ckX } }); const got2 = []; s.on('result', d => got2.push(d)); s.on('connect', () => setTimeout(() => res({ s, got2 }), 300)); });
    ok(s2.got2.length === 1 && s2.got2[0].late && s2.got2[0].board.length === 8, 'resultado reenviado al reconectar');
    s2.s.emit('resultSeen'); await sleep(150); s2.s.close();
    const s3 = await new Promise(res => { const s = io(url, { transports: ['websocket'], extraHeaders: { Cookie: ckX } }); const got3 = []; s.on('result', d => got3.push(d)); s.on('connect', () => setTimeout(() => res({ s, got3 }), 300)); });
    ok(!s3.got3.length, 'tras confirmarlo, no se vuelve a enviar'); s3.s.close();
    const h2 = await hist(ckX); ok(h2[0].mode === 'ranked' && h2[0].data.place === 8, 'el historial refleja exactamente el resultado');
    const cand = (await me(ckX)).comp.candies;
    // reprocesar el mismo resultado (reintento): no cambia nada
    for (const s of room.seats) s.recorded = false; room.game && (await sleep(400));
    await until(async () => (await hist(ckX)).length >= 6, 2000); await sleep(600);
    ok((await me(ckX)).comp.candies === cand, 'reintento del mismo resultado: no se duplican caramelos');
    ok((await db.matches(X.id, 100)).filter(m => m.matchId === room.matchId).length === 1, 'la partida aparece una sola vez');
    sx.close();
    // dos personas en la cola Normal: misma partida, 6 bots
    const ckA = await reg('Amaro'), ckB = await reg('Berta'); const sa = await sock(ckA), sb = await sock(ckB); const qa = [], qb = []; sa.on('queue', d => qa.push(d)); sb.on('queue', d => qb.push(d));
    sa.emit('queue', { mode: 'normal' }); sb.emit('queue', { mode: 'normal' });
    await until(() => qa.find(d => d.state === 'matched') && qb.find(d => d.state === 'matched'), 6000);
    const r2room = [...rooms.values()].find(r => r.mode === 'normal' && r.seats.length === 2);
    ok(r2room && r2room.botInfo.length === 6 && r2room.game.G.players.filter(p => !p.isBot).length === 2, 'Normal: 2 personas reales y 6 bots en la misma partida');
    ok(r2room && r2room.botInfo.every(b => C.SKILLS.indexOf(b.skill) <= 1), 'Normal con MMR inicial: bots de nivel bajo');
    // desconexión en plena partida: el asiento queda reservado como ausente y NADIE juega por esa persona (ni bot)
    const ckBid = (await me(ckB)).id; sb.close(); await sleep(300);
    const bP = r2room.game.G.players.find(p => p.name.startsWith('Berta')); ok(bP && !bP.isBot && bP.away && !bP.remote, 'al desconectarse queda ausente: no se convierte en bot ni nadie juega por esa persona');
    // partida cancelada antes de terminar: sin recompensas
    const before = (await db.matches(ckBid, 100)).length; r2room.timer && clearInterval(r2room.timer); rooms.delete(r2room.code);
    await sleep(300); ok((await db.matches(ckBid, 100)).length === before, 'partida cancelada: no hay registro ni caramelos');
    sa.close();
    // reinicio: la cola vive en memoria; al desconectarse se vacía y no queda nadie colgado
    const ckR = await reg('Rocio'); const sr = await sock(ckR); sr.emit('queue', { mode: 'normal' }); await sleep(150); ok(queues.normal.length === 1, 'en cola'); sr.close(); await sleep(250); ok(queues.normal.length === 0, 'al perder la conexión (o reiniciar el servidor) sale de la cola');
  } catch (e) { fails++; console.log('FALLO (excepción):', e); }
  console.log(`\n${checks - fails}/${checks} comprobaciones correctas`);
  if (fails) { console.log('FALLO: pruebas del sistema competitivo'); process.exit(1); }
  console.log('OK: pruebas del sistema competitivo superadas'); process.exit(0);
}));
